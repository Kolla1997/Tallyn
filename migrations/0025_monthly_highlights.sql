-- 0025: Monthly highlights email (#274, part of #55). Agreed with Dinesh
-- 2026-11-04; he picked design D (drafts/274-monthly-highlights.html) with
-- "Where it went" as a split bar, option 3 (drafts/274-where-it-went.html).
--
--   - Off by default (email_monthly). Sent on the 1st from 9am in the
--     person's own time zone (weekly_zone, 0024), for the month just ended.
--     A month with nothing spent and nothing in is skipped.
--   - Your own accounts: spent and came in; against last month and the
--     3-month average (whole months); highlights (busiest day, biggest
--     purchase, top category, biggest money in); spending per day; spending
--     per category.
--   - "Include shared" (0024's switch, used by both summaries): the same
--     people as the weekly (shared transactions, or your teens and
--     children), whole months, a child's as totals only.
--   - Home currency only, and card and loan payments and transfers aren't
--     spending, as in the weekly.

alter table public.notification_settings
  add column email_monthly boolean not null default false;

create table public.monthly_emails (
  household_id uuid not null,
  user_id      uuid not null,
  month_start  date not null,
  sent         boolean not null,
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id, month_start),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
alter table public.monthly_emails enable row level security; -- no policies: the app's login never reads it
revoke all on public.monthly_emails from public, anon, authenticated;

-- Who is due a monthly email now: the 1st from 9am in their time zone, for
-- the month before, not yet looked at.
create or replace function public.monthly_due(p_at timestamptz)
returns table (user_id uuid, household_id uuid, household text, email text, month_start date)
language sql stable
security definer
set search_path = ''
as $$
  select s.user_id, s.household_id, h.name, u.email, (date_trunc('month', l.local) - interval '1 month')::date
  from public.notification_settings s
  join public.households h on h.id = s.household_id
  join auth.users u on u.id = s.user_id and u.email is not null and u.email_confirmed_at is not null
  cross join lateral (select (p_at at time zone public.weekly_zone(s.time_zone)) as local) l
  where s.email_monthly
    and extract(day from l.local) = 1 and l.local::time >= time '09:00'
    and not exists (select 1 from public.monthly_emails m
                    where m.household_id = s.household_id and m.user_id = s.user_id
                      and m.month_start = (date_trunc('month', l.local) - interval '1 month')::date)
$$;

-- Last month and the average of the 3 before, whole months.
create or replace function public.monthly_compare(hid uuid, owner_id uuid, p_month date)
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with back as (
    select k, (p_month - make_interval(months => k))::date as s,
           (p_month - make_interval(months => k - 1))::date - 1 as e
    from generate_series(1, 3) k
  )
  select jsonb_build_object(
    'spent', (select spent from public.weekly_spent(hid, owner_id, p_month, (p_month + interval '1 month')::date - 1)),
    'last', (select w.spent from back b, public.weekly_spent(hid, owner_id, b.s, b.e) w where b.k = 1),
    'avg3', (select round(avg(w.spent))::bigint from back b, public.weekly_spent(hid, owner_id, b.s, b.e) w))
$$;

-- Everything the email shows, for uid in household hid, for the month
-- starting p_month.
create or replace function public.monthly_summary(hid uuid, uid uuid, p_month date)
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with mo as (select p_month as s, (p_month + interval '1 month')::date - 1 as e),
  hh as (select h.home_currency as cur from public.households h where h.id = hid),
  tx as (
    select t.date, coalesce(nullif(t.merchant_name, ''), t.name) as name, t.amount_minor, t.category_primary
    from public.transactions t join public.accounts a on a.id = t.account_id, mo, hh
    where t.household_id = hid and a.owner_user_id = uid and not t.pending and t.date between mo.s and mo.e
      and t.currency = hh.cur and coalesce(t.category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')
  ),
  spend as (select * from tx where amount_minor > 0 and coalesce(category_primary, '') <> 'INCOME'),
  came as (select * from tx where amount_minor < 0),
  daily as (select date, sum(amount_minor) as amt from spend group by date),
  cats as (select coalesce(category_primary, 'OTHER') as category, sum(amount_minor) as amt from spend group by 1),
  settings as (select coalesce(s.email_include_shared, false) as shared from (select 1) one
               left join public.notification_settings s on s.household_id = hid and s.user_id = uid),
  me as (select m.role from public.household_members m where m.household_id = hid and m.user_id = uid),
  others as (
    select o.user_id, o.role, coalesce(nullif(p.display_name, ''), 'Someone') as name
    from public.household_members o
    left join public.profiles p on p.id = o.user_id, me
    where o.household_id = hid and o.user_id <> uid and me.role in ('owner', 'adult')
      and (o.role in ('teen', 'child')
           or exists (select 1 from public.shares sh where sh.household_id = hid and sh.owner_user_id = o.user_id
                      and sh.viewer_user_id = uid and sh.category = 'transactions'))
  )
  select jsonb_build_object(
    'month_start', mo.s, 'month_end', mo.e, 'currency', hh.cur,
    'spent', coalesce((select sum(amount_minor) from spend), 0),
    'came_in', coalesce((select -sum(amount_minor) from came), 0),
    'compare', public.monthly_compare(hid, uid, mo.s),
    'days', (select jsonb_agg(coalesce((select amt from daily where daily.date = d::date), 0) order by d)
             from generate_series(mo.s, mo.e, interval '1 day') d),
    'busiest', (select jsonb_build_object('date', date, 'amount_minor', amt) from daily order by amt desc, date limit 1),
    'biggest', (select jsonb_build_object('name', name, 'date', date, 'amount_minor', amount_minor) from spend order by amount_minor desc, date desc limit 1),
    'biggest_in', (select jsonb_build_object('name', name, 'date', date, 'amount_minor', -amount_minor) from came order by amount_minor, date limit 1),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'amount_minor', amt) order by amt desc, category) from cats), '[]'::jsonb),
    'shared', case when (select shared from settings) then coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', o.name, 'kid', o.role in ('teen', 'child'),
               'compare', public.monthly_compare(hid, o.user_id, mo.s),
               'biggest', case when o.role in ('teen', 'child') then null else (
                 select jsonb_build_object('name', coalesce(nullif(t.merchant_name, ''), t.name), 'date', t.date, 'amount_minor', t.amount_minor)
                 from public.transactions t join public.accounts a on a.id = t.account_id
                 where t.household_id = hid and a.owner_user_id = o.user_id and not t.pending and t.currency = hh.cur
                   and t.date between mo.s and mo.e and t.amount_minor > 0
                   and coalesce(t.category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'INCOME')
                 order by t.amount_minor desc, t.date desc limit 1) end)
             order by o.name)
      from others o), '[]'::jsonb) else null end)
  from mo, hh
$$;

create or replace function public.mark_monthly(hid uuid, uid uuid, p_month date, was_sent boolean) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.monthly_emails (household_id, user_id, month_start, sent) values (hid, uid, p_month, was_sent)
  on conflict do nothing
$$;

revoke all on function public.monthly_due(timestamptz) from public, anon, authenticated;
revoke all on function public.monthly_compare(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.monthly_summary(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.mark_monthly(uuid, uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.monthly_due(timestamptz) to tallyn_sync;
grant execute on function public.monthly_summary(uuid, uuid, date) to tallyn_sync;
grant execute on function public.mark_monthly(uuid, uuid, date, boolean) to tallyn_sync;
