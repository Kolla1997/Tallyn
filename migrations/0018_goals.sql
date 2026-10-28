-- 0018: Savings goals (#14). Decided by Dinesh 2026-10-09 and 2026-10-24
-- (Feature - Goals, Dinesh picked the mix of draft 2).
--
-- A goal belongs to one person (owner_user_id) and fills one of two ways:
-- it follows one of that person's accounts (progress = its balance) or it's
-- updated by hand. Tallyn never moves money.
--
-- Who sees a goal is its own setting: only the owner, the owner and one
-- chosen member, or everyone in the household. Owners and adults also see
-- (and look after) their kids' goals, like budgets (ADR 0014).
--
-- A goal never reveals a balance: when a goal follows an account, its
-- progress (and history) reaches only people who may see that person's
-- balances anyway (can_see_member_data, ADR 0007). Everyone else gets the
-- name and target only. Progress and history come only from goal_progress().
--
-- goal_months keeps each goal's amount at the end of each month, for the
-- forecast and "this month" (draft 2's G and H). Hand updates write it as
-- they happen; snapshot_goals(), run daily by the bank sync's login, writes
-- the months for goals that follow an account.

create table public.goals (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  owner_user_id      uuid not null,
  name               text not null check (char_length(btrim(name)) between 1 and 80),
  target_minor       bigint not null check (target_minor > 0 and target_minor <= 100000000000),
  currency           text not null check (currency ~ '^[A-Z]{3}$'),
  by_month           date check (by_month is null or by_month = date_trunc('month', by_month)::date),
  account_id         uuid, -- follows this account; null: updated by hand
  saved_minor        bigint not null default 0 check (saved_minor >= 0 and saved_minor <= 100000000000),
  visibility         text not null default 'me' check (visibility in ('me', 'member', 'everyone')),
  shared_with        uuid,
  created_by         uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check ((visibility = 'member') = (shared_with is not null)),
  check (shared_with is distinct from owner_user_id),
  -- A goal goes when its person leaves the household.
  foreign key (household_id, owner_user_id) references public.household_members (household_id, user_id) on delete cascade,
  foreign key (household_id, shared_with) references public.household_members (household_id, user_id) on delete cascade,
  -- Unlinking the account turns the goal into one updated by hand.
  foreign key (account_id, household_id) references public.accounts (id, household_id) on delete set null (account_id)
);

create index goals_household on public.goals (household_id);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

create table public.goal_months (
  goal_id      uuid not null references public.goals (id) on delete cascade,
  month        date not null check (month = date_trunc('month', month)::date),
  saved_minor  bigint not null check (saved_minor >= 0),
  primary key (goal_id, month)
);

alter table public.goals enable row level security;
alter table public.goal_months enable row level security;
-- goal_months has no policies: only the functions below read and write it.
revoke all on public.goal_months from public, anon, authenticated;

-- May the current user see this goal (its name and target)?
create or replace function public.can_see_goal(hid uuid, owner_id uuid, vis text, with_user uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and public.is_household_member(hid)
     and (
       owner_id = auth.uid()
       or vis = 'everyone'
       or (vis = 'member' and with_user = auth.uid())
       or (public.has_household_role(hid, array['owner', 'adult'])
           and exists (select 1 from public.household_members k
                       where k.household_id = hid and k.user_id = owner_id and k.role in ('teen', 'child')))
     )
$$;

-- May the current user set up or change a goal for owner_id? Your own (not
-- teens and children: a parent does, as with budgets), or a kid's as an
-- owner or adult.
create or replace function public.can_manage_goal(hid uuid, owner_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(public.can_manage_budget(hid, owner_id), false)
$$;

create policy goals_select on public.goals
  for select to authenticated
  using (public.can_see_goal(household_id, owner_user_id, visibility, shared_with));

create policy goals_insert on public.goals
  for insert to authenticated
  with check (public.can_manage_goal(household_id, owner_user_id) and created_by = auth.uid()
              and (account_id is null or exists (select 1 from public.accounts a
                   where a.id = account_id and a.household_id = goals.household_id and a.owner_user_id = goals.owner_user_id)));

create policy goals_update on public.goals
  for update to authenticated
  using (public.can_manage_goal(household_id, owner_user_id))
  with check (public.can_manage_goal(household_id, owner_user_id)
              and (account_id is null or exists (select 1 from public.accounts a
                   where a.id = account_id and a.household_id = goals.household_id and a.owner_user_id = goals.owner_user_id)));

create policy goals_delete on public.goals
  for delete to authenticated
  using (public.can_manage_goal(household_id, owner_user_id));

-- saved_minor is not readable or writable directly: progress comes only
-- from goal_progress(), and hand updates go through set_goal_saved().
grant select (id, household_id, owner_user_id, name, target_minor, currency, by_month, account_id, visibility, shared_with, created_at, updated_at),
  delete on public.goals to authenticated;
grant insert (household_id, owner_user_id, name, target_minor, currency, by_month, account_id, visibility, shared_with) on public.goals to authenticated;
grant update (name, target_minor, currency, by_month, account_id, visibility, shared_with) on public.goals to authenticated;

-- A goal's progress for the current user: how much is saved now and its
-- month-end history, or nothing when it follows an account whose balance
-- they may not see. Hand-updated goals show to whoever sees the goal.
create or replace function public.goal_progress(p_goal uuid)
returns table (saved_minor bigint, history jsonb)
language sql stable
security definer
set search_path = ''
as $$
  select case when g.account_id is null then g.saved_minor else coalesce(a.current_balance_minor, 0) end,
         coalesce((select jsonb_agg(jsonb_build_object('month', gm.month, 'saved_minor', gm.saved_minor) order by gm.month)
                   from public.goal_months gm where gm.goal_id = g.id), '[]'::jsonb)
  from public.goals g
  left join public.accounts a on a.id = g.account_id
  where g.id = p_goal
    and public.can_see_goal(g.household_id, g.owner_user_id, g.visibility, g.shared_with)
    and (g.account_id is null or public.can_see_member_data(g.household_id, g.owner_user_id, 'balances'))
$$;

-- Update a hand-kept goal's amount, and this month's history with it.
create or replace function public.set_goal_saved(p_goal uuid, p_saved bigint, p_today date) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_saved < 0 or p_saved > 100000000000 then
    raise exception 'saved amount out of range' using errcode = '22023';
  end if;
  update public.goals g set saved_minor = p_saved
  where g.id = p_goal and g.account_id is null and public.can_manage_goal(g.household_id, g.owner_user_id);
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.goal_months (goal_id, month, saved_minor)
  values (p_goal, date_trunc('month', p_today)::date, p_saved)
  on conflict (goal_id, month) do update set saved_minor = excluded.saved_minor;
end;
$$;

-- Daily, by the bank sync's login: this month's amount for every goal that
-- follows an account (its balance now; the last write of a month is that
-- month's closing amount).
create or replace function public.snapshot_goals(p_today date) returns integer
language sql
security definer
set search_path = ''
as $$
  with written as (
    insert into public.goal_months (goal_id, month, saved_minor)
    select g.id, date_trunc('month', p_today)::date, greatest(coalesce(a.current_balance_minor, 0), 0)
    from public.goals g join public.accounts a on a.id = g.account_id
    on conflict (goal_id, month) do update set saved_minor = excluded.saved_minor
    returning 1
  )
  select count(*)::integer from written
$$;

revoke all on function public.can_see_goal(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.can_manage_goal(uuid, uuid) from public, anon;
revoke all on function public.goal_progress(uuid) from public, anon;
revoke all on function public.set_goal_saved(uuid, bigint, date) from public, anon;
revoke all on function public.snapshot_goals(date) from public, anon, authenticated;
grant execute on function public.can_see_goal(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.can_manage_goal(uuid, uuid) to authenticated;
grant execute on function public.goal_progress(uuid) to authenticated;
grant execute on function public.set_goal_saved(uuid, bigint, date) to authenticated;
grant execute on function public.snapshot_goals(date) to tallyn_sync;
