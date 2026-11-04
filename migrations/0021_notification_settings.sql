-- 0021: Settings → Notifications (#268, part of #55). Dinesh picked draft C
-- (drafts/268-notification-settings.html) and agreed who hears what on
-- 2026-11-03:
--
--   - Each person sets their own alerts: big purchase and low balance on or
--     off, with their own amounts; someone joining on or off. A bank that
--     needs reconnecting always alerts its owner.
--   - Parents: owners and adults get their teens' and children's big
--     purchase and reconnect alerts (never low balance). Alerts only go one
--     way: a child never hears about a parent's accounts.
--   - Partners: off by default. One choice shares all your alerts with one
--     owner or adult, and only for what you already share with them (big
--     purchases need 'transactions', low balance needs 'balances', ADR 0007).
--     A partner isn't told to reconnect your bank: only you can.
--
-- Each person's own switches and amounts decide whether an alert reaches
-- them, so a parent who turned big purchases off isn't told about the kids'
-- either. Email choices are kept for #269; nothing is emailed yet.

create table public.notification_settings (
  household_id        uuid not null,
  user_id             uuid not null,
  big_purchase        boolean not null default true,
  big_purchase_minor  bigint not null default 50000 check (big_purchase_minor > 0 and big_purchase_minor <= 100000000000),
  low_balance         boolean not null default true,
  low_balance_minor   bigint not null default 10000 check (low_balance_minor > 0 and low_balance_minor <= 100000000000),
  joined              boolean not null default true,
  share_with          uuid,
  email_reconnect     boolean not null default false, -- used by #269
  email_payment_due   boolean not null default false, -- used by #269
  updated_at          timestamptz not null default now(),
  primary key (household_id, user_id),
  check (share_with is distinct from user_id),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade,
  -- The partner leaving stops the sharing.
  foreign key (household_id, share_with) references public.household_members (household_id, user_id) on delete set null (share_with)
);

create trigger notification_settings_set_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();

alter table public.notification_settings enable row level security;

-- Only owners and adults can be a partner: teens and children see only
-- their own money.
create or replace function public.can_be_alert_partner(hid uuid, uid uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.household_members m
                 where m.household_id = hid and m.user_id = uid and m.role in ('owner', 'adult'))
$$;

create policy notification_settings_select on public.notification_settings
  for select to authenticated
  using (user_id = auth.uid());

create policy notification_settings_insert on public.notification_settings
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_household_member(household_id)
              and (share_with is null or public.can_be_alert_partner(household_id, share_with)));

create policy notification_settings_update on public.notification_settings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (share_with is null or public.can_be_alert_partner(household_id, share_with)));

revoke all on public.notification_settings from public, anon, authenticated;
grant select, insert, update on public.notification_settings to authenticated;

-- One person's settings, with the defaults when they haven't saved any.
create or replace function public.alert_settings(hid uuid, uid uuid)
returns table (big_purchase boolean, big_purchase_minor bigint, low_balance boolean, low_balance_minor bigint, joined boolean, share_with uuid)
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(s.big_purchase, true), coalesce(s.big_purchase_minor, 50000),
         coalesce(s.low_balance, true), coalesce(s.low_balance_minor, 10000),
         coalesce(s.joined, true), s.share_with
  from (select 1) one
  left join public.notification_settings s on s.household_id = hid and s.user_id = uid
$$;

-- Who hears about something of owner_id's: the owner; their parents when
-- p_parents and the owner is a teen or child; and their chosen partner when
-- p_share names a category the owner shares with that partner.
create or replace function public.alert_recipients(hid uuid, owner_id uuid, p_parents boolean, p_share text)
returns table (user_id uuid)
language sql stable
security definer
set search_path = ''
as $$
  select owner_id
  union
  select m.user_id
  from public.household_members m
  where p_parents and m.household_id = hid and m.role in ('owner', 'adult') and m.user_id <> owner_id
    and exists (select 1 from public.household_members k
                where k.household_id = hid and k.user_id = owner_id and k.role in ('teen', 'child'))
  union
  select st.share_with
  from public.alert_settings(hid, owner_id) st
  where p_share is not null and st.share_with is not null
    and public.can_be_alert_partner(hid, st.share_with)
    and exists (select 1 from public.shares s
                where s.household_id = hid and s.owner_user_id = owner_id
                  and s.viewer_user_id = st.share_with and s.category = p_share)
$$;

-- The owner's name, added to an alert for anyone else ("Mia spent …").
create or replace function public.alert_person(owner_id uuid, recipient uuid) returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select case when recipient = owner_id then '{}'::jsonb
              else jsonb_build_object('person', coalesce((select nullif(p.display_name, '') from public.profiles p where p.id = owner_id), 'Someone'))
         end
$$;

create or replace function public.notify_big_purchase() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
begin
  if new.pending or new.amount_minor <= 0 or new.date < current_date - 3 then
    return new;
  end if;
  select acc.id, acc.name, acc.owner_user_id into a from public.accounts acc where acc.id = new.account_id;
  insert into public.notifications (household_id, user_id, kind, ref_id, data)
  select new.household_id, r.user_id, 'big_purchase', new.id,
         jsonb_build_object('merchant', coalesce(new.merchant_name, new.name), 'amount_minor', new.amount_minor,
                            'currency', new.currency, 'account', a.name, 'account_id', a.id)
         || public.alert_person(a.owner_user_id, r.user_id)
  from public.alert_recipients(new.household_id, a.owner_user_id, true, 'transactions') r
  cross join lateral public.alert_settings(new.household_id, r.user_id) st
  where st.big_purchase and new.amount_minor > st.big_purchase_minor
  on conflict do nothing;
  return new;
end;
$$;

-- Low balance: the owner and a sharing partner, each at their own amount,
-- on a drop from at or above it. Climbing back over clears it.
create or replace function public.notify_low_balance() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type <> 'depository' or new.current_balance_minor is null then
    return new;
  end if;
  insert into public.notifications (household_id, user_id, kind, ref_id, data)
  select new.household_id, r.user_id, 'low_balance', new.id,
         jsonb_build_object('account', new.name, 'balance_minor', new.current_balance_minor,
                            'threshold_minor', st.low_balance_minor, 'currency', new.currency)
         || public.alert_person(new.owner_user_id, r.user_id)
  from public.alert_recipients(new.household_id, new.owner_user_id, false, 'balances') r
  cross join lateral public.alert_settings(new.household_id, r.user_id) st
  where st.low_balance and new.current_balance_minor < st.low_balance_minor
    and old.current_balance_minor >= st.low_balance_minor
  on conflict do nothing;
  update public.notifications n set resolved_at = now()
  where n.kind = 'low_balance' and n.ref_id = new.id and n.resolved_at is null
    and new.current_balance_minor >= (select st.low_balance_minor from public.alert_settings(new.household_id, n.user_id) st);
  return new;
end;
$$;

-- A bank to reconnect: an action alert for its owner; their parents hear
-- too when it's a teen's or child's. Cleared when it's active again or gone.
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
    select new.household_id, r.user_id, 'reconnect', new.id,
           jsonb_build_object('bank', coalesce(new.institution_name, 'Your bank')) || public.alert_person(new.owner_user_id, r.user_id),
           r.user_id = new.owner_user_id
    from public.alert_recipients(new.household_id, new.owner_user_id, true, null) r
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Someone joined: everyone else in the household who keeps this alert on.
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
  cross join lateral public.alert_settings(new.household_id, m.user_id) st
  where m.household_id = new.household_id and m.user_id <> new.user_id and st.joined
  on conflict do nothing;
  return new;
end;
$$;

-- The old fixed amounts are now each person's settings.
drop function if exists public.notify_big_purchase_minor();
drop function if exists public.notify_low_balance_minor();

revoke all on function public.can_be_alert_partner(uuid, uuid) from public, anon;
revoke all on function public.alert_settings(uuid, uuid) from public, anon, authenticated;
revoke all on function public.alert_recipients(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.alert_person(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_be_alert_partner(uuid, uuid) to authenticated;
