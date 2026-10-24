# Rollback snippets

Manual SQL for the SQL editor — emergency use, not applied by any migration.

## Migrations, in order

Apply these in your Supabase SQL editor, in this exact order:

1. `supabase/migrations/20260919000000_phase1_init.sql`
2. `supabase/migrations/20260921000000_open_browse_engagement.sql`
3. `supabase/migrations/20261023000000_submit_funnel_events.sql`
4. `supabase/migrations/20261024000000_ai_interview_credits.sql`
5. `supabase/migrations/20261025000000_ai_interview_turns.sql`
6. `supabase/migrations/20261026000000_ai_interview_abandonment.sql`
7. `supabase/migrations/20261027000000_credit_submission_fk_fix.sql`
8. `supabase/migrations/20261028000000_ai_interview_surface_metrics.sql`
9. `supabase/migrations/20261029000000_ai_interview_feedback.sql`

Each is additive and keeps existing rows; see each file's own header comment
for what it does. Re-running an already-applied migration is not safe (several
statements, like `add constraint`, aren't idempotent) — apply each exactly once.

## Confirm everything is applied

One query, one row, read left to right in migration order — every column
should say `true`:

```sql
select
  to_regclass('public.profiles') is not null as m1_phase1_init,
  to_regclass('public.company_requests') is not null as m2_open_browse,
  exists (
    select 1 from pg_constraint
     where conname = 'events_name_check' and pg_get_constraintdef(oid) like '%form_view%'
  ) as m3_funnel_events,
  to_regclass('public.interview_credits') is not null as m4_ai_credits,
  exists (select 1 from pg_proc where proname = 'record_ai_turn') as m5_ai_turns,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ai_interview_sessions' and column_name = 'last_activity_at'
  ) as m6_abandonment,
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'interview_credits'
       and column_name = 'submission_id' and is_nullable = 'YES'
  ) as m7_credit_fk_fix,
  exists (
    select 1 from pg_constraint
     where conname = 'events_name_check' and pg_get_constraintdef(oid) like '%ai_interview_failed%'
  ) as m8_surface_metrics,
  to_regclass('public.ai_interview_feedback') is not null as m9_ai_feedback;
```

If any column is `false`, that migration (and everything after it, since each
builds on the last) hasn't been applied yet — find its number above and run
it from `supabase/migrations/`.

## Disable AI interview credit grants

If approving a submission ever starts erroring, or credits are granting
incorrectly, this removes only the automatic grant-on-approval behavior.
Moderation (`moderate_submission`), the credit/session tables, and everything
already granted are untouched — existing credits remain spendable.

```sql
drop trigger if exists submissions_grant_credit_trg on public.submissions;
```

Confirm it's gone:

```sql
select tgname from pg_trigger where tgname = 'submissions_grant_credit_trg';
-- should return 0 rows
```

### Re-enable it later

Re-run the `create trigger` statement from
`supabase/migrations/20261024000000_ai_interview_credits.sql` (search that
file for `submissions_grant_credit_trg`) — the function it points at
(`grant_interview_credit_on_approval()`) is untouched by the drop above, so
only the trigger itself needs recreating.

## Stop auto-abandoning stale interview sessions

If `abandon_stale_sessions` is ever marking sessions abandoned too
aggressively (timeout too short) or not catching real abandonment (too
long), first try just changing the threshold — safer than disabling it:

```sql
create or replace function public.abandon_timeout_minutes() returns integer
language sql immutable as $$ select 20 $$; -- change the number, re-run
```

If you need it off entirely, this makes every call a no-op without removing
the function (so `start_ai_interview` and the respond route, which both
call it unconditionally, keep working):

```sql
create or replace function public.abandon_stale_sessions(p_user uuid default null) returns integer
language sql as $$ select 0 $$;
```

(This stub also skips the non-admin authorization check — harmless, since it does nothing regardless of who calls it, but worth knowing while it's in place.)

To restore the real behaviour, re-run the `create function
public.abandon_stale_sessions` block from
`supabase/migrations/20261026000000_ai_interview_abandonment.sql`.
