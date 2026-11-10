-- 0031: Paid bills in the summary emails and income plans (#127, step 2 of 2).
-- Agreed with Dinesh 2026-11-09; he picked C of drafts/127-bills-email.html.
--
--   - Emails: owners only, never mixed into "You spent" (that total also
--     shows in other people's shared section). email_bills gives the period's
--     paid bills and, for the weekly email, bills due in the week after.
--   - Income plans: paid bills count in household plans for owners, like
--     household budgets (0030).
--   - Spending-limit alerts stay on bank spending (Dinesh, 2026-11-09).
--   - Insurance and childcare bills get Plaid's detailed categories, so plans
--     file them as essentials.

create or replace function public.bill_detailed(kind text) returns text
language sql immutable
set search_path = ''
as $$
  select case kind when 'insurance' then 'GENERAL_SERVICES_INSURANCE'
                   when 'childcare' then 'GENERAL_SERVICES_CHILDCARE' end
$$;
grant execute on function public.bill_detailed(text) to authenticated;

create or replace view public.spend_lines with (security_invoker = true) as
  select t.id, t.household_id, t.account_id, t.amount_minor, t.currency, t.date, t.authorized_date,
         t.name, t.merchant_name, t.category_primary, t.category_detailed, t.pending,
         t.payment_channel, t.logo_url, t.created_at, null::uuid as bill_id
  from public.transactions t
  union all
  select md5(p.bill_id::text || p.period::text)::uuid, b.household_id, null::uuid, p.paid_minor, b.currency, p.paid_on, null::date,
         b.name, b.name, public.bill_category(b.category), public.bill_detailed(b.category), false,
         null::text, null::text, p.created_at, b.id
  from public.bill_payments p
  join public.bills b on b.id = p.bill_id
  where p.transaction_id is null;

-- A bill's due date in the month starting p_month, or null when it isn't due
-- then. Same rule as DueIn in internal/db/bills.go.
create or replace function public.bill_due_date(freq text, due_day integer, starts_on date, p_month date) returns date
language sql immutable
set search_path = ''
as $$
  select case
    when p_month < starts_on then null
    when freq = 'monthly'
      or (freq = 'quarterly' and m % 3 = 0)
      or (freq = 'yearly' and m % 12 = 0)
      or (freq = 'once' and m = 0)
    then p_month + least(due_day, extract(day from (p_month + interval '1 month' - interval '1 day'))::int) - 1
  end
  from (select ((extract(year from p_month) - extract(year from starts_on)) * 12
               + extract(month from p_month) - extract(month from starts_on))::int as m) x
$$;

-- What the summary emails show about bills, for uid in hid: null unless uid
-- is an owner. Bills paid between p_from and p_to (counted once: not those
-- paid from a matched bank transaction), and bills not yet paid that fall due
-- between due_from and due_to (none when due_from is null). Home currency.
create or replace function public.email_bills(hid uuid, uid uuid, p_from date, p_to date, due_from date, due_to date)
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with hh as (select h.home_currency as cur from public.households h where h.id = hid),
  paid as (
    select b.name, p.paid_on, p.paid_minor
    from public.bill_payments p join public.bills b on b.id = p.bill_id, hh
    where b.household_id = hid and b.currency = hh.cur and p.transaction_id is null
      and p.paid_on between p_from and p_to
  ),
  due as (
    select b.name, d.due, b.amount_minor, b.varies
    from public.bills b, hh,
         -- The window is at most a week or so: its first and last months cover it.
         lateral (select distinct public.bill_due_date(b.frequency, b.due_day, b.starts_on, v.mo) as due
                  from (values (date_trunc('month', due_from)::date), (date_trunc('month', due_to)::date)) v(mo)) d
    where due_from is not null and b.household_id = hid and b.currency = hh.cur and not b.paused
      and d.due between due_from and due_to
      and not exists (select 1 from public.bill_payments p where p.bill_id = b.id and p.period = d.due)
  )
  select case when exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = uid and m.role = 'owner')
    then jsonb_build_object(
      'paid_total', coalesce((select sum(paid_minor) from paid), 0),
      'paid', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'paid_on', paid_on, 'amount_minor', paid_minor) order by paid_on, name) from paid), '[]'::jsonb),
      'due', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'due_date', due, 'amount_minor', amount_minor, 'varies', varies) order by due, name) from due), '[]'::jsonb))
  end
$$;
revoke all on function public.email_bills(uuid, uuid, date, date, date, date) from public, anon, authenticated;
grant execute on function public.email_bills(uuid, uuid, date, date, date, date) to tallyn_sync;

create or replace function public.plan_progress(p_plan uuid, p_from date, p_to date)
returns table (bucket text, amount_minor bigint)
language sql stable
security definer
set search_path = ''
as $$
  select s.bucket, sum(s.amount)::bigint
  from (
    select public.plan_bucket(t.category_primary, t.category_detailed) as bucket, t.amount_minor as amount
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
    union all
    -- Paid bills, in household plans, for owners (who alone see bills).
    select public.plan_bucket(public.bill_category(b.category), public.bill_detailed(b.category)), bp.paid_minor
    from public.income_plans p
    join public.bills b on b.household_id = p.household_id
    join public.bill_payments bp on bp.bill_id = b.id
    where p.id = p_plan
      and p.member_user_id is null
      and public.has_household_role(p.household_id, array['owner'])
      and p_to > p_from and p_to - p_from <= 31
      and bp.paid_on >= p_from and bp.paid_on < p_to
      and bp.transaction_id is null
      and b.currency = p.currency
  ) s
  group by 1
$$;
