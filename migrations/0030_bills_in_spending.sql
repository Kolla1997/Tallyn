-- 0030: Paid bills count as spending (#127, step 1 of 2). Agreed with Dinesh
-- 2026-11-09; he picked C of drafts/127-bill-rows.html for how they look.
--
--   - spend_lines is every bank transaction plus every paid bill, one line
--     per payment on the day it was paid. It runs with the caller's rights
--     (security_invoker), so transactions keep their sharing rules and bill
--     lines stay with the household's owners (0029).
--   - A bill marked paid from a matched bank transaction keeps that
--     transaction's ID and adds no line of its own, so it isn't counted twice.
--   - Bill kinds map to Plaid's categories: housing and utilities are Rent and
--     utilities; everything else is General services.
--   - budget_spending (0015) counts paid bills in household budgets, for
--     owners only, like Bills. Personal budgets, alerts (0028) and the emails
--     don't count them yet: alerts reach adults and kids (#127 step 2).

alter table public.bill_payments
  add column transaction_id uuid references public.transactions (id) on delete set null;
grant update (transaction_id) on public.bill_payments to authenticated;
grant insert (bill_id, period, paid_minor, paid_on, transaction_id) on public.bill_payments to authenticated;

create or replace function public.bill_category(kind text) returns text
language sql immutable
set search_path = ''
as $$
  select case when kind in ('housing', 'utilities') then 'RENT_AND_UTILITIES' else 'GENERAL_SERVICES' end
$$;
grant execute on function public.bill_category(text) to authenticated;

create view public.spend_lines with (security_invoker = true) as
  select t.id, t.household_id, t.account_id, t.amount_minor, t.currency, t.date, t.authorized_date,
         t.name, t.merchant_name, t.category_primary, t.category_detailed, t.pending,
         t.payment_channel, t.logo_url, t.created_at, null::uuid as bill_id
  from public.transactions t
  union all
  select md5(p.bill_id::text || p.period::text)::uuid, b.household_id, null::uuid, p.paid_minor, b.currency, p.paid_on, null::date,
         b.name, b.name, public.bill_category(b.category), null::text, false,
         null::text, null::text, p.created_at, b.id
  from public.bill_payments p
  join public.bills b on b.id = p.bill_id
  where p.transaction_id is null;

revoke all on public.spend_lines from public, anon;
grant select on public.spend_lines to authenticated;

create or replace function public.budget_spending(p_budget uuid, p_from date, p_to date)
returns table (day date, amount_minor bigint)
language sql stable
security definer
set search_path = ''
as $$
  select s.day, sum(s.amount)::bigint
  from (
    select t.date as day, t.amount_minor as amount
    from public.budgets b
    join public.transactions t on t.household_id = b.household_id
    join public.accounts a on a.id = t.account_id
    join public.household_members m on m.household_id = b.household_id and m.user_id = a.owner_user_id
    where b.id = p_budget
      and public.can_see_budget(b.household_id, b.member_user_id)
      and p_to > p_from and p_to - p_from <= 31
      and t.date >= p_from and t.date < p_to
      and t.currency = b.currency
      and t.amount_minor > 0
      and coalesce(t.category_primary, '') not in ('INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')
      and (b.category is null or t.category_primary = b.category)
      and case when b.member_user_id is null
               then m.count_in_budgets or m.role in ('teen', 'child')
               else a.owner_user_id = b.member_user_id end
    union all
    -- Paid bills, in household budgets, for owners (who alone see bills).
    select p.paid_on, p.paid_minor
    from public.budgets b
    join public.bills bl on bl.household_id = b.household_id
    join public.bill_payments p on p.bill_id = bl.id
    where b.id = p_budget
      and b.member_user_id is null
      and public.has_household_role(b.household_id, array['owner'])
      and p_to > p_from and p_to - p_from <= 31
      and p.paid_on >= p_from and p.paid_on < p_to
      and p.transaction_id is null
      and bl.currency = b.currency
      and (b.category is null or public.bill_category(bl.category) = b.category)
  ) s
  group by s.day
  order by s.day
$$;
