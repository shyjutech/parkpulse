import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { expect, it } from "vitest";

// Existing production data must survive the second migration untouched.
it("upgrades a database that already has Phase 1 data", async () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  const dir = path.join(__dirname, "../../supabase/migrations");
  const files = fs.readdirSync(dir).sort();
  await db.exec(fs.readFileSync(path.join(__dirname, "stub_supabase.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(dir, files[0]), "utf8"));

  const u = "00000000-0000-0000-0000-0000000000a1";
  await db.query("insert into auth.users (id, email) values ($1, 'legacy@example.com')", [u]);
  const c = await db.query<{ id: string }>(
    "insert into public.companies (name, normalized_name, slug, park) values ('Legacy Co','legacy co','legacy-co','Technopark') returning id",
  );
  const company = c.rows[0].id;
  // A fully-populated Phase 1 row, approved, with NO interview date (it was optional then).
  await db.query(
    `insert into public.submissions (user_id, company_id, role, experience_level, rounds, questions, difficulty, outcome,
       salary_type, salary_bucket, rating, culture_notes, status)
     values ($1, $2, 'Legacy Dev', '0–2 years', $3, $4, 'Easy', 'Offer', 'Offered CTC', '₹3L–₹5L', 5, $5, 'approved')`,
    [
      u,
      company,
      "Online test, technical round and HR round in one day.",
      "Basics of OOP, SQL joins, and a simple array problem to solve on paper.",
      "Friendly people and a calm office; the manager explained the team clearly.",
    ],
  );

  for (const f of files.slice(1)) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));

  const row = await db.query("select role, status, rating, salary_bucket, interview_date from public.submissions");
  expect(row.rows).toEqual([{ role: "Legacy Dev", status: "approved", rating: 5, salary_bucket: "₹3L–₹5L", interview_date: null }]);
  const co = await db.query("select review_count, avg_rating::float as avg, latest_report_on is not null as has_latest from public.companies");
  expect(co.rows).toEqual([{ review_count: 1, avg: 5, has_latest: true }]);
  // The old row can still be moderated (rejected then re-approved) despite its missing date.
  await db.query("select set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-0000000000ad\",\"email\":\"shyjutalks@gmail.com\"}', false)");
  await db.exec("set role authenticated");
  await db.query("select public.moderate_submission((select id from public.submissions limit 1), 'rejected')");
  await db.exec("reset role");
  expect((await db.query("select status from public.submissions")).rows).toEqual([{ status: "rejected" }]);
  // And it is now browsable by anonymous visitors when approved.
  await db.query("update public.submissions set status = 'approved'");
  await db.exec("set role anon");
  const pub = await db.query("select role from public.browse_experiences()");
  await db.exec("reset role");
  expect(pub.rows).toEqual([{ role: "Legacy Dev" }]);
});

it("reclassifies historical submit_started events to form_view on upgrade", async () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  const dir = path.join(__dirname, "../../supabase/migrations");
  const files = fs.readdirSync(dir).sort();
  await db.exec(fs.readFileSync(path.join(__dirname, "stub_supabase.sql"), "utf8"));
  // Apply every migration up to (but not including) the one that retires submit_started.
  const cutover = files.findIndex((f) => f.includes("submit_funnel_events"));
  expect(cutover).toBeGreaterThan(0);
  for (const f of files.slice(0, cutover)) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));

  await db.exec("set role anon");
  await db.query("insert into public.events (name, anon_id) values ('submit_started', 'legacy-visitor')");
  await db.exec("reset role");

  for (const f of files.slice(cutover)) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));

  // The historical row is relabelled to what it actually measured.
  const rows = await db.query("select name from public.events where anon_id = 'legacy-visitor'");
  expect(rows.rows).toEqual([{ name: "form_view" }]);

  // The name stays valid at the DB level (so old/replayed rows never break),
  // even though nothing in the app emits it going forward — that's enforced
  // one layer up, by the API route's allowlist (see route.test.ts).
  await db.exec("set role anon");
  await db.query("insert into public.events (name, anon_id) values ('submit_started', 'new-visitor')");
  await db.exec("reset role");
});

it("does not retroactively grant credits for pre-existing approvals, but the backfill function does", async () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  const dir = path.join(__dirname, "../../supabase/migrations");
  const files = fs.readdirSync(dir).sort();
  const cutover = files.findIndex((f) => f.includes("ai_interview_credits"));
  expect(cutover).toBeGreaterThan(0);

  await db.exec(fs.readFileSync(path.join(__dirname, "stub_supabase.sql"), "utf8"));
  for (const f of files.slice(0, cutover)) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));

  // A submission approved entirely before the credit system existed.
  const u = "00000000-0000-0000-0000-0000000000b1";
  await db.query("insert into auth.users (id, email) values ($1, 'preexisting@example.com')", [u]);
  const c = await db.query<{ id: string }>(
    "insert into public.companies (name, normalized_name, slug, park) values ('Pre Co','pre co','pre-co','Infopark') returning id",
  );
  await db.query(
    `insert into public.submissions (user_id, company_id, role, experience_level, interview_date, questions, status)
     values ($1, $2, 'Legacy Approved Role', '0–2 years', '2026-01-01', 'What was asked?', 'approved')`,
    [u, c.rows[0].id],
  );

  for (const f of files.slice(cutover)) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));

  const before = await db.query<{ n: number }>(
    "select count(*)::int as n from public.interview_credits where user_id = $1",
    [u],
  );
  expect(before.rows[0].n).toBe(0);

  await db.query(
    "select set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-0000000000ad\",\"email\":\"shyjutalks@gmail.com\"}', false)",
  );
  await db.exec("set role authenticated");
  const granted = await db.query<{ n: number }>("select public.backfill_legacy_credits() as n");
  await db.exec("reset role");
  expect(Number(granted.rows[0].n)).toBe(1);

  const after = await db.query<{ n: number }>(
    "select count(*)::int as n from public.interview_credits where user_id = $1",
    [u],
  );
  expect(after.rows[0].n).toBe(1);
});

it("backfills last_activity_at for sessions that existed before the abandonment migration", async () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  const dir = path.join(__dirname, "../../supabase/migrations");
  const files = fs.readdirSync(dir).sort();
  const cutover = files.findIndex((f) => f.includes("ai_interview_abandonment"));
  expect(cutover).toBeGreaterThan(0);

  await db.exec(fs.readFileSync(path.join(__dirname, "stub_supabase.sql"), "utf8"));
  for (const f of files.slice(0, cutover)) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));

  const u = "00000000-0000-0000-0000-0000000000c1";
  await db.query("insert into auth.users (id, email) values ($1, 'preexisting-session@example.com')", [u]);
  const c = await db.query<{ id: string }>(
    "insert into public.companies (name, normalized_name, slug, park) values ('Pre Interview Co','pre interview co','pre-interview-co','Infopark') returning id",
  );
  await db.query(
    `insert into public.submissions (user_id, company_id, role, experience_level, interview_date, questions, status)
     values ($1, $2, 'Legacy Interviewer', '0–2 years', '2026-01-01', 'What was asked?', 'approved')`,
    [u, c.rows[0].id],
  );
  // Inserted directly (as the superuser connection, bypassing the grants that
  // normally require going through start_ai_interview), simulating a row
  // that already existed in the table before this migration -- the point
  // being tested is the migration's backfill, not the insert path.
  const session = await db.query<{ id: string }>(
    "insert into public.ai_interview_sessions (user_id, role, experience_level) values ($1, 'Dev', 'Fresher') returning id",
    [u],
  );

  for (const f of files.slice(cutover)) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));

  const row = await db.query<{ has_last_activity: boolean }>(
    "select last_activity_at is not null as has_last_activity from public.ai_interview_sessions where id = $1",
    [session.rows[0].id],
  );
  expect(row.rows[0].has_last_activity).toBe(true);

  // And the new sweep function works against this now-upgraded row.
  await db.query("update public.ai_interview_sessions set last_activity_at = now() - interval '999 minutes' where id = $1", [session.rows[0].id]);
  await db.query(
    "select set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-0000000000c1\",\"email\":\"preexisting-session@example.com\"}', false)",
  );
  await db.exec("set role authenticated");
  const swept = await db.query<{ n: number }>("select public.abandon_stale_sessions($1) as n", [u]);
  await db.exec("reset role");
  expect(Number(swept.rows[0].n)).toBe(1);
});
