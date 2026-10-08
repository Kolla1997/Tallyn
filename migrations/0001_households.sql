-- 0001_households: profiles, households and household members, with RLS (#6)
--
-- A household is the group of people who share money in Tallyn (a family).
-- Every member has one role. A person can belong to more than one household.
--
-- Access model (see docs/04 Tech/ADR/0002-backend-database-access.md):
-- the Go backend runs each user request as the `authenticated` role with the
-- user's ID in request.jwt.claims, so auth.uid() works and these policies apply.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per signed-in person (mirrors auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically when someone signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------

create table public.households (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 80),
  -- ISO 4217 code. The one total balance is shown in this currency.
  home_currency text not null check (home_currency ~ '^[A-Z]{3}$'),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- household_members
-- ---------------------------------------------------------------------------

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- owner:  full control, manages members
  -- adult:  sees everything, links banks
  -- teen:   sees only their own accounts
  -- child:  sees only their own accounts
  -- viewer: sees everything, changes nothing (e.g. an adult child helping a parent)
  -- Spending limits per role come with #12.
  role         text not null check (role in ('owner', 'adult', 'teen', 'child', 'viewer')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);

create trigger household_members_set_updated_at
  before update on public.household_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership checks used by RLS policies.
-- SECURITY DEFINER so they can read household_members without recursing
-- into its own RLS policies. They only ever answer about auth.uid().
-- ---------------------------------------------------------------------------

create or replace function public.is_household_member(hid uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  )
$$;

create or replace function public.has_household_role(hid uuid, roles text[]) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role = any (roles)
  )
$$;

-- True if the current user may see something in household `hid` that belongs
-- to `owner_id`: owners, adults and viewers see everything; teens and
-- children see only their own.
create or replace function public.can_see_member_item(hid uuid, owner_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select public.has_household_role(hid, array['owner', 'adult', 'viewer'])
      or (owner_id = auth.uid() and public.is_household_member(hid))
$$;

-- Keep at least one owner in every household.
create or replace function public.keep_one_owner() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.households h where h.id = old.household_id)
     and not exists (
       select 1 from public.household_members m
       where m.household_id = old.household_id
         and m.role = 'owner'
         and m.user_id <> old.user_id
     )
  then
    raise exception 'a household needs at least one owner';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger household_members_keep_one_owner
  before update or delete on public.household_members
  for each row execute function public.keep_one_owner();

-- Create a household and make the caller its owner, in one step.
-- (A plain INSERT can't do this under RLS: the caller isn't a member yet.)
create or replace function public.create_household(p_name text, p_home_currency text)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  h   public.households;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  insert into public.households (name, home_currency, created_by)
  values (p_name, upper(p_home_currency), uid)
  returning * into h;

  insert into public.household_members (household_id, user_id, role)
  values (h.id, uid, 'owner');

  return h;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anon (the React app never talks to the database).
-- authenticated gets only what the policies below are written for.
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.households, public.household_members from anon, authenticated;

grant select, update (display_name) on public.profiles to authenticated;
grant select, update (name, home_currency), delete on public.households to authenticated;
grant select, insert, update (role), delete on public.household_members to authenticated;

revoke all on function public.create_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;

revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.has_household_role(uuid, text[]) from public, anon;
revoke all on function public.can_see_member_item(uuid, uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.has_household_role(uuid, text[]) to authenticated;
grant execute on function public.can_see_member_item(uuid, uuid) to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.keep_one_owner() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.households        enable row level security;
alter table public.household_members enable row level security;

-- profiles: see yourself and people you share a household with; edit only yourself.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.household_members m
      where m.user_id = profiles.id and public.is_household_member(m.household_id)
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- households: members see it; only owners change or delete it.
-- New households are created with create_household().
create policy households_select on public.households
  for select to authenticated
  using (public.is_household_member(id));

create policy households_update on public.households
  for update to authenticated
  using (public.has_household_role(id, array['owner']))
  with check (public.has_household_role(id, array['owner']));

create policy households_delete on public.households
  for delete to authenticated
  using (public.has_household_role(id, array['owner']));

-- household_members: members see the member list; owners add, change and
-- remove members; anyone can leave a household.
-- TODO(#12): invitations, so people join by accepting rather than being added.
create policy household_members_select on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

create policy household_members_insert on public.household_members
  for insert to authenticated
  with check (public.has_household_role(household_id, array['owner']));

create policy household_members_update on public.household_members
  for update to authenticated
  using (public.has_household_role(household_id, array['owner']))
  with check (public.has_household_role(household_id, array['owner']));

create policy household_members_delete on public.household_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.has_household_role(household_id, array['owner'])
  );
