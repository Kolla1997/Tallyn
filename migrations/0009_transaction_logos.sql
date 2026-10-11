-- 0009_transaction_logos: merchant logos and transaction owners (#42)
--
-- 1. transactions.logo_url: the merchant's logo from Plaid (100x100 PNG).
--    Only Plaid's two logo hosts are allowed, so no other site's images
--    (or tracking pixels) can get into the app. The bank sync checks this
--    too and drops anything else.
-- 2. transaction_owner(): whose transaction this is, for someone who may see
--    the transaction. Needed when transactions are shared without balances:
--    the account row is hidden then (0007), so the owner can't come from it.

alter table public.transactions
  add column logo_url text
  check (
    char_length(logo_url) <= 300
    and logo_url ~ '^https://plaid-(merchant|counterparty)-logos\.plaid\.com/[A-Za-z0-9._-]+\.png$'
  );

-- Returns the owner of account `acct` if the caller may see its transactions
-- (or balances); null otherwise.
create or replace function public.transaction_owner(acct uuid) returns uuid
language sql stable
security definer
set search_path = ''
as $$
  select a.owner_user_id
  from public.accounts a
  where a.id = acct
    and (public.can_see_member_data(a.household_id, a.owner_user_id, 'transactions')
         or public.can_see_member_data(a.household_id, a.owner_user_id, 'balances'))
$$;

revoke all on function public.transaction_owner(uuid) from public, anon;
grant execute on function public.transaction_owner(uuid) to authenticated;
