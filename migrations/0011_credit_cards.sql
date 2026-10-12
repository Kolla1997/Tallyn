-- 0011_credit_cards: credit limits and card details from the bank (#27)
--
-- 1. accounts.credit_limit_minor: a card's or credit line's limit, from the
--    balances the sync already reads. Same visibility as the balance.
-- 2. plaid_items.liabilities_synced_at: when the sync last asked the bank for
--    card details (Plaid Liabilities refreshes about once a day, so the sync
--    asks about once a day too).
-- 3. credit_cards: one row per card with its APRs, minimum payment, due date,
--    last statement and payment, and whether it's overdue. Seen by whoever may
--    see the card's balance (sharing rule, 0007); written only by the sync.
--    Unlinking a bank removes its cards' rows with the accounts.

alter table public.accounts
  add column credit_limit_minor bigint check (credit_limit_minor >= 0);

alter table public.plaid_items
  add column liabilities_synced_at timestamptz;

create table public.credit_cards (
  account_id                   uuid primary key,
  household_id                 uuid not null,
  -- [{"type": "purchase_apr", "percent": "15.24"}, ...]
  aprs                         jsonb not null default '[]'
                               check (jsonb_typeof(aprs) = 'array' and jsonb_array_length(aprs) <= 10),
  minimum_payment_minor        bigint check (minimum_payment_minor >= 0),
  next_payment_due_date        date,
  last_statement_balance_minor bigint,
  last_statement_date          date,
  last_payment_minor           bigint,
  last_payment_date            date,
  is_overdue                   boolean,
  updated_at                   timestamptz not null default now(),
  -- The card's account, in the same household.
  foreign key (account_id, household_id)
    references public.accounts (id, household_id) on delete cascade
);

create index credit_cards_household_id_idx on public.credit_cards (household_id);

alter table public.credit_cards enable row level security;

revoke all on public.credit_cards from anon, authenticated;
grant select on public.credit_cards to authenticated;

create policy credit_cards_select on public.credit_cards
  for select to authenticated
  using (public.can_see_account_data(account_id, 'balances'));

-- The sync: reads and writes card details and limits, nothing more.
grant select, insert, update, delete on public.credit_cards to tallyn_sync;
grant insert (credit_limit_minor), update (credit_limit_minor) on public.accounts to tallyn_sync;
grant select (liabilities_synced_at), update (liabilities_synced_at) on public.plaid_items to tallyn_sync;

create policy credit_cards_sync on public.credit_cards
  for all to tallyn_sync using (true) with check (true);
