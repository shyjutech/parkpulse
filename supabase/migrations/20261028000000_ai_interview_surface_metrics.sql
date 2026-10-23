-- Phase 4 (AI interview prompt): surface it and measure it.
-- New event names + admin-visible credit/session metrics. No change to the
-- credit/session mechanics themselves (Phases 2-3), only visibility into them.

-- Carries forward 'submit_started', kept permitted (though unused) since the
-- funnel-events migration so historical rows with that name stay valid.
alter table public.events drop constraint events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'landing_view', 'signin_completed', 'company_view', 'submit_started',
  'form_view', 'form_start', 'signin_prompted', 'signin_returned',
  'submit_completed', 'unlock_completed', 'full_company_view', 'search_used',
  'visit', 'campaign_view', 'save_added', 'follow_added', 'checklist_created',
  'experience_requested',
  'credit_granted', 'ai_interview_started', 'ai_interview_completed', 'ai_interview_failed'));

-- Lets the app explicitly set user_id to null on an insert (e.g. when an
-- admin action logs an event about a DIFFERENT user's credit) instead of
-- relying on the column's auth.uid() default, which would otherwise
-- misattribute the event to the admin. The events_insert policy already
-- restricts this to null or the caller's own id either way.
grant insert (user_id) on public.events to authenticated;

-- Lets the admin moderation action know whether approving a submission just
-- granted a credit, so it can log credit_granted accurately -- admin has no
-- SELECT on other users' interview_credits (RLS is strictly own-rows-only,
-- on purpose), so this is the one narrow, admin-gated exception.
create function public.submission_earned_credit(p_submission_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return exists (select 1 from public.interview_credits where submission_id = p_submission_id);
end;
$$;
revoke all on function public.submission_earned_credit(uuid) from public, anon, authenticated;
grant execute on function public.submission_earned_credit(uuid) to authenticated;

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
          from public.ai_interview_sessions where status = 'completed')),
    'by_source', coalesce((select jsonb_agg(row_to_json(t)) from (
        select coalesce(utm_source, 'direct') as source,
               count(distinct anon_id) filter (where name = 'visit') as visitors,
               count(*) filter (where name = 'submit_completed') as submissions
          from public.events
         where name in ('visit', 'submit_completed')
         group by 1 order by 2 desc limit 10) t), '[]'::jsonb));
end;
$$;
