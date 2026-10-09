-- 0005_bank_sync: the bank sync's system role, and transaction location and time (#9)
--
-- 1. tallyn_sync: the narrow system role from ADR 0002. The backend's login
--    role switches to it (SET LOCAL ROLE) only inside internal/sync; request
--    handlers never do. It can read encrypted tokens and cursors, and write
--    accounts and transactions. It has no access to profiles, households or
--    members, and can't create or delete bank links.
-- 2. transaction_details: when and where a purchase happened. Kept in its own
--    table so it can be more private than the transaction itself: visible
--    only to the person who made it, plus household owners for teens and
--    children (decided 2026-10-09). One function, can_see_whereabouts(),
--    decides, so sharing settings (#28) can widen it later.

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------

alter table public.plaid_items add column last_synced_at timestamptz;

alter table public.transactions
  add column payment_channel text check (payment_channel in ('online', 'in store', 'other'));

-- ---------------------------------------------------------------------------
-- transaction_details: time and location
-- ---------------------------------------------------------------------------

create table public.transaction_details (
  transaction_id uuid primary key references public.transactions (id) on delete cascade,
  authorized_at  timestamptz,   -- when the person paid, if the bank reports it
  posted_at      timestamptz,   -- when it posted, if the bank reports it
  address        text check (char_length(address) <= 200),
  city           text check (char_length(city) <= 100),
  region         text check (char_length(region) <= 100),
  postal_code    text check (char_length(postal_code) <= 20),
  country        text check (country ~ '^[A-Z]{2}$'),
  lat            double precision check (lat between -90 and 90),
  lon            double precision check (lon between -180 and 180),
  store_number   text check (char_length(store_number) <= 50),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger transaction_details_set_updated_at
  before update on public.transaction_details
  for each row execute function public.set_updated_at();

-- May the current user see when and where `owner_id` spent money in household `hid`?
-- Today: their own, or (for household owners) a teen's or child's.
-- Sharing settings (#28) will extend this one function.
create or replace function public.can_see_whereabouts(hid uuid, owner_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select (owner_id = auth.uid() and public.is_household_member(hid))
      or (public.has_household_role(hid, array['owner'])
          and exists (
            select 1 from public.household_members m
            where m.household_id = hid and m.user_id = owner_id and m.role in ('teen', 'child')
          ))
$$;

revoke all on function public.can_see_whereabouts(uuid, uuid) from public, anon;
grant execute on function public.can_see_whereabouts(uuid, uuid) to authenticated;

alter table public.transaction_details enable row level security;

revoke all on public.transaction_details from anon, authenticated;
grant select on public.transaction_details to authenticated;

-- The transaction must be visible (transactions/accounts RLS applies inside),
-- and its whereabouts must be visible to this user.
create policy transaction_details_select on public.transaction_details
  for select to authenticated
  using (exists (
    select 1
    from public.transactions t
    join public.accounts a on a.id = t.account_id
    where t.id = transaction_details.transaction_id
      and public.can_see_whereabouts(a.household_id, a.owner_user_id)
  ));

grant select (last_synced_at) on public.plaid_items to authenticated;

-- ---------------------------------------------------------------------------
-- tallyn_sync: the bank sync's system role (ADR 0002, ADR 0005)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tallyn_sync') then
    create role tallyn_sync nologin noinherit;
  end if;
end
$$;

-- The backend's login role (Supabase: postgres) may switch to it.
-- authenticated and anon may not.
grant tallyn_sync to current_user;

grant usage on schema public to tallyn_sync;

grant select (id, household_id, owner_user_id, plaid_item_id, access_token_encrypted,
              transactions_cursor, status, last_synced_at)
  on public.plaid_items to tallyn_sync;
grant update (transactions_cursor, status, last_synced_at) on public.plaid_items to tallyn_sync;

-- Upserts (ON CONFLICT ... RETURNING) need to read the rows they write.
grant select on public.accounts to tallyn_sync;
grant insert (household_id, plaid_item_id, owner_user_id, plaid_account_id, name, official_name, mask,
              type, subtype, currency, current_balance_minor, available_balance_minor, balance_updated_at)
  on public.accounts to tallyn_sync;
grant update (name, official_name, mask, type, subtype, currency,
              current_balance_minor, available_balance_minor, balance_updated_at)
  on public.accounts to tallyn_sync;

grant select, insert, update, delete on public.transactions to tallyn_sync;
grant select, insert, update, delete on public.transaction_details to tallyn_sync;

-- RLS: the sync works across all households, so it gets explicit policies.
-- Nothing else in the database grants tallyn_sync anything.
create policy plaid_items_sync on public.plaid_items
  for all to tallyn_sync using (true) with check (true);
create policy accounts_sync on public.accounts
  for all to tallyn_sync using (true) with check (true);
create policy transactions_sync on public.transactions
  for all to tallyn_sync using (true) with check (true);
create policy transaction_details_sync on public.transaction_details
  for all to tallyn_sync using (true) with check (true);
