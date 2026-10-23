-- Abandoned AI interview sessions. A session left 'active' with no further
-- activity for too long (tab closed, connection lost, candidate just walked
-- away) is marked 'abandoned'. If fewer than 2 answers were given, its
-- credit is restored -- they got little or nothing out of it. At 2 or more,
-- the credit stays spent, matching the same "did they get real value"
-- reasoning fail_ai_session already uses.

alter table public.ai_interview_sessions
  add column last_activity_at timestamptz not null default now();

-- record_ai_turn and add_ai_session_tokens are the only things that happen
-- during a session, so both now bump last_activity_at.
create or replace function public.record_ai_turn(p_session_id uuid, p_input_tokens integer, p_output_tokens integer, p_model text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update public.ai_interview_sessions
     set message_count = message_count + 1,
         input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
         model = coalesce(p_model, model),
         last_activity_at = now()
   where id = p_session_id and user_id = auth.uid() and status = 'active'
  returning message_count into v_count;

  if v_count is null then
    raise exception 'session not found or not active' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

create or replace function public.add_ai_session_tokens(p_session_id uuid, p_input_tokens integer, p_output_tokens integer, p_model text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ai_interview_sessions
     set input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
         model = coalesce(p_model, model),
         last_activity_at = now()
   where id = p_session_id and user_id = auth.uid() and status = 'active';

  if not found then
    raise exception 'session not found or not active' using errcode = 'P0002';
  end if;
end;
$$;

create function public.abandon_timeout_minutes() returns integer
language sql immutable as $$ select 20 $$;

-- p_user null = sweep every stale session (admin only — meant for an
-- occasional manual run from the SQL editor, or a future pg_cron job; none
-- is set up yet). p_user set = scoped to one user, which must be either the
-- caller themselves or the admin — this is also what start_ai_interview and
-- the respond route call on every use, so staleness is actually enforced in
-- practice without needing a scheduled job at all.
create function public.abandon_stale_sessions(p_user uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r record;
begin
  if p_user is null then
    if not public.is_admin() then
      raise exception 'admin only' using errcode = '42501';
    end if;
  elsif p_user <> auth.uid() and not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  for r in
    select id, user_id, message_count
      from public.ai_interview_sessions
     where status = 'active'
       and last_activity_at < now() - (public.abandon_timeout_minutes() || ' minutes')::interval
       and (p_user is null or user_id = p_user)
  loop
    update public.ai_interview_sessions
       set status = 'abandoned', completed_at = now()
     where id = r.id;
    if r.message_count < 2 then
      update public.interview_credits
         set consumed_at = null, session_id = null
       where session_id = r.id and user_id = r.user_id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.abandon_stale_sessions(uuid) from public, anon, authenticated;
grant execute on function public.abandon_stale_sessions(uuid) to authenticated;

-- Self-heal on every attempt to start a new interview: a stale session from
-- last time never blocks (or confuses) today's daily-limit count, and its
-- credit comes back automatically if it qualifies.
create or replace function public.start_ai_interview(p_role text, p_experience_level text, p_company_id uuid default null)
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

  perform public.abandon_stale_sessions(v_user);

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
