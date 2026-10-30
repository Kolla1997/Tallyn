-- 0019: an owner resets a teen's two-step sign-in (#120, ADR 0009, ADR 0013).
--
-- Agreed with Dinesh, 2026-10-30: only an owner, only for a teen in the same
-- household, after a fresh 2FA code (the API checks it). The server removes
-- the teen's authenticators with the server-only key (ADR 0013); this
-- migration adds the rest:
--
-- 1. twofa_resets: who reset whom, and when. Nobody reads or changes it
--    through the app: it has no policies, and only the functions below touch it.
-- 2. reset_member_2fa(): checks the rules, writes the record and removes the
--    teen's backup codes, run as the owner. The API removes the authenticators
--    in the same transaction, so a failure at Supabase changes nothing here.
-- 3. my_2fa_reset(): who last reset the signed-in person's 2FA, and when, for
--    the note at their next sign-in. Only their own, only the last 30 days.

-- 1. The record.
create table public.twofa_resets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  reset_by     uuid references public.profiles (id) on delete set null,
  member       uuid not null references public.profiles (id) on delete cascade,
  reset_at     timestamptz not null default now()
);
create index twofa_resets_member on public.twofa_resets (member, reset_at desc);
alter table public.twofa_resets enable row level security;
revoke all on public.twofa_resets from public, anon, authenticated;

-- 2. The reset. Anything but an owner resetting a teen in their own household
-- is refused, and refusals look the same, so they reveal nothing.
create or replace function public.reset_member_2fa(p_household uuid, p_member uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_member = me
     or not exists (select 1 from public.household_members m
                    where m.household_id = p_household and m.user_id = me and m.role = 'owner')
     or not exists (select 1 from public.household_members m
                    where m.household_id = p_household and m.user_id = p_member and m.role = 'teen') then
    raise exception 'only an owner can reset a teen''s two-step sign-in' using errcode = '42501';
  end if;
  insert into public.twofa_resets (household_id, reset_by, member) values (p_household, me, p_member);
  delete from public.backup_codes where user_id = p_member;
end;
$$;

-- 3. The note at the teen's next sign-in.
create or replace function public.my_2fa_reset()
returns table (reset_by_name text, reset_at timestamptz)
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(p.display_name, ''), r.reset_at
  from public.twofa_resets r
  left join public.profiles p on p.id = r.reset_by
  where r.member = auth.uid() and r.reset_at > now() - interval '30 days'
  order by r.reset_at desc
  limit 1
$$;

revoke all on function public.reset_member_2fa(uuid, uuid) from public, anon;
revoke all on function public.my_2fa_reset() from public, anon;
grant execute on function public.reset_member_2fa(uuid, uuid) to authenticated;
grant execute on function public.my_2fa_reset() to authenticated;
