-- 0023: Notification emails (#269, part of #55). Agreed with Dinesh
-- 2026-11-04 (drafts/269-notification-emails.html, emails C, Settings B,
-- unsubscribe A):
--
--   - A new alert, payment due: three days before a card or loan is due,
--     and again if it's overdue. In the app for the owner (and a partner the
--     owner shares balances with, like low balance). Checked daily by the
--     server with the sync's login.
--   - Emails go to the account's owner only, for reconnect and payment due,
--     when their email switch is on (email_reconnect, email_payment_due from
--     0021). A parent can also ask for a child's reconnect emails, one
--     switch per child (email_kid_reconnect), off by default.
--   - The server sends them (internal/email): email_outbox() lists alerts
--     not yet looked at, mark_emailed() records that they were, so a restart
--     never sends twice. Alerts from before this migration are never emailed.
--
-- Unsubscribe links are signed by the server and change the person's own
-- settings through the API login as that person (RLS), so nothing here.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('big_purchase', 'low_balance', 'reconnect', 'joined', 'payment_due'));

alter table public.notifications add column emailed_at timestamptz;
update public.notifications set emailed_at = now();
create index notifications_to_email on public.notifications (created_at) where emailed_at is null;

-- Children whose reconnect emails this parent wants. Only alerts the parent
-- already gets are emailed (alert_recipients), so a wrong id here sends nothing.
alter table public.notification_settings
  add column email_kid_reconnect uuid[] not null default '{}' check (cardinality(email_kid_reconnect) <= 20);

-- Payment due: open one alert per card or loan due in the next three days,
-- and one when it's overdue (the due-soon one is closed then). Alerts close
-- when the payment is no longer due soon or overdue.
create or replace function public.notify_payments_due(today date) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  drop table if exists pg_temp.due;
  -- What's due, from cards and loans.
  create temporary table due on commit drop as
  select a.id, a.household_id, a.owner_user_id, a.name, a.currency,
         d.due_date, d.amount_minor, d.statement_minor, coalesce(d.overdue, false) as overdue
  from (
    select c.account_id, c.next_payment_due_date as due_date, c.minimum_payment_minor as amount_minor,
           c.last_statement_balance_minor as statement_minor, c.is_overdue as overdue
    from public.credit_cards c
    union all
    select l.account_id, l.next_payment_due_date,
           case when l.is_overdue and l.past_due_minor > 0 then l.past_due_minor else l.next_payment_minor end,
           null, l.is_overdue
    from public.loans l
  ) d
  join public.accounts a on a.id = d.account_id
  where d.overdue or (d.due_date between today and today + 3 and coalesce(d.amount_minor, 0) > 0);

  -- Close alerts that no longer match (paid, moved on, or now overdue).
  update public.notifications n set resolved_at = now()
  where n.kind = 'payment_due' and n.resolved_at is null
    and not exists (select 1 from due
                    where due.id = n.ref_id and due.overdue = coalesce((n.data->>'overdue')::boolean, false)
                      and (due.overdue or due.due_date::text = n.data->>'due_date'));

  insert into public.notifications (household_id, user_id, kind, ref_id, data)
  select due.household_id, r.user_id, 'payment_due', due.id,
         jsonb_build_object('account', due.name, 'account_id', due.id, 'due_date', due.due_date,
                            'amount_minor', due.amount_minor, 'statement_minor', due.statement_minor,
                            'currency', due.currency, 'overdue', due.overdue)
         || public.alert_person(due.owner_user_id, r.user_id)
  from due
  cross join lateral public.alert_recipients(due.household_id, due.owner_user_id, false, 'balances') r
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Alerts the server hasn't looked at yet (last two days), with whether to
-- email each one and where. Only confirmed sign-in emails.
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
           or (n.user_id <> o.owner_id and n.kind = 'reconnect'
               and o.owner_id = any (coalesce(s.email_kid_reconnect, '{}'))
               and exists (select 1 from public.household_members k
                           where k.household_id = n.household_id and k.user_id = o.owner_id and k.role in ('teen', 'child'))))
  from public.notifications n
  cross join lateral (
    select coalesce((select i.owner_user_id from public.plaid_items i where n.kind = 'reconnect' and i.id = n.ref_id),
                    (select a.owner_user_id from public.accounts a where n.kind = 'payment_due' and a.id = n.ref_id)) as owner_id
  ) o
  join public.households h on h.id = n.household_id
  left join auth.users u on u.id = n.user_id
  left join public.notification_settings s on s.household_id = n.household_id and s.user_id = n.user_id
  where n.emailed_at is null and n.created_at > now() - interval '2 days'
    and n.resolved_at is null
  order by n.created_at
  limit max_rows
$$;

create or replace function public.mark_emailed(ids uuid[]) returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set emailed_at = now() where id = any (ids) and emailed_at is null
$$;

revoke all on function public.notify_payments_due(date) from public, anon, authenticated;
revoke all on function public.email_outbox(integer) from public, anon, authenticated;
revoke all on function public.mark_emailed(uuid[]) from public, anon, authenticated;
grant execute on function public.notify_payments_due(date) to tallyn_sync;
grant execute on function public.email_outbox(integer) to tallyn_sync;
grant execute on function public.mark_emailed(uuid[]) to tallyn_sync;
