-- Fix the submit-funnel analytics: `submit_started` was actually a page-view
-- event (it fired on every mount of /submit, signed in or not, with no dedup
-- and no check that a field was touched), so it was being read as intent when
-- it only measured visits. This replaces it with a real funnel.

-- Constraint first, then reclassify: the old constraint doesn't know
-- 'form_view' yet, so renaming rows into it before swapping the constraint
-- would itself violate the check. 'submit_started' stays permitted here (it
-- would otherwise fail ADD CONSTRAINT's validation of the pre-existing rows
-- below, before they're reclassified) purely as a harmless legacy value —
-- nothing in the app emits it any more.
alter table public.events drop constraint events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'landing_view', 'signin_completed', 'company_view', 'submit_started',
  'form_view', 'form_start', 'signin_prompted', 'signin_returned',
  'submit_completed', 'unlock_completed', 'full_company_view', 'search_used',
  'visit', 'campaign_view', 'save_added', 'follow_added', 'checklist_created',
  'experience_requested'));

-- Reclassify history: every existing `submit_started` row measured exactly
-- what `form_view` now measures, so relabel rather than orphan that data.
update public.events set name = 'form_view' where name = 'submit_started';

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
    -- Unique visitors reaching each stage. Distinct anon_id throughout (not raw
    -- event counts) so the stages form a true funnel and can be read as %-of-
    -- visitors drop-off, even though `submissions` above counts every submit.
    'funnel', jsonb_build_object(
      'visitors', (select count(distinct anon_id) from public.events where name = 'visit'),
      'form_view', (select count(distinct anon_id) from public.events where name = 'form_view'),
      'form_start', (select count(distinct anon_id) from public.events where name = 'form_start'),
      'signin_prompted', (select count(distinct anon_id) from public.events where name = 'signin_prompted'),
      'signin_returned', (select count(distinct anon_id) from public.events where name = 'signin_returned'),
      'submit_completed', (select count(distinct anon_id) from public.events where name = 'submit_completed')),
    'by_source', coalesce((select jsonb_agg(row_to_json(t)) from (
        select coalesce(utm_source, 'direct') as source,
               count(distinct anon_id) filter (where name = 'visit') as visitors,
               count(*) filter (where name = 'submit_completed') as submissions
          from public.events
         where name in ('visit', 'submit_completed')
         group by 1 order by 2 desc limit 10) t), '[]'::jsonb));
end;
$$;
