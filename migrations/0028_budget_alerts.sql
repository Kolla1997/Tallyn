-- 0028: Spending-limit alerts (#55). Agreed with Dinesh 2026-11-05; he picked
-- the small F1 card in drafts/55-spending-limits.html.
--
--   - A heads-up when a budget reaches 80% of its limit and another when it
--     goes over, once each per budget per period (week or month). A new
--     period starts fresh: last period's alerts are closed.
--   - Only people who may see the budget hear about it, as on Budgets: every
--     member for a household budget; the person, and their parents for a teen
--     or child, for a personal one.
--   - Spending counts as on Budgets (budget_spending in 0015): same currency,
--     no income, transfers or loan payments, and for a household budget only
--     the people counted in it.
--   - Each person's switch (budget, on) and email (email_budget, off).
--
-- The server runs notify_budgets with the sync's login (tallyn_sync) only.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('big_purchase', 'low_balance', 'reconnect', 'joined', 'payment_due', 'budget_near', 'budget_over'));

alter table public.notification_settings
  add column budget       boolean not null default true,
  add column email_budget boolean not null default false;

create or replace function public.notify_budgets(today date) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  drop table if exists pg_temp.bp;
  -- Each budget's current period and what's been spent in it.
  create temporary table bp on commit drop as
  select b.id, b.household_id, b.member_user_id, b.category, b.period, b.amount_minor, b.currency, p.from_day, p.to_day,
         coalesce((
           select sum(t.amount_minor)
           from public.transactions t
           join public.accounts a on a.id = t.account_id
           join public.household_members m on m.household_id = b.household_id and m.user_id = a.owner_user_id
           where t.household_id = b.household_id
             and t.date >= p.from_day and t.date < p.to_day
             and t.currency = b.currency
             and t.amount_minor > 0
             and coalesce(t.category_primary, '') not in ('INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')
             and (b.category is null or t.category_primary = b.category)
             and case when b.member_user_id is null
                      then m.count_in_budgets or m.role in ('teen', 'child')
                      else a.owner_user_id = b.member_user_id end
         ), 0)::bigint as spent_minor
  from public.budgets b
  cross join lateral (
    select case when b.period = 'week' then today - extract(dow from today)::int
                else date_trunc('month', today)::date end as from_day
  ) f
  cross join lateral (
    select f.from_day, case when b.period = 'week' then f.from_day + 7
                            else (f.from_day + interval '1 month')::date end as to_day
  ) p;

  -- Last period's alerts, and alerts for budgets that are gone, are closed.
  update public.notifications nt set resolved_at = now()
  where nt.kind in ('budget_near', 'budget_over') and nt.resolved_at is null
    and not exists (select 1 from bp where bp.id = nt.ref_id and bp.from_day::text = nt.data->>'period_from');

  insert into public.notifications (household_id, user_id, kind, ref_id, data)
  select bp.household_id, r.user_id,
         case when bp.spent_minor >= bp.amount_minor then 'budget_over' else 'budget_near' end,
         bp.id,
         jsonb_build_object('budget_id', bp.id, 'category', bp.category, 'period', bp.period,
                            'limit_minor', bp.amount_minor, 'spent_minor', bp.spent_minor, 'currency', bp.currency,
                            'period_from', bp.from_day, 'period_to', bp.to_day, 'days_left', bp.to_day - today)
         || case when bp.member_user_id is null then '{}'::jsonb else public.alert_person(bp.member_user_id, r.user_id) end
  from bp
  cross join lateral (
    select m.user_id
    from public.household_members m
    where m.household_id = bp.household_id
      and (bp.member_user_id is null
           or m.user_id = bp.member_user_id
           or (m.role in ('owner', 'adult')
               and exists (select 1 from public.household_members k
                           where k.household_id = bp.household_id and k.user_id = bp.member_user_id
                             and k.role in ('teen', 'child'))))
  ) r
  left join public.notification_settings s on s.household_id = bp.household_id and s.user_id = r.user_id
  where bp.spent_minor * 100 >= bp.amount_minor * 80
    and coalesce(s.budget, true)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Budget alerts are emailed with their own switch; the person is their own
-- "owner" here, so the stop link is theirs.
create or replace function public.email_outbox(max_rows integer)
returns table (id uuid, user_id uuid, household_id uuid, household text, kind text, data jsonb,
               owner_id uuid, email text, send boolean)
language sql stable
security definer
set search_path = ''
as $$
  select n.id, n.user_id, n.household_id, h.name, n.kind, n.data, o.owner_id, u.email,
         u.email is not null and u.email_confirmed_at is not null and (
           (n.user_id = o.owner_id and n.kind = 'reconnect' and coalesce(s.email_reconnect, false))
           or (n.user_id = o.owner_id and n.kind = 'payment_due' and coalesce(s.email_payment_due, false))
           or (n.kind in ('budget_near', 'budget_over') and coalesce(s.email_budget, false))
           or (n.user_id <> o.owner_id and n.kind = 'reconnect'
               and o.owner_id = any (coalesce(s.email_kid_reconnect, '{}'))
               and exists (select 1 from public.household_members k
                           where k.household_id = n.household_id and k.user_id = o.owner_id and k.role in ('teen', 'child'))))
  from public.notifications n
  cross join lateral (
    select coalesce((select i.owner_user_id from public.plaid_items i where n.kind = 'reconnect' and i.id = n.ref_id),
                    (select a.owner_user_id from public.accounts a where n.kind = 'payment_due' and a.id = n.ref_id),
                    case when n.kind in ('budget_near', 'budget_over') then n.user_id end) as owner_id
  ) o
  join public.households h on h.id = n.household_id
  left join auth.users u on u.id = n.user_id
  left join public.notification_settings s on s.household_id = n.household_id and s.user_id = n.user_id
  where n.emailed_at is null and n.created_at > now() - interval '2 days'
    and n.resolved_at is null
  order by n.created_at
  limit max_rows
$$;

revoke all on function public.notify_budgets(date) from public, anon, authenticated;
grant execute on function public.notify_budgets(date) to tallyn_sync;
