-- ParkPulse Phase 1 schema: profiles, companies, submissions, events.
-- Security lives here (RLS, column grants, SECURITY DEFINER functions), not in the frontend.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------
-- No policies and no grants: unreachable from the API. Only is_admin() reads it.
create table public.admins (
  email text primary key check (email = lower(email))
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

insert into public.admins (email) values ('shyjutalks@gmail.com');

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a where a.email = lower(auth.jwt() ->> 'email')
  );
$$;

-- ---------------------------------------------------------------------------
-- Profiles (private)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  has_contributed boolean not null default false,
  contribution_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.has_contributed() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.has_contributed from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- A user may read their own profile. They may edit display_name only; the
-- protected counters have no UPDATE grant at all.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Companies (public directory / teaser data)
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  normalized_name text not null unique,
  slug text not null unique,
  park text not null check (park in ('Infopark', 'Technopark', 'Cyberpark', 'Other')),
  verified boolean not null default false,
  review_count integer not null default 0,
  avg_rating numeric(3, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.companies enable row level security;

create trigger companies_touch before update on public.companies
  for each row execute function public.touch_updated_at();

-- Light normalisation: punctuation and legal suffixes only. Exact matches on
-- this are treated as the same company.
create function public.normalize_company_name(n text) returns text
language plpgsql immutable set search_path = public as $$
declare
  cleaned text;
begin
  cleaned := lower(n);
  cleaned := regexp_replace(cleaned, '[^a-z0-9 ]+', ' ', 'g');
  cleaned := regexp_replace(cleaned, '\m(pvt|private|ltd|limited|llp|inc|incorporated|corp|corporation)\M', ' ', 'g');
  cleaned := btrim(regexp_replace(cleaned, '\s+', ' ', 'g'));
  if cleaned = '' then
    cleaned := btrim(regexp_replace(lower(n), '[^a-z0-9]+', ' ', 'g'));
  end if;
  return cleaned;
end;
$$;

-- Heavier normalisation used only to suggest likely duplicates, never to merge.
create function public.company_core_name(n text) returns text
language plpgsql immutable set search_path = public as $$
declare
  cleaned text;
begin
  cleaned := public.normalize_company_name(n);
  cleaned := btrim(regexp_replace(
    cleaned,
    '\m(technologies|technology|solutions|software|services|systems|india|global)\M', ' ', 'g'));
  cleaned := btrim(regexp_replace(cleaned, '\s+', ' ', 'g'));
  return case when cleaned = '' then public.normalize_company_name(n) else cleaned end;
end;
$$;

-- "Tata Consultancy Services" -> "tcs". Null for single-word names.
create function public.company_acronym(n text) returns text
language sql immutable set search_path = public as $$
  select case when count(*) >= 2 then string_agg(left(w, 1), '') end
  from regexp_split_to_table(
    btrim(regexp_replace(lower(n), '[^a-z0-9 ]+', ' ', 'g')), '\s+') as w
  where w <> '';
$$;

create function public.slugify(n text) returns text
language sql immutable set search_path = public as $$
  select coalesce(
    nullif(btrim(regexp_replace(lower(n), '[^a-z0-9]+', '-', 'g'), '-'), ''),
    'company');
$$;

-- Likely duplicates for a typed name. Suggestions only: never auto-merged.
create function public.similar_companies(q text, lim integer default 8)
returns table (id uuid, name text, slug text, park text, verified boolean, review_count integer)
language sql stable set search_path = public, extensions as $$
  with input as (
    select public.company_core_name(q) as qc,
           public.company_acronym(q) as qa,
           left(lower(regexp_replace(q, '[^a-zA-Z0-9]+', '', 'g')), 30) as qflat
  )
  select c.id, c.name, c.slug, c.park, c.verified, c.review_count
  from public.companies c, input i,
       lateral (select public.company_core_name(c.name) as cc) x
  where char_length(btrim(q)) >= 2
    and (
      x.cc = i.qc
      or (char_length(i.qc) >= 3 and (x.cc like '%' || i.qc || '%' or i.qc like '%' || x.cc || '%'))
      or similarity(x.cc, i.qc) > 0.4
      or public.company_acronym(c.name) = i.qflat
      or i.qa = replace(x.cc, ' ', '')
    )
  order by (x.cc = i.qc) desc, similarity(x.cc, i.qc) desc, c.review_count desc, c.name
  limit least(greatest(lim, 1), 20);
$$;

-- The only way to create a company. Returns the existing row on an exact
-- normalised match; otherwise inserts an unverified company with a unique slug.
create function public.propose_company(p_name text, p_park text)
returns table (id uuid, slug text)
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(regexp_replace(p_name, '\s+', ' ', 'g'));
  v_norm text := public.normalize_company_name(v_name);
  v_base text := public.slugify(v_norm);
  v_slug text;
  v_try integer := 1;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query select c.id, c.slug from public.companies c where c.normalized_name = v_norm;
  if found then
    return;
  end if;

  loop
    v_slug := case when v_try = 1 then v_base else v_base || '-' || v_try end;
    begin
      return query
        insert into public.companies as c (name, normalized_name, slug, park)
        values (v_name, v_norm, v_slug, p_park)
        returning c.id, c.slug;
      return;
    exception when unique_violation then
      -- Either the slug is taken (try the next suffix) or a concurrent request
      -- created the same company (return it).
      return query select c2.id, c2.slug from public.companies c2 where c2.normalized_name = v_norm;
      if found then
        return;
      end if;
      v_try := v_try + 1;
      if v_try > 50 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

-- Everyone can see the directory (teaser data). Writes: admin may verify or
-- correct the park; all other writes go through propose_company / triggers.
create policy companies_select_all on public.companies
  for select to anon, authenticated using (true);
create policy companies_admin_update on public.companies
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.companies from anon, authenticated;
grant select on public.companies to anon, authenticated;
grant update (verified, park) on public.companies to authenticated;

-- ---------------------------------------------------------------------------
-- Submissions
-- ---------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,

  role text not null check (char_length(btrim(role)) between 2 and 100),
  experience_level text not null
    check (experience_level in ('Fresher', '0–2 years', '3–5 years', '6–10 years', '10+ years')),

  interview_date date check (interview_date is null or interview_date <= current_date + 1),

  rounds text not null check (char_length(btrim(rounds)) between 30 and 3000),
  questions text not null check (char_length(btrim(questions)) between 50 and 5000),

  difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  outcome text not null check (outcome in ('Offer', 'Rejected', 'No response', 'Withdrew')),

  salary_type text not null check (salary_type in ('Current CTC', 'Offered CTC', 'Not disclosed')),
  salary_bucket text check (salary_bucket in (
    'Below ₹3L', '₹3L–₹5L', '₹5L–₹8L', '₹8L–₹12L', '₹12L–₹18L', '₹18L–₹25L', '₹25L+')),

  rating integer not null check (rating between 1 and 5),

  culture_notes text not null check (char_length(btrim(culture_notes)) between 50 and 3000),

  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  moderated_at timestamptz,

  search_vector tsvector,

  constraint salary_bucket_matches_type check (
    (salary_type = 'Not disclosed' and salary_bucket is null)
    or (salary_type <> 'Not disclosed' and salary_bucket is not null))
);
alter table public.submissions enable row level security;

-- Indexes chosen for Phase 1 query patterns: company page (approved, newest
-- first), moderation queue, own-submissions dashboard, breakdown counts, search.
create index submissions_company_approved_idx
  on public.submissions (company_id, submitted_at desc) where status = 'approved';
create index submissions_pending_idx
  on public.submissions (submitted_at) where status = 'pending';
create index submissions_user_idx on public.submissions (user_id, submitted_at desc);
create index submissions_search_idx on public.submissions using gin (search_vector);

create function public.submissions_set_search_vector() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_company text;
begin
  select c.name into v_company from public.companies c where c.id = new.company_id;
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(v_company, '')), 'A')
    || setweight(to_tsvector('english', new.role), 'B')
    || setweight(to_tsvector('english', new.questions), 'B')
    || setweight(to_tsvector('english', new.rounds), 'C')
    || setweight(to_tsvector('english', new.culture_notes), 'D');
  return new;
end;
$$;

create trigger submissions_search_vector_trg
  before insert or update of company_id, role, rounds, questions, culture_notes
  on public.submissions
  for each row execute function public.submissions_set_search_vector();

-- First (and every) contribution: unlock + count. Runs as definer so users
-- never need write access to the protected profile columns.
create function public.submissions_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set has_contributed = true,
         contribution_count = contribution_count + 1
   where id = new.user_id;
  return new;
end;
$$;

create trigger submissions_after_insert_trg after insert on public.submissions
  for each row execute function public.submissions_after_insert();

-- Company aggregates count approved submissions only.
create function public.refresh_company_stats(p_company uuid) returns void
language sql security definer set search_path = public as $$
  update public.companies c
     set review_count = s.n,
         avg_rating = s.avg_rating
    from (
      select count(*)::integer as n, coalesce(round(avg(rating), 2), 0) as avg_rating
        from public.submissions
       where company_id = p_company and status = 'approved'
    ) s
   where c.id = p_company;
$$;
revoke all on function public.refresh_company_stats(uuid) from public, anon, authenticated;

create function public.submissions_refresh_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_company_stats(old.company_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_company_stats(new.company_id);
  end if;
  return null;
end;
$$;

create trigger submissions_refresh_stats_trg
  after insert or update of status, rating, company_id or delete on public.submissions
  for each row execute function public.submissions_refresh_stats();

-- Create: own rows only, always pending (status also has no INSERT grant).
create policy submissions_insert_own on public.submissions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and moderated_at is null);

-- Read: own rows; approved rows for contributors; everything for admin.
create policy submissions_select_own on public.submissions
  for select to authenticated using (user_id = (select auth.uid()));
create policy submissions_select_approved on public.submissions
  for select to authenticated
  using (status = 'approved' and (select public.has_contributed()));
create policy submissions_select_admin on public.submissions
  for select to authenticated using ((select public.is_admin()));

-- No UPDATE policy: moderation goes through moderate_submission().
create policy submissions_delete_admin on public.submissions
  for delete to authenticated using ((select public.is_admin()));

-- Column-level grants keep user_id, status writes and search_vector away from
-- API clients. Nobody can SELECT user_id, so contributors cannot see authors.
revoke all on public.submissions from anon, authenticated;
grant select (id, company_id, role, experience_level, interview_date, rounds, questions,
              difficulty, outcome, salary_type, salary_bucket, rating, culture_notes,
              status, submitted_at, moderated_at)
  on public.submissions to authenticated;
grant insert (user_id, company_id, role, experience_level, interview_date, rounds, questions,
              difficulty, outcome, salary_type, salary_bucket, rating, culture_notes)
  on public.submissions to authenticated;
grant delete on public.submissions to authenticated;

create function public.moderate_submission(p_id uuid, p_decision text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  update public.submissions
     set status = p_decision, moderated_at = now()
   where id = p_id;
  if not found then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gated reads: search + company breakdown. Explicit gate + approved-only, and
-- they never return user_id.
-- ---------------------------------------------------------------------------
create function public.search_submissions(q text, p_limit integer default 20, p_offset integer default 0)
returns table (
  id uuid, company_id uuid, company_name text, company_slug text,
  role text, experience_level text, interview_date date, rounds text, questions text,
  difficulty text, outcome text, salary_bucket text, rating integer,
  culture_notes text, submitted_at timestamptz, rank real)
language plpgsql stable security definer set search_path = public as $$
declare
  v_query tsquery;
begin
  if not (public.has_contributed() or public.is_admin()) then
    return;
  end if;
  v_query := websearch_to_tsquery('english', q);
  if v_query is null or numnode(v_query) = 0 then
    v_query := websearch_to_tsquery('simple', q);
  end if;
  return query
    select s.id, s.company_id, c.name, c.slug,
           s.role, s.experience_level, s.interview_date, s.rounds, s.questions,
           s.difficulty, s.outcome, s.salary_bucket, s.rating,
           s.culture_notes, s.submitted_at,
           ts_rank_cd(s.search_vector, v_query) as rank
      from public.submissions s
      join public.companies c on c.id = s.company_id
     where s.status = 'approved' and s.search_vector @@ v_query
     order by rank desc, s.submitted_at desc
     limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end;
$$;

-- The caller's own submissions (any status). A function because clients cannot
-- filter on user_id: that column is not selectable by API roles.
create function public.my_submissions()
returns table (id uuid, company_name text, company_slug text, role text, status text, submitted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, c.name, c.slug, s.role, s.status, s.submitted_at
    from public.submissions s
    join public.companies c on c.id = s.company_id
   where s.user_id = auth.uid()
   order by s.submitted_at desc;
$$;

-- Counts only (no exact salaries, no averages). Empty for locked users.
create function public.company_breakdown(p_company uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_contributed() or public.is_admin()) then
    return null;
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.submissions
               where company_id = p_company and status = 'approved'),
    'salary', coalesce((select jsonb_object_agg(k, n) from (
        select salary_bucket as k, count(*) as n from public.submissions
         where company_id = p_company and status = 'approved' and salary_bucket is not null
         group by salary_bucket) t), '{}'::jsonb),
    'difficulty', coalesce((select jsonb_object_agg(k, n) from (
        select difficulty as k, count(*) as n from public.submissions
         where company_id = p_company and status = 'approved'
         group by difficulty) t), '{}'::jsonb),
    'outcome', coalesce((select jsonb_object_agg(k, n) from (
        select outcome as k, count(*) as n from public.submissions
         where company_id = p_company and status = 'approved'
         group by outcome) t), '{}'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Product analytics (Phase 1 events only)
-- ---------------------------------------------------------------------------
create table public.events (
  id bigint generated always as identity primary key,
  name text not null check (name in (
    'landing_view', 'signin_completed', 'company_view', 'submit_started',
    'submit_completed', 'unlock_completed', 'full_company_view', 'search_used')),
  user_id uuid default auth.uid(),
  anon_id text check (char_length(anon_id) <= 64),
  company_id uuid,
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;
create index events_name_created_idx on public.events (name, created_at);
create index events_user_idx on public.events (user_id) where user_id is not null;

create policy events_insert on public.events
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
create policy events_select_admin on public.events
  for select to authenticated using ((select public.is_admin()));

revoke all on public.events from anon, authenticated;
grant insert (name, anon_id, company_id) on public.events to anon, authenticated;
grant select on public.events to authenticated;

-- The four Phase 1 success ratios, for the admin page.
create function public.phase1_metrics() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_auth integer;
  v_contrib integer;
  v_viewed integer;
  v_submitted integer;
  v_approved integer;
  v_returning integer;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select count(distinct user_id) into v_auth from public.events
   where name = 'signin_completed' and user_id is not null;
  select count(*) into v_contrib from public.profiles where has_contributed;
  select count(distinct e.user_id) into v_viewed from public.events e
    join public.profiles p on p.id = e.user_id and p.has_contributed
   where e.name = 'full_company_view';
  select count(*) into v_submitted from public.submissions;
  select count(*) into v_approved from public.submissions where status = 'approved';
  select count(*) into v_returning from (
    select e.user_id from public.events e
      join public.profiles p on p.id = e.user_id and p.has_contributed
     group by e.user_id
    having count(distinct e.created_at::date) >= 2) r;
  return jsonb_build_object(
    'authenticated_users', v_auth, 'contributors', v_contrib,
    'contributors_viewed_full_data', v_viewed,
    'submissions', v_submitted, 'approved_submissions', v_approved,
    'returning_contributors', v_returning);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing is executable by default.
-- ---------------------------------------------------------------------------
revoke all on function
  public.is_admin(), public.has_contributed(), public.handle_new_user(),
  public.propose_company(text, text), public.similar_companies(text, integer),
  public.moderate_submission(uuid, text),
  public.search_submissions(text, integer, integer), public.company_breakdown(uuid),
  public.my_submissions(), public.phase1_metrics()
  from public, anon, authenticated;

grant execute on function public.is_admin(), public.has_contributed() to authenticated;
grant execute on function public.similar_companies(text, integer) to anon, authenticated;
grant execute on function
  public.propose_company(text, text), public.moderate_submission(uuid, text),
  public.search_submissions(text, integer, integer), public.company_breakdown(uuid),
  public.my_submissions(), public.phase1_metrics()
  to authenticated;
