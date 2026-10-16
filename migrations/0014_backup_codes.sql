-- 0014_backup_codes: one-time backup codes for a lost authenticator (#23, ADR 0013)
--
-- Ten codes per person, shown once. Only a keyed hash is stored: the Go server
-- computes HMAC-SHA-256 with a key the database never sees, so a copy of this
-- table alone can't be used to guess codes. People can see how many codes
-- they have left and when they were made, never the hashes. Codes are only
-- replaced or used through the two functions below, which act on the
-- signed-in person alone. Closing an account (#56) removes them with the
-- profile.

create table public.backup_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  code_hash  bytea not null check (octet_length(code_hash) = 32),
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  unique (user_id, code_hash)
);

create index backup_codes_user on public.backup_codes (user_id) where used_at is null;

alter table public.backup_codes enable row level security;

revoke all on public.backup_codes from anon, authenticated;
-- Never the hash.
grant select (id, user_id, created_at, used_at) on public.backup_codes to authenticated;

create policy backup_codes_select on public.backup_codes
  for select to authenticated
  using (user_id = auth.uid());

-- Replaces the signed-in person's codes with a new set of ten. The API asks
-- for a fresh 2FA code first (step-up, ADR 0009).
create or replace function public.replace_backup_codes(p_hashes bytea[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce(array_length(p_hashes, 1), 0) <> 10
     or exists (select 1 from unnest(p_hashes) h where octet_length(h) <> 32) then
    raise exception 'ten 32-byte hashes expected' using errcode = '22023';
  end if;
  delete from public.backup_codes where user_id = me;
  insert into public.backup_codes (user_id, code_hash)
  select me, h from unnest(p_hashes) h;
end;
$$;

-- Uses one of the signed-in person's codes: true if it matched an unused
-- code (now used), false otherwise. Wrong codes change nothing. The other
-- codes stay until the new set made after the new authenticator replaces
-- them, so a recovery that fails halfway still leaves codes to try again.
create or replace function public.use_backup_code(p_hash bytea)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  hit uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.backup_codes set used_at = now()
  where user_id = me and code_hash = p_hash and used_at is null
  returning id into hit;
  return hit is not null;
end;
$$;

revoke all on function public.replace_backup_codes(bytea[]) from public, anon;
revoke all on function public.use_backup_code(bytea) from public, anon;
grant execute on function public.replace_backup_codes(bytea[]) to authenticated;
grant execute on function public.use_backup_code(bytea) to authenticated;
