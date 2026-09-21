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
