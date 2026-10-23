-- AI interview turns (Phase 3 of the AI-interview prompt). The chat itself
-- happens in the app, talking to an OpenAI-compatible provider directly; no
-- transcript text is ever written here. These functions are the only way a
-- session's state (message_count, token totals, status) can change after
-- creation.

-- Records one turn's usage and advances the question count. Owner + active
-- checks are inline (only 3 such functions; a shared helper isn't worth it).
create function public.record_ai_turn(p_session_id uuid, p_input_tokens integer, p_output_tokens integer, p_model text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update public.ai_interview_sessions
     set message_count = message_count + 1,
         input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
         model = coalesce(p_model, model)
   where id = p_session_id and user_id = auth.uid() and status = 'active'
  returning message_count into v_count;

  if v_count is null then
    raise exception 'session not found or not active' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

-- Same bookkeeping as record_ai_turn but without advancing message_count --
-- used for the end-of-session feedback call, which isn't "another question".
create function public.add_ai_session_tokens(p_session_id uuid, p_input_tokens integer, p_output_tokens integer, p_model text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ai_interview_sessions
     set input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
         model = coalesce(p_model, model)
   where id = p_session_id and user_id = auth.uid() and status = 'active';

  if not found then
    raise exception 'session not found or not active' using errcode = 'P0002';
  end if;
end;
$$;

create function public.complete_ai_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.ai_interview_sessions
     set status = 'completed', completed_at = now()
   where id = p_session_id and user_id = auth.uid() and status = 'active';

  if not found then
    raise exception 'session not found or not active' using errcode = 'P0002';
  end if;
end;
$$;

-- Marks a session failed and restores its credit (same row: consumed_at and
-- session_id are cleared, not a new row inserted), so a later start_ai_interview
-- call can hand it out again. Returns false rather than raising when there's
-- nothing to do (already completed/failed), so callers can use it defensively
-- in error handling without needing try/catch for a non-exceptional case.
create function public.fail_ai_session(p_session_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  update public.ai_interview_sessions
     set status = 'failed', completed_at = now()
   where id = p_session_id and user_id = v_user and status = 'active';

  if not found then
    return false;
  end if;

  update public.interview_credits
     set consumed_at = null, session_id = null
   where session_id = p_session_id and user_id = v_user;

  return true;
end;
$$;

revoke all on function public.record_ai_turn(uuid, integer, integer, text) from public, anon, authenticated;
revoke all on function public.add_ai_session_tokens(uuid, integer, integer, text) from public, anon, authenticated;
revoke all on function public.complete_ai_session(uuid) from public, anon, authenticated;
revoke all on function public.fail_ai_session(uuid) from public, anon, authenticated;
grant execute on function public.record_ai_turn(uuid, integer, integer, text) to authenticated;
grant execute on function public.add_ai_session_tokens(uuid, integer, integer, text) to authenticated;
grant execute on function public.complete_ai_session(uuid) to authenticated;
grant execute on function public.fail_ai_session(uuid) to authenticated;
