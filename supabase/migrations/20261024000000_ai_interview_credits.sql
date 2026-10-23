-- AI interview credits (database and rules only — Phase 2 of the AI-interview
-- prompt). No AI call happens yet: start_ai_interview() consumes a credit and
-- opens a session row; Phase 3 is what actually talks to a model and fills
-- in message_count/tokens/status.

-- ---------------------------------------------------------------------------
-- Easy-to-change constants. SQL functions rather than a settings row so every
-- caller (trigger, RPC, backfill) reads the same single source of truth.
-- ---------------------------------------------------------------------------
create function public.max_free_credits() returns integer
language sql immutable as $$ select 3 $$;

create function public.max_daily_ai_sessions() returns integer
language sql immutable as $$ select 2 $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.ai_interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  role text not null check (char_length(btrim(role)) between 2 and 100),
  experience_level text not null
    check (experience_level in ('Fresher', '0–2 years', '3–5 years', '6–10 years', '10+ years')),
  status text not null default 'active' check (status in ('active', 'completed', 'failed', 'abandoned')),
  message_count integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  model text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ai_interview_sessions_user_idx on public.ai_interview_sessions (user_id, created_at);

-- One row per submission that ever earned a credit. The unique constraint on
-- submission_id is what makes granting idempotent: re-approving (or
-- rejecting-then-re-approving) the same submission can insert at most once,
-- ON CONFLICT DO NOTHING either way.
create table public.interview_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  granted_at timestamptz not null default now(),
  consumed_at timestamptz,
  session_id uuid references public.ai_interview_sessions (id) on delete set null
);
create index interview_credits_user_idx on public.interview_credits (user_id);

alter table public.ai_interview_sessions enable row level security;
alter table public.interview_credits enable row level security;

-- Read-only for the owner; every write goes through a SECURITY DEFINER
-- function below, so there are no insert/update/delete grants at all here.
create policy ai_sessions_select_own on public.ai_interview_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy credits_select_own on public.interview_credits
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.ai_interview_sessions from anon, authenticated;
grant select on public.ai_interview_sessions to authenticated;
revoke all on public.interview_credits from anon, authenticated;
grant select on public.interview_credits to authenticated;

-- ---------------------------------------------------------------------------
-- Granting: fires only on an actual pending/rejected -> approved transition
-- (the WHEN clause), so re-saving an already-approved row is a no-op before
-- the unique constraint even gets involved. An advisory lock serializes
-- grants per user so two submissions approved for the same author at the
-- same instant can't both slip past the cap check.
-- ---------------------------------------------------------------------------
create function public.grant_interview_credit_on_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  if (select count(*) from public.interview_credits where user_id = new.user_id) < public.max_free_credits() then
    insert into public.interview_credits (user_id, submission_id)
    values (new.user_id, new.id)
    on conflict (submission_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger submissions_grant_credit_trg
  after update of status on public.submissions
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.grant_interview_credit_on_approval();

-- ---------------------------------------------------------------------------
-- Spending: one transaction, advisory-locked per user for its whole duration,
-- so the daily-limit count and the credit selection below can't race against
-- a second concurrent call for the same user. The SELECT ... FOR UPDATE is
-- kept too (belt and suspenders, and correct on its own: Postgres re-checks
-- `consumed_at is null` after acquiring the row lock, so even without the
-- advisory lock a credit already consumed by a concurrent transaction would
-- correctly drop out of this query rather than being handed out twice).
-- ---------------------------------------------------------------------------
create function public.start_ai_interview(p_role text, p_experience_level text, p_company_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_credit_id uuid;
  v_session_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  if (select count(*) from public.ai_interview_sessions
       where user_id = v_user and created_at >= date_trunc('day', now())) >= public.max_daily_ai_sessions() then
    raise exception 'daily interview limit reached' using errcode = 'P0001';
  end if;

  select id into v_credit_id
    from public.interview_credits
   where user_id = v_user and consumed_at is null
   order by granted_at
   limit 1
   for update;

  if v_credit_id is null then
    raise exception 'no interview credit available' using errcode = 'P0001';
  end if;

  insert into public.ai_interview_sessions (user_id, company_id, role, experience_level)
  values (v_user, p_company_id, btrim(p_role), p_experience_level)
  returning id into v_session_id;

  update public.interview_credits
     set consumed_at = now(), session_id = v_session_id
   where id = v_credit_id;

  return v_session_id;
end;
$$;

revoke all on function public.start_ai_interview(text, text, uuid) from public, anon, authenticated;
grant execute on function public.start_ai_interview(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: admin-triggered, not run by this migration. One credit for each
-- user whose earliest approved submission hasn't already earned one (the
-- "already has an approved submission" cohort, not one credit per historical
-- approval). Idempotent via the same unique constraint as live grants, so
-- it's safe to call more than once — a second call grants 0.
-- ---------------------------------------------------------------------------
create function public.backfill_legacy_credits() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_granted integer := 0;
  r record;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  for r in
    select distinct on (user_id) id as submission_id, user_id
      from public.submissions
     where status = 'approved'
     order by user_id, submitted_at
  loop
    if (select count(*) from public.interview_credits where user_id = r.user_id) < public.max_free_credits() then
      insert into public.interview_credits (user_id, submission_id)
      values (r.user_id, r.submission_id)
      on conflict (submission_id) do nothing;
      if found then v_granted := v_granted + 1; end if;
    end if;
  end loop;
  return v_granted;
end;
$$;

revoke all on function public.backfill_legacy_credits() from public, anon, authenticated;
grant execute on function public.backfill_legacy_credits() to authenticated;
