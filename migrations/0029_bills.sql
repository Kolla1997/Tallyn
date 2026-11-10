-- 0029: Bills Plaid can't see (#127). Agreed with Dinesh 2026-11-09
-- (Feature - Bills, calendar draft option C).
--
-- A bill is something the household pays outside its linked banks: rent by
-- cheque, childcare in cash, a utility on an unlinked card. Each period it is
-- due on its due day (the month's last day when the month is shorter), and
-- the owner marks it paid, with the amount actually paid. Due and late are
-- worked out from the dates; only payments are stored.
--
-- Only the household's owners see and change bills (agreed 2026-11-09).
-- Bills never change bank balances. No bank or account numbers are stored.

create table public.bills (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  category      text check (category is null or category in ('housing', 'utilities', 'insurance', 'childcare', 'subscriptions', 'other')),
  amount_minor  bigint not null check (amount_minor > 0 and amount_minor <= 100000000000),
  currency      text not null check (currency ~ '^[A-Z]{3}$'),
  varies        boolean not null default false,
  frequency     text not null check (frequency in ('monthly', 'quarterly', 'yearly', 'once')),
  due_day       smallint not null check (due_day between 1 and 31),
  starts_on     date not null, -- the first period's month; for 'once', the due date's month
  paused        boolean not null default false,
  note          text check (note is null or char_length(note) <= 200),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (starts_on = date_trunc('month', starts_on)::date)
);

create index bills_household on public.bills (household_id);

create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();

-- One row per period marked paid. period is that period's due date.
create table public.bill_payments (
  bill_id     uuid not null references public.bills (id) on delete cascade,
  period      date not null,
  paid_minor  bigint not null check (paid_minor > 0 and paid_minor <= 100000000000),
  paid_on     date not null,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (bill_id, period)
);

alter table public.bills enable row level security;
alter table public.bill_payments enable row level security;

create policy bills_owner on public.bills
  for all to authenticated
  using (public.has_household_role(household_id, array['owner']))
  with check (public.has_household_role(household_id, array['owner']));

create policy bill_payments_owner on public.bill_payments
  for all to authenticated
  using (exists (select 1 from public.bills b where b.id = bill_id and public.has_household_role(b.household_id, array['owner'])))
  with check (exists (select 1 from public.bills b where b.id = bill_id and public.has_household_role(b.household_id, array['owner'])));

grant select, delete on public.bills to authenticated;
grant insert (household_id, name, category, amount_minor, currency, varies, frequency, due_day, starts_on, paused, note) on public.bills to authenticated;
grant update (name, category, amount_minor, varies, frequency, due_day, starts_on, paused, note) on public.bills to authenticated;
grant select, insert, delete on public.bill_payments to authenticated;
grant update (paid_minor, paid_on) on public.bill_payments to authenticated;
