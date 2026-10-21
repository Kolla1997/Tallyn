-- 0015_budgets: budgets for the household or one person (#13, ADR 0014)
--
-- A budget is an amount, for a week or a month, for some spending: every
-- category, or one. It covers the household (member_user_id is null) or one
-- person. Progress is spending only: money out, not income, transfers or loan
-- payments (#77), in the budget's currency (the household's home currency).
--
-- Whose spending counts in a HOUSEHOLD budget (Dinesh, 2026-10-17, option B):
--   - people who chose "Count my spending in household budgets"
--     (household_members.count_in_budgets), and
--   - teens and children, automatically: their parents already see it (#28).
-- Only daily TOTALS ever leave the database for this, never transactions, and
-- only through budget_spending() below.
--
-- Who can see and change what:
--   - Household budgets: every member sees them; owners and adults create,
--     change and delete them.
--   - A budget for one person: that person sees it, and so do owners and adults
--     when the person is a teen or child. Owners and adults set them on teens
--     and children; anyone else who isn't a teen or child sets their own.

alter table public.household_members
  add column count_in_budgets boolean not null default false;

-- Only the person changes their own choice (set_count_in_budgets below).
-- Updates were already limited to the role column (0001); inserts covered
-- every column, so an owner adding someone could have switched it on for
-- them. New members now start with only their household, person and role.
revoke insert on public.household_members from authenticated;
grant insert (household_id, user_id, role) on public.household_members to authenticated;

create table public.budgets (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  member_user_id uuid,
  category       text check (category ~ '^[A-Z][A-Z_]{1,59}$'),
  period         text not null check (period in ('week', 'month')),
  amount_minor   bigint not null check (amount_minor > 0 and amount_minor <= 100000000000),
  currency       text not null check (currency ~ '^[A-Z]{3}$'),
  created_by     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A person's budget goes when they leave the household.
  foreign key (household_id, member_user_id)
    references public.household_members (household_id, user_id) on delete cascade
);

create index budgets_household on public.budgets (household_id);

alter table public.budgets enable row level security;

-- ---------------------------------------------------------------------------
-- The rules, as functions so the policies and budget_spending() share them.
-- ---------------------------------------------------------------------------

-- May the current user see a budget for `member` (null: the household)?
create or replace function public.can_see_budget(hid uuid, member uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and public.is_household_member(hid)
     and (
       member is null
       or member = auth.uid()
       or (public.has_household_role(hid, array['owner', 'adult'])
           and exists (select 1 from public.household_members k
                       where k.household_id = hid and k.user_id = member and k.role in ('teen', 'child')))
     )
$$;

-- May the current user create, change or delete a budget for `member`?
create or replace function public.can_manage_budget(hid uuid, member uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(auth.uid() is not null
     and (
       (member is null and public.has_household_role(hid, array['owner', 'adult']))
       or (member = auth.uid()
           and public.is_household_member(hid)
           and not public.has_household_role(hid, array['teen', 'child']))
       or (member is not null and member <> auth.uid()
           and public.has_household_role(hid, array['owner', 'adult'])
           and exists (select 1 from public.household_members k
                       where k.household_id = hid and k.user_id = member and k.role in ('teen', 'child')))
     ), false)
$$;

revoke all on public.budgets from anon, authenticated;
grant select on public.budgets to authenticated;
grant insert (household_id, member_user_id, category, period, amount_minor, currency) on public.budgets to authenticated;
grant update (category, period, amount_minor, updated_at) on public.budgets to authenticated;
grant delete on public.budgets to authenticated;

create policy budgets_select on public.budgets
  for select to authenticated
  using (public.can_see_budget(household_id, member_user_id));

create policy budgets_insert on public.budgets
  for insert to authenticated
  with check (public.can_manage_budget(household_id, member_user_id) and created_by = auth.uid());

create policy budgets_update on public.budgets
  for update to authenticated
  using (public.can_manage_budget(household_id, member_user_id))
  with check (public.can_manage_budget(household_id, member_user_id));

create policy budgets_delete on public.budgets
  for delete to authenticated
  using (public.can_manage_budget(household_id, member_user_id));

-- ---------------------------------------------------------------------------
-- Counting your spending in household budgets: only you change your own.
-- ---------------------------------------------------------------------------
create or replace function public.set_count_in_budgets(hid uuid, on_ boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_household_member(hid) then
    raise exception 'not a member of this household' using errcode = '42501';
  end if;
  update public.household_members set count_in_budgets = on_, updated_at = now()
  where household_id = hid and user_id = auth.uid();
end;
$$;

-- Who counts in this household's budgets: everyone, with whether they count
-- and whether that's automatic (teens and children). Members only.
create or replace function public.budget_counting(hid uuid)
returns table (user_id uuid, counted boolean, automatic boolean)
language sql stable
security definer
set search_path = ''
as $$
  select m.user_id,
         m.count_in_budgets or m.role in ('teen', 'child'),
         m.role in ('teen', 'child')
  from public.household_members m
  where m.household_id = hid and public.is_household_member(hid)
$$;

-- ---------------------------------------------------------------------------
-- Progress: spending per day for one budget between two dates. Totals only.
-- Empty when the current user may not see the budget.
-- ---------------------------------------------------------------------------
create or replace function public.budget_spending(p_budget uuid, p_from date, p_to date)
returns table (day date, amount_minor bigint)
language sql stable
security definer
set search_path = ''
as $$
  select t.date, sum(t.amount_minor)::bigint
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
  group by t.date
  order by t.date
$$;

revoke all on function public.can_see_budget(uuid, uuid) from public, anon;
revoke all on function public.can_manage_budget(uuid, uuid) from public, anon;
revoke all on function public.set_count_in_budgets(uuid, boolean) from public, anon;
revoke all on function public.budget_counting(uuid) from public, anon;
revoke all on function public.budget_spending(uuid, date, date) from public, anon;
grant execute on function public.can_see_budget(uuid, uuid) to authenticated;
grant execute on function public.can_manage_budget(uuid, uuid) to authenticated;
grant execute on function public.set_count_in_budgets(uuid, boolean) to authenticated;
grant execute on function public.budget_counting(uuid) to authenticated;
grant execute on function public.budget_spending(uuid, date, date) to authenticated;
