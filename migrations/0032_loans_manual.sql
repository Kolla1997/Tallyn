-- 0032: Loans Plaid can't see, like a car loan (#306). Agreed with Dinesh
-- 2026-11-09; he picked C of drafts/306-loans.html.
--
--   - A manual loan is a bill (0029) with loan terms: its monthly payment is
--     the bill, so it shows on the Bills calendar and in the reminder, and is
--     marked paid there. The bill's kind is 'loan': a loan payment, which
--     (like Plaid's, #77) isn't spending, and is "debt" in income plans.
--   - The balance is worked out from the terms and the payments: each
--     payment pays the month's interest first, the rest comes off the
--     balance. Extra payments go straight to the balance. An owner can
--     correct the balance to match the lender's statement; payments after
--     that date start from it. Figures are estimates.
--   - Owners only, like Bills.

alter table public.bills drop constraint bills_category_check;
alter table public.bills add constraint bills_category_check
  check (category is null or category in ('housing', 'utilities', 'insurance', 'childcare', 'subscriptions', 'other', 'loan'));

create or replace function public.bill_category(kind text) returns text
language sql immutable
set search_path = ''
as $$
  select case when kind in ('housing', 'utilities') then 'RENT_AND_UTILITIES'
              when kind = 'loan' then 'LOAN_PAYMENTS'
              else 'GENERAL_SERVICES' end
$$;

create or replace function public.bill_detailed(kind text) returns text
language sql immutable
set search_path = ''
as $$
  select case kind when 'insurance' then 'GENERAL_SERVICES_INSURANCE'
                   when 'childcare' then 'GENERAL_SERVICES_CHILDCARE'
                   when 'loan' then 'LOAN_PAYMENTS_CAR_PAYMENT' end
$$;

create table public.loans_manual (
  bill_id          uuid primary key references public.bills (id) on delete cascade,
  household_id     uuid not null references public.households (id) on delete cascade,
  lender           text check (lender is null or char_length(lender) <= 60),
  principal_minor  bigint not null check (principal_minor > 0 and principal_minor <= 100000000000),
  apr_bp           integer not null check (apr_bp between 0 and 10000), -- 4.9% = 490
  months           integer not null check (months between 1 and 600),
  first_due        date not null,
  -- The lender's balance on a day, when the owner corrects it.
  balance_minor    bigint check (balance_minor is null or balance_minor between 0 and 100000000000),
  balance_on       date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((balance_minor is null) = (balance_on is null))
);

create trigger loans_manual_set_updated_at
  before update on public.loans_manual
  for each row execute function public.set_updated_at();

-- Extra payments that go straight to the balance.
create table public.loan_extra_payments (
  id           uuid primary key default gen_random_uuid(),
  bill_id      uuid not null references public.loans_manual (bill_id) on delete cascade,
  paid_minor   bigint not null check (paid_minor > 0 and paid_minor <= 100000000000),
  paid_on      date not null,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index loan_extra_payments_bill on public.loan_extra_payments (bill_id);

alter table public.loans_manual enable row level security;
alter table public.loan_extra_payments enable row level security;

create policy loans_manual_owner on public.loans_manual
  for all to authenticated
  using (public.has_household_role(household_id, array['owner']))
  with check (public.has_household_role(household_id, array['owner'])
              and exists (select 1 from public.bills b where b.id = bill_id and b.household_id = loans_manual.household_id));

create policy loan_extra_payments_owner on public.loan_extra_payments
  for all to authenticated
  using (exists (select 1 from public.loans_manual l where l.bill_id = loan_extra_payments.bill_id and public.has_household_role(l.household_id, array['owner'])))
  with check (exists (select 1 from public.loans_manual l where l.bill_id = loan_extra_payments.bill_id and public.has_household_role(l.household_id, array['owner'])));

grant select, delete on public.loans_manual to authenticated;
grant insert (bill_id, household_id, lender, principal_minor, apr_bp, months, first_due) on public.loans_manual to authenticated;
grant update (lender, principal_minor, apr_bp, months, first_due, balance_minor, balance_on) on public.loans_manual to authenticated;
grant select, insert, delete on public.loan_extra_payments to authenticated;
