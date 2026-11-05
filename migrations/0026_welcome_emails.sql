-- 0026: Welcome email (#280). Agreed with Dinesh 2026-11-05; he picked F
-- in drafts/280-welcome-emails.html.
--
--   - Sent once to each person who agrees to the terms and privacy policy,
--     after their email is confirmed. An account email: it can't be turned off.
--   - Only for people who first agreed within the last 7 days, so the
--     accounts made before this migration don't all get one at once.
--   - The invite email is sent by the API when the invite is made (the join
--     link's token exists only then), so nothing is stored for it here.
--
-- The server reads these with the sync's login (tallyn_sync) only.

-- Who was looked at, so nothing is sent twice. sent is false when the email
-- couldn't be built.
create table public.welcome_emails (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  sent       boolean not null,
  created_at timestamptz not null default now()
);
alter table public.welcome_emails enable row level security; -- no policies: the app's login never reads it
revoke all on public.welcome_emails from public, anon, authenticated;

-- Who is due a welcome email now.
create or replace function public.welcome_due(p_at timestamptz)
returns table (user_id uuid, email text, name text)
language sql stable
security definer
set search_path = ''
as $$
  select p.id, u.email, p.display_name
  from public.profiles p
  join auth.users u on u.id = p.id and u.email is not null and u.email_confirmed_at is not null
  where exists (select 1 from public.consents c where c.user_id = p.id and c.document = 'terms')
    and exists (select 1 from public.consents c where c.user_id = p.id and c.document = 'privacy')
    and (select min(c.accepted_at) from public.consents c where c.user_id = p.id) > p_at - interval '7 days'
    and not exists (select 1 from public.welcome_emails w where w.user_id = p.id)
  order by p.id
  limit 50
$$;

create or replace function public.mark_welcome(uid uuid, was_sent boolean) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.welcome_emails (user_id, sent) values (uid, was_sent)
  on conflict do nothing
$$;

revoke all on function public.welcome_due(timestamptz) from public, anon, authenticated;
revoke all on function public.mark_welcome(uuid, boolean) from public, anon, authenticated;
grant execute on function public.welcome_due(timestamptz) to tallyn_sync;
grant execute on function public.mark_welcome(uuid, boolean) to tallyn_sync;
