-- 0010_consents: who agreed to which version of the Terms and Privacy Policy (#36)
--
-- One row per person, document and version, written when they tick "I agree".
-- It's a record, so rows are never changed or deleted by people: you can add
-- your own and read your own, nothing else. The time comes from the database,
-- so nobody can backdate an agreement. Closing an account (#56) removes the
-- rows with the profile.

create table public.consents (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  document    text not null check (document in ('terms', 'privacy')),
  version     text not null check (char_length(version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  primary key (user_id, document, version)
);

alter table public.consents enable row level security;

revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;
-- Only these columns: accepted_at always comes from the default.
grant insert (user_id, document, version) on public.consents to authenticated;

create policy consents_select on public.consents
  for select to authenticated
  using (user_id = auth.uid());

create policy consents_insert on public.consents
  for insert to authenticated
  with check (user_id = auth.uid());
