-- 0017: Plan from your income (#133). "Give every dollar a job": a monthly
-- income split into buckets by a template (55/5/10/15/15, 50/30/20 or your
-- own), with each bucket's progress this month.
--
-- Same rules as budgets (0015, ADR 0014), reusing its functions:
--   - A household plan (member_user_id null) and one plan per person.
--   - Who sees and changes a plan: can_see_budget() / can_manage_budget().
--   - Household plans count members who opted in, plus kids, as totals only.
--     A person's plan counts only that person's money.
-- Progress comes only from plan_progress(): totals per bucket, never
-- transactions. Agreed with Dinesh, 2026-10-24 (Feature - Budgets).

-- Which bucket a transaction counts towards, from Plaid's categories, or null
-- (income, moves between your own accounts, card bill payments). Plaid: a
-- positive amount is money out.
create or replace function public.plan_bucket(p_primary text, p_detailed text) returns text
language sql immutable
set search_path = ''
as $$
  select case
    -- Paying a credit card bill never counts: that spending already did.
    when p_detailed = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' then null
    -- Housing is an essential, even though Plaid files a mortgage as a loan.
    when p_detailed = 'LOAN_PAYMENTS_MORTGAGE_PAYMENT' then 'essentials'
    when p_primary = 'LOAN_PAYMENTS' then 'debt'
    when p_detailed = 'BANK_FEES_INTEREST_CHARGE' then 'debt'
    when p_detailed = 'TRANSFER_OUT_SAVINGS' then 'short_term'
    when p_detailed = 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' then 'long_term'
    when coalesce(p_primary, '') in ('INCOME', 'TRANSFER_IN', 'TRANSFER_OUT') then null
    when p_primary in ('RENT_AND_UTILITIES', 'TRANSPORTATION', 'MEDICAL')
      or p_detailed in ('FOOD_AND_DRINK_GROCERIES', 'GENERAL_SERVICES_INSURANCE',
                        'GENERAL_SERVICES_CHILDCARE', 'GENERAL_SERVICES_EDUCATION') then 'essentials'
    else 'guilt_free'
  end
$$;

-- Shares are whole percents adding up to 100, with the template's buckets:
-- 50/30/20 has needs, wants and save; the others have the five buckets.
create or replace function public.valid_plan_shares(p_template text, p_shares jsonb) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  keys  text[];
  total numeric := 0;
  v     jsonb;
begin
  if jsonb_typeof(p_shares) is distinct from 'object' then
    return false;
  end if;
  select array_agg(k order by k) into keys from jsonb_object_keys(p_shares) k;
  if keys is distinct from (case p_template
      when '50-30-20' then array['needs', 'save', 'wants']
      else array['debt', 'essentials', 'guilt_free', 'long_term', 'short_term'] end) then
    return false;
  end if;
  for v in select value from jsonb_each(p_shares) loop
    if jsonb_typeof(v) <> 'number' or (v::text)::numeric not between 0 and 100
       or (v::text)::numeric <> trunc((v::text)::numeric) then
      return false;
    end if;
    total := total + (v::text)::numeric;
  end loop;
  return total = 100;
end;
$$;

create table public.income_plans (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households (id) on delete cascade,
  member_user_id       uuid, -- null: the household's plan
  monthly_income_minor bigint not null check (monthly_income_minor > 0 and monthly_income_minor <= 100000000000),
  currency             text not null check (currency ~ '^[A-Z]{3}$'),
  template             text not null check (template in ('55-5-10-15-15', '50-30-20', 'own')),
  shares               jsonb not null,
  created_by           uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (public.valid_plan_shares(template, shares)),
  -- One plan for the household, one per person. A person's plan goes when
  -- they leave the household.
  unique nulls not distinct (household_id, member_user_id),
  foreign key (household_id, member_user_id)
    references public.household_members (household_id, user_id) on delete cascade
);

create trigger income_plans_set_updated_at
  before update on public.income_plans
  for each row execute function public.set_updated_at();

alter table public.income_plans enable row level security;

create policy income_plans_select on public.income_plans
  for select to authenticated
  using (public.can_see_budget(household_id, member_user_id));

create policy income_plans_insert on public.income_plans
  for insert to authenticated
  with check (public.can_manage_budget(household_id, member_user_id) and created_by = auth.uid());

create policy income_plans_update on public.income_plans
  for update to authenticated
  using (public.can_manage_budget(household_id, member_user_id))
  with check (public.can_manage_budget(household_id, member_user_id));

create policy income_plans_delete on public.income_plans
  for delete to authenticated
  using (public.can_manage_budget(household_id, member_user_id));

grant select, delete on public.income_plans to authenticated;
grant insert (household_id, member_user_id, monthly_income_minor, currency, template, shares) on public.income_plans to authenticated;
grant update (monthly_income_minor, currency, template, shares) on public.income_plans to authenticated;

-- Money counted towards each bucket of a plan between p_from and p_to (at most
-- a month), in the plan's currency. Totals only; nothing for someone who may
-- not see the plan.
create or replace function public.plan_progress(p_plan uuid, p_from date, p_to date)
returns table (bucket text, amount_minor bigint)
language sql stable
security definer
set search_path = ''
as $$
  select public.plan_bucket(t.category_primary, t.category_detailed) as bucket, sum(t.amount_minor)::bigint
  from public.income_plans p
  join public.transactions t on t.household_id = p.household_id
  join public.accounts a on a.id = t.account_id
  join public.household_members m on m.household_id = p.household_id and m.user_id = a.owner_user_id
  where p.id = p_plan
    and public.can_see_budget(p.household_id, p.member_user_id)
    and p_to > p_from and p_to - p_from <= 31
    and t.date >= p_from and t.date < p_to
    and t.currency = p.currency
    and t.amount_minor > 0
    and public.plan_bucket(t.category_primary, t.category_detailed) is not null
    and case when p.member_user_id is null
             then m.count_in_budgets or m.role in ('teen', 'child')
             else a.owner_user_id = p.member_user_id end
  group by 1
$$;

-- A suggested monthly income for a plan for p_member (null: the household):
-- the average of the last 3 full months before p_today of pay-type income
-- (wages, pension, unemployment), in the household's currency. Tax refunds,
-- interest, dividends and other one-offs are left out. Same counting and
-- visibility as plans; 0 when there's nothing to go on.
create or replace function public.plan_income_suggestion(p_household uuid, p_member uuid, p_today date)
returns bigint
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(round(sum(-t.amount_minor) / 3.0), 0)::bigint
  from public.households h
  join public.transactions t on t.household_id = h.id
  join public.accounts a on a.id = t.account_id
  join public.household_members m on m.household_id = h.id and m.user_id = a.owner_user_id
  where h.id = p_household
    and public.can_see_budget(p_household, p_member)
    and t.date >= (date_trunc('month', p_today) - interval '3 months')::date
    and t.date < date_trunc('month', p_today)::date
    and t.currency = h.home_currency
    and t.amount_minor < 0
    and t.category_detailed in ('INCOME_WAGES', 'INCOME_RETIREMENT_PENSION', 'INCOME_UNEMPLOYMENT')
    and case when p_member is null
             then m.count_in_budgets or m.role in ('teen', 'child')
             else a.owner_user_id = p_member end
$$;

revoke all on function public.plan_bucket(text, text) from public, anon;
revoke all on function public.valid_plan_shares(text, jsonb) from public, anon;
revoke all on function public.plan_progress(uuid, date, date) from public, anon;
revoke all on function public.plan_income_suggestion(uuid, uuid, date) from public, anon;
grant execute on function public.plan_bucket(text, text) to authenticated;
grant execute on function public.valid_plan_shares(text, jsonb) to authenticated;
grant execute on function public.plan_progress(uuid, date, date) to authenticated;
grant execute on function public.plan_income_suggestion(uuid, uuid, date) to authenticated;
