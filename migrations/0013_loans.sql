-- 0013_loans: student loan and mortgage details from the bank (#27)
--
-- One row per student loan or mortgage, from Plaid Liabilities, refreshed by
-- the sync about once a day with the credit card details (0011). Only what
-- the Debts page shows: never account numbers, payment reference numbers,
-- servicer or property addresses (decided 2026-10-09), escrow or PMI.
-- Seen by whoever may see the loan's balance (sharing rule, 0007); written
-- only by the sync. Unlinking a bank removes its rows with the accounts.

create table public.loans (
  account_id               uuid primary key,
  household_id             uuid not null,
  kind                     text not null check (kind in ('student', 'mortgage')),
  rate_percent             numeric(7, 4) check (rate_percent >= 0 and rate_percent < 1000),
  rate_type                text check (rate_type in ('fixed', 'variable')),
  next_payment_minor       bigint check (next_payment_minor >= 0),
  next_payment_due_date    date,
  last_payment_minor       bigint,
  last_payment_date        date,
  payoff_date              date, -- expected payoff (student) or maturity (mortgage)
  original_minor           bigint check (original_minor >= 0),
  origination_date         date,
  past_due_minor           bigint check (past_due_minor >= 0),
  is_overdue               boolean,
  ytd_interest_minor       bigint,
  ytd_principal_minor      bigint,
  repayment_plan           text check (char_length(repayment_plan) <= 60),
  term                     text check (char_length(term) <= 60),
  updated_at               timestamptz not null default now(),
  foreign key (account_id, household_id)
    references public.accounts (id, household_id) on delete cascade
);

create index loans_household_id_idx on public.loans (household_id);

alter table public.loans enable row level security;

revoke all on public.loans from anon, authenticated;
grant select on public.loans to authenticated;

create policy loans_select on public.loans
  for select to authenticated
  using (public.can_see_account_data(account_id, 'balances'));

grant select, insert, update, delete on public.loans to tallyn_sync;

create policy loans_sync on public.loans
  for all to tallyn_sync using (true) with check (true);

-- Fetch every bank's details again on the next sync, so loans fill in now.
update public.plaid_items set liabilities_synced_at = null;
