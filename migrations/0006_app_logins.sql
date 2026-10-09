-- 0006_app_logins: separate database logins for the API and the bank sync (#30, ADR 0006)
--
-- Until now the backend logged in as `postgres`, which has BYPASSRLS. Postgres
-- lets a session switch to any role its *login* holds, so SQL injected into a
-- request could `reset role` and read every household. From now on:
--
--   tallyn_api   request handlers. Holds only `authenticated`, which it can
--                switch to (AsUser) but doesn't inherit. On its own it can do
--                nothing, so `reset role` lands on a role with no access.
--   tallyn_sync  the bank sync (0005). Logs in as itself.
--   postgres     migrations only, by hand. The running app never uses it.
--
-- Both roles are created without LOGIN. Passwords are never in migrations or
-- git: an admin turns login on in the Supabase SQL editor (see Dev Setup):
--   alter role tallyn_api  with login password '...';
--   alter role tallyn_sync with login password '...';

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tallyn_api') then
    create role tallyn_api nologin noinherit;
  end if;
end
$$;

-- tallyn_api may SET ROLE authenticated, and that's all. INHERIT FALSE: none
-- of authenticated's rights apply until it switches. (Postgres 16+.)
grant authenticated to tallyn_api with inherit false, set true;

-- Nothing else is granted to tallyn_api. It only has what every role gets
-- through PUBLIC (connect, and usage of the public schema), and Tallyn's
-- tables and checked functions grant nothing to PUBLIC. Tests check it.
