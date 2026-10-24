-- 0016: Close your Tallyn account (#56, ADR 0015).
--
-- Closing deletes the person's Supabase sign-in, and everything of theirs
-- goes with it by cascade (profile, banks, accounts, transactions,
-- memberships, shares, consents, backup codes, budgets for them). This
-- migration adds what closing needs around that:
--
-- 1. Household budgets outlive their creator. Before, deleting the person who
--    made a household budget deleted it for everyone in the household.
-- 2. closed_accounts: the minimal record kept after closing (Dinesh, 2026-10-24):
--    user id, a keyed hash of the email (never the email), when, and the Terms
--    and Privacy versions they had agreed to. Kept 3 years, then purged by the
--    bank sync. Nobody reads it through the app: it has no policies, and only
--    the functions below touch it.
-- 3. account_closing_blocker() and prepare_account_closing(), run as the
--    person; purge_closed_accounts(), run by the bank sync's role.

-- 1. Household budgets outlive their creator.
alter table public.budgets alter column created_by drop not null;
alter table public.budgets drop constraint budgets_created_by_fkey;
alter table public.budgets add constraint budgets_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- 2. The closing record.
create table public.closed_accounts (
  user_id          uuid primary key, -- no foreign key: the profile is gone
  email_hmac       bytea check (email_hmac is null or octet_length(email_hmac) = 32),
  closed_at        timestamptz not null default now(),
  terms_version    text,
  privacy_version  text
);
alter table public.closed_accounts enable row level security;
revoke all on public.closed_accounts from public, anon, authenticated;

-- 3a. Why closing can't go ahead yet, or null. Checked before any bank is
-- unlinked at Plaid, so a refusal changes nothing.
create or replace function public.account_closing_blocker() returns text
language sql stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 'not_signed_in'
    when exists (
      select 1 from public.household_members m
      where m.user_id = auth.uid() and m.role = 'owner'
        and exists (select 1 from public.household_members o
                    where o.household_id = m.household_id and o.user_id <> auth.uid())
        and not exists (select 1 from public.household_members o
                        where o.household_id = m.household_id and o.user_id <> auth.uid() and o.role = 'owner')
    ) then 'last_owner'
  end
$$;

-- 3b. The last step before the sign-in is deleted: write the closing record
-- and delete households where the person is the only member (they'd be left
-- empty). Safe to run again if deleting the sign-in failed.
create or replace function public.prepare_account_closing(p_email_hmac bytea) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me      uuid := auth.uid();
  blocker text := public.account_closing_blocker();
begin
  if blocker is not null then
    raise exception 'account can''t be closed: %', blocker using errcode = '42501';
  end if;
  insert into public.closed_accounts (user_id, email_hmac, terms_version, privacy_version)
  values (
    me,
    p_email_hmac,
    (select c.version from public.consents c where c.user_id = me and c.document = 'terms' order by c.accepted_at desc limit 1),
    (select c.version from public.consents c where c.user_id = me and c.document = 'privacy' order by c.accepted_at desc limit 1)
  )
  on conflict (user_id) do update
    set email_hmac = excluded.email_hmac, closed_at = now(),
        terms_version = excluded.terms_version, privacy_version = excluded.privacy_version;
  delete from public.households h
  where exists (select 1 from public.household_members m where m.household_id = h.id and m.user_id = me)
    and not exists (select 1 from public.household_members m where m.household_id = h.id and m.user_id <> me);
end;
$$;

-- 3c. Closing records older than p_keep go. Run by the bank sync (0005).
create or replace function public.purge_closed_accounts(p_keep interval) returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.closed_accounts where closed_at < now() - p_keep returning 1
  )
  select count(*)::integer from gone
$$;

revoke all on function public.account_closing_blocker() from public, anon;
revoke all on function public.prepare_account_closing(bytea) from public, anon;
revoke all on function public.purge_closed_accounts(interval) from public, anon, authenticated;
grant execute on function public.account_closing_blocker() to authenticated;
grant execute on function public.prepare_account_closing(bytea) to authenticated;
grant execute on function public.purge_closed_accounts(interval) to tallyn_sync;
