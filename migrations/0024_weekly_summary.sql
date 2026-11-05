-- 0024: Weekly summary email (#273, part of #55). Agreed with Dinesh
-- 2026-11-04; he picked design D in drafts/273-weekly-summary.html.
--
--   - Off by default (email_weekly). Sent on Monday from 9am in the person's
--     own time zone (saved from their browser when they change a
--     notification setting; America/Chicago until then), for last Monday to
--     Sunday. A week with nothing spent and nothing in is skipped.
--   - Your own accounts in detail: spent, came in, spending per day, the
--     purchases, what's due, this month so far against the same days last
--     month and the 3-month average, cash now.
--   - "Include shared" (email_include_shared, off): each household member
--     whose transactions you may see (shared with you, or your teen or
--     child; the same rule as can_see_member_data), this month so far
--     against last month and the 3-month average, and their biggest
--     purchase. A child's shows totals only, never a purchase.
--   - Money is in the household's home currency; other currencies are left
--     out until the email converts them.
--   - Card and loan payments and transfers aren't spending, as in the app.
--
-- The server reads these with the sync's login (tallyn_sync) only.

alter table public.notification_settings
  add column email_weekly         boolean not null default false,
  add column email_include_shared boolean not null default false,
  add column time_zone            text check (time_zone is null or char_length(time_zone) between 1 and 64);

-- Which weeks were looked at, so nothing is sent twice. sent is false for a
-- skipped quiet week.
create table public.weekly_emails (
  household_id uuid not null,
  user_id      uuid not null,
  week_start   date not null,
  sent         boolean not null,
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id, week_start),
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);
alter table public.weekly_emails enable row level security; -- no policies: the app's login never reads it
revoke all on public.weekly_emails from public, anon, authenticated;

-- A time zone Postgres knows, or Chicago.
create or replace function public.weekly_zone(tz text) returns text
language sql stable
set search_path = ''
as $$
  select coalesce((select n.name from pg_catalog.pg_timezone_names n where n.name = tz), 'America/Chicago')
$$;

-- Who is due a weekly email now: Monday from 9am in their time zone, for
-- the week before, not yet looked at.
create or replace function public.weekly_due(p_at timestamptz)
returns table (user_id uuid, household_id uuid, household text, email text, week_start date)
language sql stable
security definer
set search_path = ''
as $$
  select s.user_id, s.household_id, h.name, u.email, (l.local::date - 7)
  from public.notification_settings s
  join public.households h on h.id = s.household_id
  join auth.users u on u.id = s.user_id and u.email is not null and u.email_confirmed_at is not null
  cross join lateral (select (p_at at time zone public.weekly_zone(s.time_zone)) as local) l
  where s.email_weekly
    and extract(isodow from l.local) = 1 and l.local::time >= time '09:00'
    and not exists (select 1 from public.weekly_emails w
                    where w.household_id = s.household_id and w.user_id = s.user_id and w.week_start = l.local::date - 7)
$$;

-- Spending and money in for one person's accounts, home currency only.
create or replace function public.weekly_spent(hid uuid, owner_id uuid, from_d date, to_d date)
returns table (spent bigint, came_in bigint)
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(sum(t.amount_minor) filter (where t.amount_minor > 0 and coalesce(t.category_primary, '') <> 'INCOME'), 0)::bigint,
         coalesce(-sum(t.amount_minor) filter (where t.amount_minor < 0), 0)::bigint
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  join public.households h on h.id = hid
  where t.household_id = hid and a.owner_user_id = owner_id and not t.pending
    and t.date between from_d and to_d and t.currency = h.home_currency
    and coalesce(t.category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')
$$;

-- This month so far (to the week's Sunday), the same days of last month,
-- and the average of the same days over the 3 months before.
create or replace function public.weekly_month(hid uuid, owner_id uuid, week_end date)
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with m as (select date_trunc('month', week_end)::date as start, (week_end - date_trunc('month', week_end)::date) as days),
  back as (
    select k, (m.start - make_interval(months => k))::date as start,
           least((m.start - make_interval(months => k))::date + m.days, (m.start - make_interval(months => k - 1))::date - 1) as stop
    from m, generate_series(1, 3) k
  )
  select jsonb_build_object(
    'from', m.start, 'to', week_end,
    'spent', (select spent from public.weekly_spent(hid, owner_id, m.start, week_end)),
    'last_from', (select start from back where k = 1), 'last_to', (select stop from back where k = 1),
    'last', (select w.spent from back b, public.weekly_spent(hid, owner_id, b.start, b.stop) w where b.k = 1),
    'avg3', (select round(avg(w.spent))::bigint from back b, public.weekly_spent(hid, owner_id, b.start, b.stop) w))
  from m
$$;

-- Everything the email shows, for user_id in household hid, for the week
-- starting week_start (a Monday).
create or replace function public.weekly_summary(hid uuid, uid uuid, p_week date)
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with wk as (select p_week as s, p_week + 6 as e),
  hh as (select h.home_currency as cur from public.households h where h.id = hid),
  mine as (
    select t.date, coalesce(nullif(t.merchant_name, ''), t.name) as name, t.amount_minor, t.category_primary
    from public.transactions t join public.accounts a on a.id = t.account_id, wk, hh
    where t.household_id = hid and a.owner_user_id = uid and not t.pending and t.date between wk.s and wk.e
      and t.currency = hh.cur and t.amount_minor > 0
      and coalesce(t.category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'INCOME')
  ),
  settings as (select coalesce(s.email_include_shared, false) as shared from (select 1) one
               left join public.notification_settings s on s.household_id = hid and s.user_id = uid),
  me as (select m.role from public.household_members m where m.household_id = hid and m.user_id = uid),
  others as (
    -- Whose spending uid may see: shared transactions, or their own kids
    -- (can_see_member_data, with uid as the viewer). Teens and children see
    -- nobody's.
    select o.user_id, o.role, coalesce(nullif(p.display_name, ''), 'Someone') as name
    from public.household_members o
    left join public.profiles p on p.id = o.user_id, me
    where o.household_id = hid and o.user_id <> uid and me.role in ('owner', 'adult')
      and (o.role in ('teen', 'child')
           or exists (select 1 from public.shares sh where sh.household_id = hid and sh.owner_user_id = o.user_id
                      and sh.viewer_user_id = uid and sh.category = 'transactions'))
  )
  select jsonb_build_object(
    'week_start', wk.s, 'week_end', wk.e, 'currency', hh.cur,
    'spent', (select spent from public.weekly_spent(hid, uid, wk.s, wk.e)),
    'came_in', (select came_in from public.weekly_spent(hid, uid, wk.s, wk.e)),
    'days', (select jsonb_agg(coalesce((select sum(amount_minor) from mine where mine.date = d::date), 0) order by d)
             from generate_series(wk.s, wk.e, interval '1 day') d),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'date', date, 'amount_minor', amount_minor, 'category', category_primary)
                                            order by amount_minor desc, date)
                           from (select * from mine order by amount_minor desc, date limit 5) top), '[]'::jsonb),
    'more', greatest((select count(*) from mine) - 5, 0),
    'month', public.weekly_month(hid, uid, wk.e),
    'cash_minor', (select coalesce(sum(a.current_balance_minor), 0) from public.accounts a
                   where a.household_id = hid and a.owner_user_id = uid and a.type = 'depository' and a.currency = hh.cur),
    'due', coalesce((select jsonb_agg(jsonb_build_object('account', d.name, 'due_date', d.due, 'amount_minor', d.amount, 'overdue', d.overdue) order by d.overdue desc, d.due)
                     from (select a.name, c.next_payment_due_date as due, c.minimum_payment_minor as amount, coalesce(c.is_overdue, false) as overdue
                           from public.credit_cards c join public.accounts a on a.id = c.account_id
                           where a.household_id = hid and a.owner_user_id = uid
                           union all
                           select a.name, l.next_payment_due_date,
                                  case when l.is_overdue and l.past_due_minor > 0 then l.past_due_minor else l.next_payment_minor end,
                                  coalesce(l.is_overdue, false)
                           from public.loans l join public.accounts a on a.id = l.account_id
                           where a.household_id = hid and a.owner_user_id = uid) d
                     where d.overdue or d.due between wk.e + 1 and wk.e + 8), '[]'::jsonb),
    'shared', case when (select shared from settings) then coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', o.name, 'kid', o.role in ('teen', 'child'),
               'month', public.weekly_month(hid, o.user_id, wk.e),
               'biggest', case when o.role in ('teen', 'child') then null else (
                 select jsonb_build_object('name', coalesce(nullif(t.merchant_name, ''), t.name), 'date', t.date, 'amount_minor', t.amount_minor)
                 from public.transactions t join public.accounts a on a.id = t.account_id
                 where t.household_id = hid and a.owner_user_id = o.user_id and not t.pending and t.currency = hh.cur
                   and t.date between date_trunc('month', wk.e)::date and wk.e and t.amount_minor > 0
                   and coalesce(t.category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'INCOME')
                 order by t.amount_minor desc, t.date limit 1) end)
             order by o.name)
      from others o), '[]'::jsonb) else null end)
  from wk, hh
$$;

create or replace function public.mark_weekly(hid uuid, uid uuid, p_week date, was_sent boolean) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.weekly_emails (household_id, user_id, week_start, sent) values (hid, uid, p_week, was_sent)
  on conflict do nothing
$$;

revoke all on function public.weekly_zone(text) from public, anon, authenticated;
revoke all on function public.weekly_due(timestamptz) from public, anon, authenticated;
revoke all on function public.weekly_spent(uuid, uuid, date, date) from public, anon, authenticated;
revoke all on function public.weekly_month(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.weekly_summary(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.mark_weekly(uuid, uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.weekly_due(timestamptz) to tallyn_sync;
grant execute on function public.weekly_summary(uuid, uuid, date) to tallyn_sync;
grant execute on function public.mark_weekly(uuid, uuid, date, boolean) to tallyn_sync;
