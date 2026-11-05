-- 0027: Product news (#281). Agreed with Dinesh 2026-11-05; he picked
-- option A in drafts/281-product-news.html.
--
--   - A choice per person (not per household): a box at sign-up, ticked by
--     default (unticked for browsers in Europe, which need a real opt-in), a
--     switch in Settings, and a stop link in every newsletter.
--   - Every change is a new row, never an edit: the record of who said yes,
--     when, where and under which Privacy Policy version. The newest row wins;
--     no row means no newsletter.
--   - Newsletters go through Resend from news.coinroof.us, apart from the
--     account emails on Brevo.

create table public.news_choices (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  subscribed      boolean not null,
  source          text not null check (source in ('signup', 'settings', 'stop_link')),
  privacy_version text not null check (char_length(privacy_version) between 1 and 40),
  created_at      timestamptz not null default now()
);
create index news_choices_user_idx on public.news_choices (user_id, created_at desc, id desc);

alter table public.news_choices enable row level security;
revoke all on public.news_choices from public, anon, authenticated;
grant select on public.news_choices to authenticated;
grant insert (user_id, subscribed, source, privacy_version) on public.news_choices to authenticated;

create policy news_choices_select on public.news_choices
  for select to authenticated
  using (user_id = auth.uid());

create policy news_choices_insert on public.news_choices
  for insert to authenticated
  with check (user_id = auth.uid());

-- Who gets the newsletter now: newest choice is yes, email confirmed. For
-- the newsletter sender (not built yet: no campaigns), with the sync's login.
create or replace function public.news_list()
returns table (user_id uuid, email text, name text)
language sql stable
security definer
set search_path = ''
as $$
  select c.user_id, u.email, p.display_name
  from (select distinct on (n.user_id) n.user_id, n.subscribed
        from public.news_choices n
        order by n.user_id, n.created_at desc, n.id desc) c
  join auth.users u on u.id = c.user_id and u.email is not null and u.email_confirmed_at is not null
  join public.profiles p on p.id = c.user_id
  where c.subscribed
$$;

revoke all on function public.news_list() from public, anon, authenticated;
grant execute on function public.news_list() to tallyn_sync;
