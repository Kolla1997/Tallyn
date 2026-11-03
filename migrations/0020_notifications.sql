-- 0020: In-app notifications (#267, part of #55). Decided by Dinesh
-- 2026-11-03: a bell top right of the page holds every alert; alerts that
-- need action (a bank to reconnect) also show as a strip on Home until done.
--
-- Alerts are written by triggers, so the bank sync, invites and anything
-- else that changes these tables raise them the same way. Each alert goes to
-- one person (user_id) and only that person reads it. For now an alert about
-- an account goes to its owner only: who else may see it is a sharing
-- question (can_see_member_data needs a signed-in viewer), left for later.
--
-- Alert text never holds account numbers. The app builds the sentence from
-- kind and data (merchant, amount, account name, person's name).
--
-- Starting amounts, until Settings → Notifications (#268) lets people change
-- them: a big purchase is over $500, a low balance is under $100.

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  user_id       uuid not null,
  kind          text not null check (kind in ('big_purchase', 'low_balance', 'reconnect', 'joined')),
  ref_id        uuid not null, -- the transaction, account, bank or member it's about
  data          jsonb not null default '{}'::jsonb,
  needs_action  boolean not null default false,
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  resolved_at   timestamptz, -- an action alert that's been dealt with leaves Home
  -- Leaving the household takes your alerts with you.
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);

-- One alert per thing: a re-sync or a repeat dip doesn't stack them, except
-- low balance and reconnect, which can come back after they're cleared.
create unique index notifications_once on public.notifications (user_id, kind, ref_id)
  where kind in ('big_purchase', 'joined') or resolved_at is null;
create index notifications_user_created on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- People only mark their own alerts read; triggers write them.
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Thresholds in minor units (USD cents).
create or replace function public.notify_big_purchase_minor() returns bigint
language sql immutable as $$ select 50000::bigint $$;
create or replace function public.notify_low_balance_minor() returns bigint
language sql immutable as $$ select 10000::bigint $$;

-- A big purchase: a settled transaction over the amount, from the last few
-- days (a newly linked bank brings up to two years of history, which mustn't
-- alert). Pending ones wait: Plaid replaces them with a new ID when they
-- settle, which would alert twice.
create or replace function public.notify_big_purchase() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pending or new.amount_minor <= public.notify_big_purchase_minor() or new.date < current_date - 3 then
    return new;
  end if;
  insert into public.notifications (household_id, user_id, kind, ref_id, data)
  select new.household_id, a.owner_user_id, 'big_purchase', new.id,
         jsonb_build_object('merchant', coalesce(new.merchant_name, new.name), 'amount_minor', new.amount_minor,
                            'currency', new.currency, 'account', a.name, 'account_id', a.id)
  from public.accounts a
  where a.id = new.account_id
  on conflict do nothing;
  return new;
end;
$$;

create trigger transactions_notify
  after insert or update of pending on public.transactions
  for each row execute function public.notify_big_purchase();

-- Low balance: a cash account's balance falls under the amount. Only on a
-- drop from a known balance at or above it, so a first pull doesn't alert
-- and staying low doesn't repeat. Climbing back clears it.
create or replace function public.notify_low_balance() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  low bigint := public.notify_low_balance_minor();
begin
  if new.type <> 'depository' or new.current_balance_minor is null then
    return new;
  end if;
  if new.current_balance_minor < low and old.current_balance_minor >= low then
    insert into public.notifications (household_id, user_id, kind, ref_id, data)
    values (new.household_id, new.owner_user_id, 'low_balance', new.id,
            jsonb_build_object('account', new.name, 'balance_minor', new.current_balance_minor,
                               'threshold_minor', low, 'currency', new.currency))
    on conflict do nothing;
  elsif new.current_balance_minor >= low then
    update public.notifications set resolved_at = now()
    where user_id = new.owner_user_id and kind = 'low_balance' and ref_id = new.id and resolved_at is null;
  end if;
  return new;
end;
$$;

create trigger accounts_notify
  after update of current_balance_minor on public.accounts
  for each row execute function public.notify_low_balance();

-- A bank that needs signing in again: an action alert for the person who
-- linked it, cleared when it's active again (#51) or unlinked.
create or replace function public.notify_reconnect() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.notifications set resolved_at = now()
    where kind = 'reconnect' and ref_id = old.id and resolved_at is null;
    return old;
  end if;
  if new.status <> 'needs_reauth' then
    update public.notifications set resolved_at = now()
    where kind = 'reconnect' and ref_id = new.id and resolved_at is null;
  elsif old.status is distinct from 'needs_reauth' then
    insert into public.notifications (household_id, user_id, kind, ref_id, data, needs_action)
    values (new.household_id, new.owner_user_id, 'reconnect', new.id,
            jsonb_build_object('bank', coalesce(new.institution_name, 'Your bank')), true)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger plaid_items_notify
  after update of status or delete on public.plaid_items
  for each row execute function public.notify_reconnect();

-- Someone joined: tells everyone already in the household. The first member
-- (who made it) has no one to tell.
create or replace function public.notify_joined() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (household_id, user_id, kind, ref_id, data)
  select new.household_id, m.user_id, 'joined', new.user_id,
         jsonb_build_object('name', coalesce(nullif(p.display_name, ''), 'Someone'), 'household', h.name)
  from public.household_members m
  join public.households h on h.id = new.household_id
  left join public.profiles p on p.id = new.user_id
  where m.household_id = new.household_id and m.user_id <> new.user_id
  on conflict do nothing;
  return new;
end;
$$;

create trigger household_members_notify
  after insert on public.household_members
  for each row execute function public.notify_joined();

revoke all on function public.notify_big_purchase() from public, anon, authenticated;
revoke all on function public.notify_low_balance() from public, anon, authenticated;
revoke all on function public.notify_reconnect() from public, anon, authenticated;
revoke all on function public.notify_joined() from public, anon, authenticated;
