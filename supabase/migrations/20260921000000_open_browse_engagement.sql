-- ParkPulse: open browsing, simpler contributions, follows/saves/prep, demand
-- requests and growth analytics. Additive: existing rows are preserved.

-- ---------------------------------------------------------------------------
-- 1. Simpler contributions: only company, role, level, interview month and one
--    question/topic are required. Everything else becomes optional.
-- ---------------------------------------------------------------------------
alter table public.submissions
  alter column rounds drop not null,
  alter column difficulty drop not null,
  alter column outcome drop not null,
  alter column salary_type drop not null,
  alter column rating drop not null,
  alter column culture_notes drop not null;

alter table public.submissions
  drop constraint submissions_rounds_check,
  drop constraint submissions_questions_check,
  drop constraint submissions_culture_notes_check,
  drop constraint salary_bucket_matches_type;

alter table public.submissions
  add constraint submissions_rounds_check
    check (rounds is null or char_length(btrim(rounds)) between 15 and 3000),
  add constraint submissions_questions_check
    check (char_length(btrim(questions)) between 10 and 5000),
  add constraint submissions_culture_notes_check
    check (culture_notes is null or char_length(btrim(culture_notes)) between 15 and 3000),
  -- A salary range needs a type; "Not disclosed" or no type means no range.
  add constraint salary_bucket_matches_type check (
    (salary_type is null or salary_type = 'Not disclosed') = (salary_bucket is null));

-- New rows must carry an interview month. Enforced on insert (not as a table
-- check) so older rows without one keep working when moderated.
drop policy submissions_insert_own on public.submissions;
create policy submissions_insert_own on public.submissions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and moderated_at is null
    and interview_date is not null);

-- Search vector must tolerate optional fields.
create or replace function public.submissions_set_search_vector() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_company text;
begin
  select c.name into v_company from public.companies c where c.id = new.company_id;
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(v_company, '')), 'A')
    || setweight(to_tsvector('english', coalesce(new.role, '')), 'B')
    || setweight(to_tsvector('english', coalesce(new.questions, '')), 'B')
    || setweight(to_tsvector('english', coalesce(new.rounds, '')), 'C')
    || setweight(to_tsvector('english', coalesce(new.culture_notes, '')), 'D');
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Open browsing: approved reports are readable by everyone. Authors remain
--    hidden because user_id is still not selectable by any API role.
-- ---------------------------------------------------------------------------
drop policy submissions_select_approved on public.submissions;
create policy submissions_select_approved on public.submissions
  for select to anon, authenticated using (status = 'approved');

grant select (id, company_id, role, experience_level, interview_date, rounds, questions,
              difficulty, outcome, salary_type, salary_bucket, rating, culture_notes,
              status, submitted_at, moderated_at)
  on public.submissions to anon;

drop function public.search_submissions(text, integer, integer);

create or replace function public.company_breakdown(p_company uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', (select count(*) from public.submissions
               where company_id = p_company and status = 'approved'),
    'salary', coalesce((select jsonb_object_agg(k, n) from (
        select salary_bucket as k, count(*) as n from public.submissions
         where company_id = p_company and status = 'approved' and salary_bucket is not null
         group by salary_bucket) t), '{}'::jsonb),
    'difficulty', coalesce((select jsonb_object_agg(k, n) from (
        select difficulty as k, count(*) as n from public.submissions
         where company_id = p_company and status = 'approved' and difficulty is not null
         group by difficulty) t), '{}'::jsonb),
    'outcome', coalesce((select jsonb_object_agg(k, n) from (
        select outcome as k, count(*) as n from public.submissions
         where company_id = p_company and status = 'approved' and outcome is not null
         group by outcome) t), '{}'::jsonb),
    'levels', coalesce((select jsonb_object_agg(k, n) from (
        select experience_level as k, count(*) as n from public.submissions
         where company_id = p_company and status = 'approved'
         group by experience_level) t), '{}'::jsonb)
  );
$$;
revoke all on function public.company_breakdown(uuid) from public;
grant execute on function public.company_breakdown(uuid) to anon, authenticated;

-- Latest interview month per company, alongside the report count.
alter table public.companies add column latest_report_on date;

create or replace function public.refresh_company_stats(p_company uuid) returns void
language sql security definer set search_path = public as $$
  update public.companies c
     set review_count = s.n,
         avg_rating = s.avg_rating,
         latest_report_on = s.latest
    from (
      select count(*)::integer as n,
             coalesce(round(avg(rating), 2), 0) as avg_rating,
             max(coalesce(interview_date, submitted_at::date)) as latest
        from public.submissions
       where company_id = p_company and status = 'approved'
    ) s
   where c.id = p_company;
$$;
revoke all on function public.refresh_company_stats(uuid) from public, anon, authenticated;

select public.refresh_company_stats(id) from public.companies;

-- One query for every discovery filter. Approved reports only; no author data.
create function public.browse_experiences(
  p_q text default null,
  p_company text default null,
  p_park text default null,
  p_role text default null,
  p_level text default null,
  p_since date default null,
  p_limit integer default 10,
  p_offset integer default 0)
returns table (
  id uuid, company_id uuid, company_name text, company_slug text, company_park text,
  role text, experience_level text, interview_date date, rounds text, questions text,
  difficulty text, outcome text, salary_bucket text, rating integer,
  culture_notes text, submitted_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_query tsquery;
  v_company text := nullif(btrim(coalesce(p_company, '')), '');
  v_role text := nullif(btrim(coalesce(p_role, '')), '');
begin
  if nullif(btrim(coalesce(p_q, '')), '') is not null then
    v_query := websearch_to_tsquery('english', p_q);
    if v_query is null or numnode(v_query) = 0 then
      v_query := websearch_to_tsquery('simple', p_q);
    end if;
  end if;
  return query
    select s.id, s.company_id, c.name, c.slug, c.park,
           s.role, s.experience_level, s.interview_date, s.rounds, s.questions,
           s.difficulty, s.outcome, s.salary_bucket, s.rating,
           s.culture_notes, s.submitted_at,
           count(*) over () as total_count
      from public.submissions s
      join public.companies c on c.id = s.company_id
     where s.status = 'approved'
       and (v_query is null or s.search_vector @@ v_query)
       and (v_company is null or c.name ilike '%' || regexp_replace(v_company, '([\\%_])', '\\\1', 'g') || '%')
       and (p_park is null or p_park = '' or c.park = p_park)
       and (v_role is null or s.role ilike '%' || regexp_replace(v_role, '([\\%_])', '\\\1', 'g') || '%')
       and (p_level is null or p_level = '' or s.experience_level = p_level)
       and (p_since is null or coalesce(s.interview_date, s.submitted_at::date) >= p_since)
     order by (case when v_query is null then 0 else ts_rank_cd(s.search_vector, v_query) end) desc,
              coalesce(s.interview_date, s.submitted_at::date) desc,
              s.submitted_at desc
     limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end;
$$;
revoke all on function public.browse_experiences(text, text, text, text, text, date, integer, integer) from public;
grant execute on function public.browse_experiences(text, text, text, text, text, date, integer, integer)
  to anon, authenticated;

-- Real counts for the public campaign page. Counts only.
create function public.public_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'approved_reports', (select count(*) from public.submissions where status = 'approved'),
    'companies_with_reports', (select count(*) from public.companies where review_count > 0));
$$;
revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Follows, saves, preparation checklists (all strictly per-user)
-- ---------------------------------------------------------------------------
create table public.company_follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
alter table public.company_follows enable row level security;
create policy follows_select on public.company_follows for select to authenticated
  using (user_id = (select auth.uid()));
create policy follows_insert on public.company_follows for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy follows_update on public.company_follows for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy follows_delete on public.company_follows for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.company_follows from anon, authenticated;
grant select on public.company_follows to authenticated;
grant insert (user_id, company_id) on public.company_follows to authenticated;
grant update (last_seen_at) on public.company_follows to authenticated;
grant delete on public.company_follows to authenticated;

create table public.saved_experiences (
  user_id uuid not null references auth.users (id) on delete cascade,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, submission_id)
);
alter table public.saved_experiences enable row level security;
create policy saved_select on public.saved_experiences for select to authenticated
  using (user_id = (select auth.uid()));
-- Only approved reports can be saved.
create policy saved_insert on public.saved_experiences for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.submissions s
                 where s.id = submission_id and s.status = 'approved'));
create policy saved_delete on public.saved_experiences for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.saved_experiences from anon, authenticated;
grant select on public.saved_experiences to authenticated;
grant insert (user_id, submission_id) on public.saved_experiences to authenticated;
grant delete on public.saved_experiences to authenticated;

create table public.prep_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  role text check (role is null or char_length(btrim(role)) between 1 and 100),
  interview_date date,
  reminder_dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);
alter table public.prep_plans enable row level security;

-- Limit checks live in definer functions: counting a table from inside its own
-- RLS policy would recurse.
create function public.prep_plan_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.prep_plans where user_id = auth.uid();
$$;

create policy prep_plans_select on public.prep_plans for select to authenticated
  using (user_id = (select auth.uid()));
create policy prep_plans_insert on public.prep_plans for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.prep_plan_count() < 20);
create policy prep_plans_update on public.prep_plans for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy prep_plans_delete on public.prep_plans for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.prep_plans from anon, authenticated;
grant select on public.prep_plans to authenticated;
grant insert (user_id, company_id, role, interview_date) on public.prep_plans to authenticated;
grant update (role, interview_date, reminder_dismissed) on public.prep_plans to authenticated;
grant delete on public.prep_plans to authenticated;

create table public.prep_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.prep_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 200),
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index prep_items_plan_idx on public.prep_items (plan_id, position);
alter table public.prep_items enable row level security;

create function public.owns_prep_plan(p_plan uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.prep_plans where id = p_plan and user_id = auth.uid());
$$;
create function public.prep_item_count(p_plan uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.prep_items where plan_id = p_plan and user_id = auth.uid();
$$;

create policy prep_items_select on public.prep_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy prep_items_insert on public.prep_items for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.owns_prep_plan(plan_id)
    and public.prep_item_count(plan_id) < 50);
create policy prep_items_update on public.prep_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy prep_items_delete on public.prep_items for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.prep_items from anon, authenticated;
grant select on public.prep_items to authenticated;
grant insert (plan_id, user_id, text, position) on public.prep_items to authenticated;
grant update (done, text) on public.prep_items to authenticated;
grant delete on public.prep_items to authenticated;

-- New approved reports from followed / prepared-for companies since the user
-- last looked. Author data is never returned.
create function public.my_new_experiences(p_limit integer default 10)
returns table (
  id uuid, company_id uuid, company_name text, company_slug text,
  role text, experience_level text, interview_date date, rounds text, questions text,
  difficulty text, outcome text, salary_bucket text, rating integer,
  culture_notes text, submitted_at timestamptz)
language sql stable security definer set search_path = public as $$
  with watched as (
    select f.company_id, f.last_seen_at as since from public.company_follows f
     where f.user_id = auth.uid()
    union
    select p.company_id, p.created_at from public.prep_plans p
     where p.user_id = auth.uid()
       and not exists (select 1 from public.company_follows f2
                        where f2.user_id = p.user_id and f2.company_id = p.company_id)
  )
  select s.id, s.company_id, c.name, c.slug,
         s.role, s.experience_level, s.interview_date, s.rounds, s.questions,
         s.difficulty, s.outcome, s.salary_bucket, s.rating, s.culture_notes, s.submitted_at
    from public.submissions s
    join watched w on w.company_id = s.company_id
    join public.companies c on c.id = s.company_id
   where s.status = 'approved' and coalesce(s.moderated_at, s.submitted_at) > w.since
   order by coalesce(s.moderated_at, s.submitted_at) desc
   limit least(greatest(p_limit, 1), 30);
$$;

-- Followed companies with how many new reports each has.
create function public.my_followed_companies()
returns table (company_id uuid, name text, slug text, park text, review_count integer,
               latest_report_on date, new_count bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.slug, c.park, c.review_count, c.latest_report_on,
         (select count(*) from public.submissions s
           where s.company_id = c.id and s.status = 'approved'
             and coalesce(s.moderated_at, s.submitted_at) > f.last_seen_at)
    from public.company_follows f
    join public.companies c on c.id = f.company_id
   where f.user_id = auth.uid()
   order by 7 desc, c.name;
$$;

-- After-interview nudges: past interview date, not dismissed, and the user has
-- not yet shared an experience for that company.
create function public.my_reminders()
returns table (plan_id uuid, company_id uuid, company_name text, company_slug text, interview_date date)
language sql stable security definer set search_path = public as $$
  select p.id, p.company_id, c.name, c.slug, p.interview_date
    from public.prep_plans p
    join public.companies c on c.id = p.company_id
   where p.user_id = auth.uid()
     and p.interview_date is not null and p.interview_date < current_date
     and not p.reminder_dismissed
     and not exists (select 1 from public.submissions s
                      where s.user_id = p.user_id and s.company_id = p.company_id)
   order by p.interview_date desc;
$$;

-- ---------------------------------------------------------------------------
-- 4. Unmet demand: "Request experiences for this company"
--    Anonymous visitors may request (deduplicated per browser); signed-in
--    users are deduplicated per account. No table access from API roles.
-- ---------------------------------------------------------------------------
create table public.company_requests (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  requester_key text not null check (char_length(requester_key) between 3 and 80),
  created_at timestamptz not null default now(),
  unique (company_id, requester_key)
);
alter table public.company_requests enable row level security;
revoke all on public.company_requests from anon, authenticated;

create function public.request_company_experiences(p_company uuid, p_anon text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_key text := case when auth.uid() is not null then 'u:' || auth.uid()::text
                     when nullif(btrim(coalesce(p_anon, '')), '') is not null then 'a:' || left(btrim(p_anon), 64)
                end;
begin
  if v_key is null then
    raise exception 'missing requester' using errcode = '22023';
  end if;
  insert into public.company_requests (company_id, requester_key)
  values (p_company, v_key)
  on conflict do nothing;
end;
$$;

create function public.has_requested(p_company uuid, p_anon text default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_requests r
     where r.company_id = p_company
       and r.requester_key = case when auth.uid() is not null then 'u:' || auth.uid()::text
                                  else 'a:' || left(btrim(coalesce(p_anon, '')), 64) end);
$$;

create function public.requested_companies()
returns table (company_id uuid, name text, slug text, park text,
               request_count bigint, approved_reports integer, last_requested_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select c.id, c.name, c.slug, c.park, count(*), c.review_count, max(r.created_at)
      from public.company_requests r
      join public.companies c on c.id = r.company_id
     group by c.id
     order by count(*) desc, max(r.created_at) desc
     limit 100;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Analytics: more events + UTM attribution. Still no report content.
-- ---------------------------------------------------------------------------
alter table public.events
  add column utm_source text check (char_length(utm_source) <= 40),
  add column utm_medium text check (char_length(utm_medium) <= 40),
  add column utm_campaign text check (char_length(utm_campaign) <= 40);

alter table public.events drop constraint events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'landing_view', 'signin_completed', 'company_view', 'submit_started',
  'submit_completed', 'unlock_completed', 'full_company_view', 'search_used',
  'visit', 'campaign_view', 'save_added', 'follow_added', 'checklist_created',
  'experience_requested'));

grant insert (utm_source, utm_medium, utm_campaign) on public.events to anon, authenticated;
create index events_anon_idx on public.events (anon_id) where anon_id is not null;

create function public.growth_metrics() returns jsonb
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
    'form_starts', (select count(distinct anon_id) from public.events where name = 'submit_started'),
    'submissions', (select count(*) from public.events where name = 'submit_completed'),
    'saves', (select count(*) from public.events where name = 'save_added'),
    'follows', (select count(*) from public.events where name = 'follow_added'),
    'checklists', (select count(*) from public.events where name = 'checklist_created'),
    'requests', (select count(*) from public.company_requests),
    'by_source', coalesce((select jsonb_agg(row_to_json(t)) from (
        select coalesce(utm_source, 'direct') as source,
               count(distinct anon_id) filter (where name = 'visit') as visitors,
               count(*) filter (where name = 'submit_completed') as submissions
          from public.events
         where name in ('visit', 'submit_completed')
         group by 1 order by 2 desc limit 10) t), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function
  public.prep_plan_count(), public.owns_prep_plan(uuid), public.prep_item_count(uuid),
  public.my_new_experiences(integer), public.my_followed_companies(), public.my_reminders(),
  public.request_company_experiences(uuid, text), public.has_requested(uuid, text),
  public.requested_companies(), public.growth_metrics()
  from public, anon, authenticated;

grant execute on function
  public.prep_plan_count(), public.owns_prep_plan(uuid), public.prep_item_count(uuid),
  public.my_new_experiences(integer), public.my_followed_companies(), public.my_reminders(),
  public.requested_companies(), public.growth_metrics()
  to authenticated;
grant execute on function
  public.request_company_experiences(uuid, text), public.has_requested(uuid, text)
  to anon, authenticated;
