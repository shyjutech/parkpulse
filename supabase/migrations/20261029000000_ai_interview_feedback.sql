-- Lets a candidate rate a completed mock interview (1-5 stars, no free text
-- for now). One row per session; a resubmission updates the same row rather
-- than erroring, so retrying after a network blip or changing your mind
-- before leaving the page both just work.

create table public.ai_interview_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.ai_interview_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);
create index ai_interview_feedback_user_idx on public.ai_interview_feedback (user_id);

alter table public.ai_interview_feedback enable row level security;

-- Read-only for the owner; the write goes through the SECURITY DEFINER
-- function below, so there's no insert/update/delete grant at all here.
create policy ai_interview_feedback_select_own on public.ai_interview_feedback
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.ai_interview_feedback from anon, authenticated;
grant select on public.ai_interview_feedback to authenticated;

-- Only the session's own owner, and only once it's actually completed --
-- matches when the client shows the rating prompt (the "done" phase, which
-- only follows a successful complete_ai_session call).
create function public.submit_ai_interview_feedback(p_session_id uuid, p_rating integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.ai_interview_sessions
     where id = p_session_id and user_id = auth.uid() and status = 'completed'
  ) then
    raise exception 'session not found or not completed' using errcode = 'P0002';
  end if;

  insert into public.ai_interview_feedback (session_id, user_id, rating)
  values (p_session_id, auth.uid(), p_rating)
  on conflict (session_id) do update set rating = excluded.rating, created_at = now();
end;
$$;

revoke all on function public.submit_ai_interview_feedback(uuid, integer) from public, anon, authenticated;
grant execute on function public.submit_ai_interview_feedback(uuid, integer) to authenticated;

alter table public.events drop constraint events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'landing_view', 'signin_completed', 'company_view', 'submit_started',
  'form_view', 'form_start', 'signin_prompted', 'signin_returned',
  'submit_completed', 'unlock_completed', 'full_company_view', 'search_used',
  'visit', 'campaign_view', 'save_added', 'follow_added', 'checklist_created',
  'experience_requested',
  'credit_granted', 'ai_interview_started', 'ai_interview_completed', 'ai_interview_failed',
  'ai_interview_feedback_submitted'));

create or replace function public.growth_metrics() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'visitors', (select count(distinct anon_id) from public.events where name = 'visit'),
    'return_visitors', (select count(*) from (
        select anon_id from public.events
         where name = 'visit' and anon_id is not null
         group by anon_id having count(distinct created_at::date) >= 2) r),
    'submissions', (select count(*) from public.events where name = 'submit_completed'),
    'saves', (select count(*) from public.events where name = 'save_added'),
    'follows', (select count(*) from public.events where name = 'follow_added'),
    'checklists', (select count(*) from public.events where name = 'checklist_created'),
    'requests', (select count(*) from public.company_requests),
    'funnel', jsonb_build_object(
      'visitors', (select count(distinct anon_id) from public.events where name = 'visit'),
      'form_view', (select count(distinct anon_id) from public.events where name = 'form_view'),
      'form_start', (select count(distinct anon_id) from public.events where name = 'form_start'),
      'signin_prompted', (select count(distinct anon_id) from public.events where name = 'signin_prompted'),
      'signin_returned', (select count(distinct anon_id) from public.events where name = 'signin_returned'),
      'submit_completed', (select count(distinct anon_id) from public.events where name = 'submit_completed')),
    -- Credits are a permanent ledger (Phase 2+fix), so this count is stable
    -- even after a submission that earned one is later deleted.
    'ai', jsonb_build_object(
      'credits_granted', (select count(*) from public.interview_credits),
      'credits_redeemed', (select count(*) from public.interview_credits where consumed_at is not null),
      'sessions_started', (select count(*) from public.ai_interview_sessions),
      'sessions_completed', (select count(*) from public.ai_interview_sessions where status = 'completed'),
      'sessions_failed', (select count(*) from public.ai_interview_sessions where status = 'failed'),
      'sessions_abandoned', (select count(*) from public.ai_interview_sessions where status = 'abandoned'),
      'avg_tokens_per_completed_session', (
        select coalesce(round(avg(input_tokens + output_tokens)), 0)
          from public.ai_interview_sessions where status = 'completed'),
      'feedback_count', (select count(*) from public.ai_interview_feedback),
      'avg_feedback_rating', (select round(avg(rating)::numeric, 2) from public.ai_interview_feedback)),
    'by_source', coalesce((select jsonb_agg(row_to_json(t)) from (
        select coalesce(utm_source, 'direct') as source,
               count(distinct anon_id) filter (where name = 'visit') as visitors,
               count(*) filter (where name = 'submit_completed') as submissions
          from public.events
         where name in ('visit', 'submit_completed')
         group by 1 order by 2 desc limit 10) t), '[]'::jsonb));
end;
$$;
