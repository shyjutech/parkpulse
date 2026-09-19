-- LOCAL TEST HARNESS ONLY: minimal stand-ins for Supabase's roles/auth schema
-- so the migration and RLS tests can run on a plain PostgreSQL. Never run this
-- against a real Supabase project.
create role anon nologin;
create role authenticated nologin;
create schema extensions;
create schema auth;
grant usage on schema public, auth, extensions to anon, authenticated;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
