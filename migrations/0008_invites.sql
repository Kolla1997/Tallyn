-- 0008_invites: joining a household by invitation (#12, ADR 0008)
--
-- An owner invites an email address with a role. The backend makes a random
-- one-time token, sends the owner a link containing it, and stores only its
-- SHA-256 hash. The invited person signs in, and accept_household_invite()
-- adds them, only if:
--   - the token's hash matches an invite that isn't used, cancelled or expired
--   - their *confirmed* sign-in email is the invited email (a leaked link is
--     useless to anyone else)
-- Decided 2026-10-09: only owners invite; invites are single use and last 7
-- days; adults, teens and viewers can be invited, children can't (no logins
-- under 13 until a legal check on parental consent).

create table public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email        text not null check (email = lower(email) and char_length(email) between 3 and 254 and email like '%_@_%'),
  role         text not null check (role in ('adult', 'teen', 'viewer')),
  token_hash   bytea not null unique check (octet_length(token_hash) = 32),
  invited_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references public.profiles (id) on delete set null,
  revoked_at   timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);

-- One open invite per email per household.
create unique index household_invites_open_idx on public.household_invites (household_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.household_invites enable row level security;

-- Owners see their household's invites, never the token hash.
revoke all on public.household_invites from anon, authenticated;
grant select (id, household_id, email, role, invited_by, created_at, expires_at, accepted_at, revoked_at)
  on public.household_invites to authenticated;

create policy household_invites_select on public.household_invites
  for select to authenticated
  using (public.has_household_role(household_id, array['owner']));

-- ---------------------------------------------------------------------------
-- Functions: the only way to create, cancel and accept invites
-- ---------------------------------------------------------------------------

create or replace function public.create_household_invite(
  p_household_id uuid, p_email text, p_role text, p_token_hash bytea, p_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_id    uuid;
begin
  if uid is null or not public.has_household_role(p_household_id, array['owner']) then
    raise exception 'only owners can invite' using errcode = '42501';
  end if;
  if p_role not in ('adult', 'teen', 'viewer') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.household_members m join auth.users u on u.id = m.user_id
    where m.household_id = p_household_id and lower(u.email) = v_email
  ) then
    raise exception 'already a member' using errcode = '23505';
  end if;
  if (select count(*) from public.household_invites i
      where i.household_id = p_household_id and i.accepted_at is null and i.revoked_at is null
        and i.expires_at > now()) >= 20 then
    raise exception 'too many open invites' using errcode = '22023';
  end if;
  -- A previous open invite for the same email is replaced.
  update public.household_invites i set revoked_at = now()
  where i.household_id = p_household_id and i.email = v_email and i.accepted_at is null and i.revoked_at is null;

  insert into public.household_invites (household_id, email, role, token_hash, invited_by, expires_at)
  values (p_household_id, v_email, p_role, p_token_hash, uid, p_expires_at)
  returning household_invites.id into v_id;
  return v_id;
end;
$$;

create or replace function public.revoke_household_invite(p_invite_id uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.household_invites i set revoked_at = now()
  where i.id = p_invite_id and i.accepted_at is null and i.revoked_at is null
    and public.has_household_role(i.household_id, array['owner']);
  return found;
end;
$$;

-- Returns the household joined. One error for every refusal, so the link
-- can't be used to learn whether an invite exists or who it's for.
create or replace function public.accept_household_invite(p_token_hash bytea) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv public.household_invites;
  my_email text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select lower(u.email) into my_email from auth.users u
  where u.id = uid and u.email_confirmed_at is not null;

  select * into inv from public.household_invites i
  where i.token_hash = p_token_hash
  for update;

  if inv.id is null or inv.accepted_at is not null or inv.revoked_at is not null
     or inv.expires_at <= now() or my_email is null or inv.email <> my_email then
    raise exception 'invite not valid for this account' using errcode = '42501';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, uid, inv.role)
  on conflict (household_id, user_id) do nothing;

  update public.household_invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.household_id;
end;
$$;

revoke all on function public.create_household_invite(uuid, text, text, bytea, timestamptz) from public, anon;
revoke all on function public.revoke_household_invite(uuid) from public, anon;
revoke all on function public.accept_household_invite(bytea) from public, anon;
grant execute on function public.create_household_invite(uuid, text, text, bytea, timestamptz) to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;
grant execute on function public.accept_household_invite(bytea) to authenticated;
