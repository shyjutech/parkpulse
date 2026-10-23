-- Fix: deleting a submission used to cascade-delete its interview_credits
-- row unconditionally, including an already-CONSUMED credit (real cost
-- already incurred, real questions already asked). That let the per-user
-- lifetime count (max_free_credits(), checked by counting rows in
-- interview_credits) silently drop, so deleting an old submission could let
-- the same user earn another credit past the true cap of 3 -- an accounting
-- leak, not a schema integrity problem (ai_interview_sessions has no FK to
-- either table, so it was never actually at risk; only the credit *ledger*
-- row was).
--
-- Credits are now a permanent, append-only ledger: deleting the submission
-- that earned one only detaches the reference (submission_id -> null), it
-- never removes the row. This applies to already-granted credits regardless
-- of whether they've been consumed. An admin who wants to claw back an
-- unspent credit for a deleted spam submission now does that as an explicit,
-- separate action (delete the interview_credits row directly) rather than it
-- happening automatically and silently as a side effect of a submission delete.

-- Find and drop whatever the FK happens to be named (it was auto-generated
-- by the original inline `references`, so don't assume the exact name).
do $$
declare
  v_conname text;
begin
  select tc.constraint_name into v_conname
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
   where tc.table_schema = 'public' and tc.table_name = 'interview_credits'
     and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'submission_id';
  if v_conname is not null then
    execute format('alter table public.interview_credits drop constraint %I', v_conname);
  end if;
end $$;

alter table public.interview_credits alter column submission_id drop not null;
alter table public.interview_credits
  add constraint interview_credits_submission_id_fkey
  foreign key (submission_id) references public.submissions (id) on delete set null;

-- The unique constraint on submission_id is untouched by this migration and
-- still correctly prevents a submission from earning two credits while it
-- exists; Postgres treats multiple NULLs in a unique column as non-conflicting,
-- so credits whose submission was later deleted can coexist freely.
