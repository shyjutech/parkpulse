import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { beforeAll, describe, expect, it } from "vitest";

// Runs the real migration on PGlite (Postgres in WASM) with a stub of
// Supabase's auth schema, then exercises RLS/grants as anon/authenticated.

const ADMIN_EMAIL = "shyjutalks@gmail.com";
const ids = {
  alice: "00000000-0000-0000-0000-00000000000a", // contributor
  bob: "00000000-0000-0000-0000-00000000000b", //   locked (never contributed)
  carol: "00000000-0000-0000-0000-00000000000c", // contributes during tests
  admin: "00000000-0000-0000-0000-0000000000ad",
};
const emails: Record<string, string> = {
  alice: "alice@example.com",
  bob: "bob@example.com",
  carol: "carol@example.com",
  admin: ADMIN_EMAIL,
};

let db: PGlite;
let company: string;

type Actor = keyof typeof ids | "anon";

async function as<T>(actor: Actor, fn: () => Promise<T>): Promise<T> {
  const claims =
    actor === "anon"
      ? {}
      : { sub: ids[actor], email: emails[actor], role: "authenticated" };
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  await db.exec(`set role ${actor === "anon" ? "anon" : "authenticated"}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

const q = (sql: string, params: unknown[] = []) => db.query<Record<string, unknown>>(sql, params);

const submission = (over: Record<string, unknown> = {}) => ({
  user_id: ids.alice,
  company_id: company,
  role: "Flutter Developer",
  experience_level: "3–5 years",
  interview_date: "2026-03-01",
  rounds: "Three rounds: online screen, technical, HR discussion.",
  questions: "Explain widget lifecycle, state management options, and isolates in Dart.",
  difficulty: "Medium",
  outcome: "Offer",
  salary_type: "Offered CTC",
  salary_bucket: "₹8L–₹12L",
  rating: 4,
  culture_notes: "Friendly panel, relaxed pace, clear communication about next steps.",
  ...over,
});

async function insertSubmission(actor: Actor, over: Record<string, unknown> = {}) {
  const s = submission(over);
  const cols = Object.keys(s);
  return as(actor, () =>
    q(
      `insert into public.submissions (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`,
      Object.values(s),
    ),
  );
}

async function superInsertApproved(over: Record<string, unknown> = {}) {
  const s = submission(over);
  const cols = [...Object.keys(s), "status"];
  const res = await q(
    `insert into public.submissions (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    [...Object.values(s), "approved"],
  );
  return res.rows[0].id as string;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(fs.readFileSync(path.join(__dirname, "stub_supabase.sql"), "utf8"));
  const dir = path.join(__dirname, "../../supabase/migrations");
  for (const f of fs.readdirSync(dir).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  }
  for (const k of Object.keys(ids) as (keyof typeof ids)[]) {
    await q("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
      ids[k],
      emails[k],
      JSON.stringify({ full_name: `Name ${k}` }),
    ]);
  }
  const c = await q(
    "insert into public.companies (name, normalized_name, slug, park) values ('Acme Labs','acme labs','acme-labs','Infopark') returning id",
  );
  company = c.rows[0].id as string;
  // Alice is a contributor with one approved submission; Bob is locked.
  await insertSubmission("alice");
});

describe("authentication", () => {
  it("signed-out users cannot submit", async () => {
    await expect(insertSubmission("anon")).rejects.toThrow(/permission denied/i);
  });

  it("signed-out users cannot read profiles or others' pending submissions", async () => {
    await expect(as("anon", () => q("select id from public.profiles"))).rejects.toThrow(/permission denied/i);
    const r = await as("anon", () => q("select id from public.submissions"));
    expect(r.rows).toHaveLength(0);
  });

  it("signed-in users can submit, and the new row is pending", async () => {
    await insertSubmission("bob", { user_id: ids.bob, role: "QA Engineer" });
    const r = await as("bob", () => q("select status from public.submissions where role = 'QA Engineer'"));
    expect(r.rows).toEqual([{ status: "pending" }]);
  });
});

describe("open browsing", () => {
  it("a contribution flips has_contributed and bumps the count (via trigger)", async () => {
    const before = await as("carol", () => q("select has_contributed, contribution_count from public.profiles"));
    expect(before.rows).toEqual([{ has_contributed: false, contribution_count: 0 }]);
    await insertSubmission("carol", { user_id: ids.carol, role: "Backend Engineer" });
    const after = await as("carol", () => q("select has_contributed, contribution_count from public.profiles"));
    expect(after.rows).toEqual([{ has_contributed: true, contribution_count: 1 }]);
  });

  it("signed-out visitors can read approved reports but never pending ones", async () => {
    await superInsertApproved({ role: "Data Engineer", user_id: ids.admin });
    const rows = await as("anon", () => q("select role, status from public.submissions"));
    expect(rows.rows).toEqual([{ role: "Data Engineer", status: "approved" }]);
  });

  it("signed-out visitors cannot read authors", async () => {
    await expect(as("anon", () => q("select user_id from public.submissions"))).rejects.toThrow(/permission denied/i);
  });

  it("a user who never contributed sees the same approved data", async () => {
    const dave = "00000000-0000-0000-0000-00000000000d";
    await q("insert into auth.users (id, email) values ($1, 'dave@example.com')", [dave]);
    ids["dave" as keyof typeof ids] = dave;
    emails.dave = "dave@example.com";
    const rows = await as("dave" as Actor, () => q("select role from public.submissions"));
    expect(rows.rows.map((r) => r.role)).toEqual(["Data Engineer"]);
  });

  it("browse_experiences works for anon and only returns approved rows", async () => {
    const all = await as("anon", () => q("select role, total_count from public.browse_experiences()"));
    expect(all.rows.map((r) => r.role)).toEqual(["Data Engineer"]);
    expect(Number(all.rows[0].total_count)).toBe(1);
    const hit = await as("anon", () => q("select role from public.browse_experiences('data engineer')"));
    expect(hit.rows).toHaveLength(1);
    const miss = await as("anon", () => q("select role from public.browse_experiences('backend')"));
    expect(miss.rows).toHaveLength(0); // carol's backend row is still pending
  });

  it("browse_experiences filters by park, role, level, company and recency", async () => {
    const f = (args: string) => as("anon", () => q(`select role from public.browse_experiences(${args})`));
    expect((await f("p_park => 'Infopark'")).rows).toHaveLength(1);
    expect((await f("p_park => 'Cyberpark'")).rows).toHaveLength(0);
    expect((await f("p_role => 'data'")).rows).toHaveLength(1);
    expect((await f("p_role => 'nurse'")).rows).toHaveLength(0);
    expect((await f("p_level => '3–5 years'")).rows).toHaveLength(1);
    expect((await f("p_level => 'Fresher'")).rows).toHaveLength(0);
    expect((await f("p_company => 'acme'")).rows).toHaveLength(1);
    expect((await f("p_company => '%'")).rows).toHaveLength(0); // wildcards are escaped
    expect((await f("p_since => '2026-01-01'")).rows).toHaveLength(1);
    expect((await f("p_since => '2030-01-01'")).rows).toHaveLength(0);
  });

  it("company_breakdown is public, counts approved rows only, and never errors on optional fields", async () => {
    const b = await as("anon", () => q("select public.company_breakdown($1) as b", [company]));
    expect(b.rows[0].b).toMatchObject({ total: 1, salary: { "₹8L–₹12L": 1 }, difficulty: { Medium: 1 } });
    await superInsertApproved({ role: "Minimal", salary_type: null, salary_bucket: null, difficulty: null, outcome: null, rating: null, rounds: null, culture_notes: null });
    const again = await as("anon", () => q("select public.company_breakdown($1) as b", [company]));
    expect(again.rows[0].b).toMatchObject({ total: 2, difficulty: { Medium: 1 } });
    await q("delete from public.submissions where role = 'Minimal'");
  });
});

describe("simplified contributions", () => {
  const minimal = { rounds: null, difficulty: null, outcome: null, salary_type: null, salary_bucket: null, rating: null, culture_notes: null, questions: "System design and DSA" };

  it("accepts a submission with only the required fields", async () => {
    await insertSubmission("bob", { ...minimal, user_id: ids.bob, role: "Minimal Bob" });
    const r = await as("bob", () => q("select status from public.submissions where role = 'Minimal Bob'"));
    expect(r.rows).toEqual([{ status: "pending" }]);
  });

  it("requires an interview month on new rows", async () => {
    await expect(insertSubmission("bob", { ...minimal, user_id: ids.bob, interview_date: null })).rejects.toThrow(/row-level security/i);
  });

  it("still rejects a too-short topic and inconsistent salary", async () => {
    await expect(insertSubmission("bob", { ...minimal, user_id: ids.bob, questions: "short" })).rejects.toThrow(/check constraint/i);
    await expect(insertSubmission("bob", { ...minimal, user_id: ids.bob, salary_type: "Offered CTC" })).rejects.toThrow(/check constraint/i);
    await expect(insertSubmission("bob", { ...minimal, user_id: ids.bob, salary_bucket: "₹8L–₹12L" })).rejects.toThrow(/check constraint/i);
  });
});

describe("submission security", () => {
  it("cannot submit as another user", async () => {
    await expect(insertSubmission("bob", { user_id: ids.alice })).rejects.toThrow(/row-level security/i);
  });

  it("cannot create an approved/rejected submission", async () => {
    await expect(insertSubmission("bob", { status: "approved" })).rejects.toThrow(/permission denied/i);
    await expect(insertSubmission("bob", { moderated_at: new Date().toISOString() })).rejects.toThrow(/permission denied/i);
  });

  it("cannot change status or edit a submission", async () => {
    await expect(as("alice", () => q("update public.submissions set status = 'approved'"))).rejects.toThrow(/permission denied/i);
    await expect(as("alice", () => q("update public.submissions set rating = 1"))).rejects.toThrow(/permission denied/i);
  });

  it("cannot delete submissions", async () => {
    const before = await q("select count(*)::int as n from public.submissions");
    await as("alice", () => q("delete from public.submissions")).catch(() => {});
    const after = await q("select count(*)::int as n from public.submissions");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("cannot tamper with profile counters", async () => {
    await expect(as("bob", () => q("update public.profiles set has_contributed = true"))).rejects.toThrow(/permission denied/i);
    await expect(as("bob", () => q("update public.profiles set contribution_count = 99"))).rejects.toThrow(/permission denied/i);
    await expect(as("bob", () => q("update public.profiles set created_at = now()"))).rejects.toThrow(/permission denied/i);
  });

  it("cannot read other profiles", async () => {
    const r = await as("bob", () => q("select id from public.profiles"));
    expect(r.rows).toEqual([{ id: ids.bob }]);
  });

  it("database rejects too-short or inconsistent content", async () => {
    await expect(insertSubmission("bob", { user_id: ids.bob, questions: "too short" })).rejects.toThrow(/check constraint/i);
    await expect(insertSubmission("bob", { user_id: ids.bob, salary_type: "Not disclosed" })).rejects.toThrow(/check constraint/i);
  });
});

describe("privacy", () => {
  it("nobody can select user_id, even on approved rows", async () => {
    await expect(as("alice", () => q("select user_id from public.submissions"))).rejects.toThrow(/permission denied/i);
    await expect(as("alice", () => q("select * from public.submissions"))).rejects.toThrow(/permission denied/i);
  });

  it("my_submissions returns only the caller's own rows", async () => {
    const mine = await as("alice", () => q("select role, status from public.my_submissions()"));
    expect(mine.rows).toEqual([{ role: "Flutter Developer", status: "pending" }]);
    await expect(as("anon", () => q("select * from public.my_submissions()"))).rejects.toThrow(/permission denied/i);
  });

  it("search results expose no identity fields", async () => {
    const r = await as("alice", () => q("select * from public.browse_experiences('data engineer')"));
    expect(r.rows.length).toBeGreaterThan(0);
    const keys = Object.keys(r.rows[0]);
    for (const forbidden of ["user_id", "email", "display_name", "avatar_url"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("admin", () => {
  let pendingId: string;

  it("non-admin cannot see others' pending, moderate, or read metrics/admin table", async () => {
    pendingId = (await q("select id from public.submissions where role = 'QA Engineer'")).rows[0].id as string;
    const seen = await as("carol", () => q("select id from public.submissions where id = $1", [pendingId]));
    expect(seen.rows).toHaveLength(0);
    await expect(as("carol", () => q("select public.moderate_submission($1, 'approved')", [pendingId]))).rejects.toThrow(/admin only/);
    await expect(as("carol", () => q("select public.moderate_submission($1, 'rejected')", [pendingId]))).rejects.toThrow(/admin only/);
    await expect(as("carol", () => q("select public.phase1_metrics()"))).rejects.toThrow(/admin only/);
    await expect(as("carol", () => q("select * from public.admins"))).rejects.toThrow(/permission denied/i);
    await expect(as("carol", () => q("update public.companies set verified = true"))).resolves.toMatchObject({ affectedRows: 0 });
    expect((await q("select verified from public.companies")).rows[0].verified).toBe(false);
  });

  it("admin can see pending and moderate; aggregates follow approved rows only", async () => {
    const co = () => q("select review_count, avg_rating::float as avg from public.companies where id = $1", [company]);
    // Approved so far: Alice's? No — Alice's row is pending; only the Data Engineer row (rating 4) is approved.
    expect((await co()).rows[0]).toEqual({ review_count: 1, avg: 4 });

    const pending = await as("admin", () => q("select id from public.submissions where status = 'pending'"));
    expect(pending.rows.length).toBeGreaterThanOrEqual(3);

    await as("admin", () => q("select public.moderate_submission($1, 'approved')", [pendingId]));
    const moderated = await q("select status, moderated_at from public.submissions where id = $1", [pendingId]);
    expect(moderated.rows[0].status).toBe("approved");
    expect(moderated.rows[0].moderated_at).not.toBeNull();
    expect((await co()).rows[0].review_count).toBe(2);

    // Rejecting an approved row removes it from aggregates again.
    await as("admin", () => q("select public.moderate_submission($1, 'rejected')", [pendingId]));
    expect((await co()).rows[0]).toEqual({ review_count: 1, avg: 4 });
  });

  it("pending and rejected submissions never affect aggregates", async () => {
    const r = await q("select review_count from public.companies where id = $1", [company]);
    expect(r.rows[0].review_count).toBe(1);
  });

  it("admin can verify companies and read metrics", async () => {
    await as("admin", () => q("update public.companies set verified = true"));
    expect((await q("select verified from public.companies")).rows[0].verified).toBe(true);
    const m = await as("admin", () => q("select public.phase1_metrics() as m"));
    expect(m.rows[0].m).toHaveProperty("contributors");
  });

  it("admin can delete a post, and company aggregates follow; non-admin cannot", async () => {
    const id = await superInsertApproved({ role: "To Delete", rating: 2, user_id: ids.admin });
    const co = () => q("select review_count from public.companies where id = $1", [company]);
    const before = (await co()).rows[0].review_count as number;
    await as("carol", () => q("delete from public.submissions where id = $1", [id]));
    expect((await q("select id from public.submissions where id = $1", [id])).rows).toHaveLength(1);
    await as("admin", () => q("delete from public.submissions where id = $1", [id]));
    expect((await q("select id from public.submissions where id = $1", [id])).rows).toHaveLength(0);
    expect((await co()).rows[0].review_count).toBe(before - 1);
  });

  it("an email that only looks like the admin's is not admin", async () => {
    emails.bob = "shyjutalks@gmail.com.evil.com";
    await expect(as("bob", () => q("select public.moderate_submission($1, 'approved')", [pendingId]))).rejects.toThrow(/admin only/);
    emails.bob = "bob@example.com";
  });
});

describe("companies", () => {
  it("propose_company requires auth, creates unverified, reuses exact matches, hands out unique slugs", async () => {
    await expect(as("anon", () => q("select * from public.propose_company('Zed', 'Other')"))).rejects.toThrow(/permission denied/i);
    // An unrelated company already owns the slug "zed-systems".
    await q("insert into public.companies (name, normalized_name, slug, park) values ('Zed Holdings','zed holdings','zed-systems','Other')");
    const a = await as("bob", () => q("select * from public.propose_company('Zed Systems Pvt. Ltd.', 'Technopark')"));
    expect(a.rows[0].slug).toBe("zed-systems-2");
    const again = await as("carol", () => q("select * from public.propose_company('zed  systems', 'Technopark')"));
    expect(again.rows[0].id).toBe(a.rows[0].id);
    const row = await q("select verified, review_count from public.companies where id = $1", [a.rows[0].id]);
    expect(row.rows[0]).toEqual({ verified: false, review_count: 0 });
  });

  it("users cannot insert companies directly", async () => {
    await expect(as("bob", () => q("insert into public.companies (name, normalized_name, slug, park) values ('Evil','evil','evil','Other')"))).rejects.toThrow(/permission denied/i);
  });

  it("rejects an invalid park", async () => {
    await expect(as("bob", () => q("select * from public.propose_company('Nowhere Inc', 'Mars')"))).rejects.toThrow(/check constraint/i);
  });

  it("suggests likely duplicates without merging", async () => {
    await q("insert into public.companies (name, normalized_name, slug, park) values ('Tata Consultancy Services','tata consultancy services','tata-consultancy-services','Infopark')");
    for (const term of ["TCS", "Tata Consultancy", "tata consultancy services pvt ltd"]) {
      const r = await as("anon", () => q("select name from public.similar_companies($1)", [term]));
      expect(r.rows.map((x) => x.name), term).toContain("Tata Consultancy Services");
    }
    const none = await as("anon", () => q("select name from public.similar_companies('Totally Different')"));
    expect(none.rows).toHaveLength(0);
  });
});

describe("events", () => {
  it("anyone can log allowed events, only admin can read", async () => {
    await as("anon", () => q("insert into public.events (name, anon_id) values ('landing_view', 'abc')"));
    await expect(as("anon", () => q("insert into public.events (name) values ('hack')"))).rejects.toThrow(/check constraint/i);
    await expect(as("anon", () => q("select * from public.events"))).rejects.toThrow(/permission denied/i);
    const own = await as("bob", () => q("select * from public.events"));
    expect(own.rows).toHaveLength(0);
    const all = await as("admin", () => q("select * from public.events"));
    expect(all.rows.length).toBeGreaterThan(0);
  });

  it("users cannot log events as someone else", async () => {
    await expect(
      as("bob", () => q("insert into public.events (name, user_id) values ('company_view', $1)", [ids.alice])),
    ).rejects.toThrow();
  });
});

describe("follows, saves and preparation checklists", () => {
  let approvedId: string;
  beforeAll(async () => {
    approvedId = (await q("select id from public.submissions where role = 'Data Engineer'")).rows[0].id as string;
  });

  it("follows are private and own-row only", async () => {
    await as("bob", () => q("insert into public.company_follows (user_id, company_id) values ($1, $2)", [ids.bob, company]));
    await expect(as("bob", () => q("insert into public.company_follows (user_id, company_id) values ($1, $2)", [ids.alice, company]))).rejects.toThrow(/row-level security/i);
    expect((await as("alice", () => q("select * from public.company_follows"))).rows).toHaveLength(0);
    await expect(as("anon", () => q("select * from public.company_follows"))).rejects.toThrow(/permission denied/i);
  });

  it("saving works for approved reports only, and is private", async () => {
    await as("bob", () => q("insert into public.saved_experiences (user_id, submission_id) values ($1, $2)", [ids.bob, approvedId]));
    const pendingId = (await q("select id from public.submissions where role = 'QA Engineer'")).rows[0].id as string;
    await expect(as("bob", () => q("insert into public.saved_experiences (user_id, submission_id) values ($1, $2)", [ids.bob, pendingId]))).rejects.toThrow(/row-level security/i);
    expect((await as("alice", () => q("select * from public.saved_experiences"))).rows).toHaveLength(0);
    expect((await as("bob", () => q("select * from public.saved_experiences"))).rows).toHaveLength(1);
  });

  it("followed companies report new approved experiences since last seen", async () => {
    await q("update public.company_follows set last_seen_at = now() - interval '1 day' where user_id = $1", [ids.bob]);
    await q("update public.submissions set moderated_at = now() where id = $1", [approvedId]);
    const feed = await as("bob", () => q("select role from public.my_new_experiences()"));
    expect(feed.rows.map((r) => r.role)).toContain("Data Engineer");
    const companies = await as("bob", () => q("select new_count from public.my_followed_companies()"));
    expect(Number(companies.rows[0].new_count)).toBeGreaterThanOrEqual(1);
    await as("bob", () => q("update public.company_follows set last_seen_at = now()"));
    const after = await as("bob", () => q("select role from public.my_new_experiences()"));
    expect(after.rows).toHaveLength(0);
    expect((await as("alice", () => q("select * from public.my_new_experiences()"))).rows).toHaveLength(0);
  });

  it("prep plans and checklist items are private; users cannot add items to someone else's plan", async () => {
    const plan = await as("bob", () => q("insert into public.prep_plans (user_id, company_id, interview_date) values ($1, $2, '2026-01-01') returning id", [ids.bob, company]));
    const planId = plan.rows[0].id as string;
    await as("bob", () => q("insert into public.prep_items (plan_id, user_id, text) values ($1, $2, 'Revise DSA')", [planId, ids.bob]));
    await expect(as("alice", () => q("insert into public.prep_items (plan_id, user_id, text) values ($1, $2, 'sneaky')", [planId, ids.alice]))).rejects.toThrow(/row-level security/i);
    expect((await as("alice", () => q("select * from public.prep_items"))).rows).toHaveLength(0);
    expect((await as("alice", () => q("select * from public.prep_plans"))).rows).toHaveLength(0);
    await as("bob", () => q("update public.prep_items set done = true"));
    await expect(as("bob", () => q("update public.prep_plans set user_id = $1", [ids.alice]))).rejects.toThrow(/permission denied/i);
  });

  it("interview-date reminders appear only for past dates, until dismissed or contributed", async () => {
    const dave = "dave" as Actor; // has never contributed
    const daveId = ids["dave" as keyof typeof ids];
    await as(dave, () => q("insert into public.prep_plans (user_id, company_id, interview_date) values ($1, $2, current_date - 3)", [daveId, company]));
    expect((await as(dave, () => q("select company_name from public.my_reminders()"))).rows).toEqual([{ company_name: "Acme Labs" }]);
    // Bob already contributed for this company, so he gets no nudge for his own (past-dated) plan.
    expect((await as("bob", () => q("select * from public.my_reminders()"))).rows).toHaveLength(0);
    // Dismissing hides it.
    await as(dave, () => q("update public.prep_plans set reminder_dismissed = true"));
    expect((await as(dave, () => q("select * from public.my_reminders()"))).rows).toHaveLength(0);
    // A future interview date never nudges.
    await as(dave, () => q("update public.prep_plans set reminder_dismissed = false, interview_date = current_date + 5"));
    expect((await as(dave, () => q("select * from public.my_reminders()"))).rows).toHaveLength(0);
    // Contributing also ends the nudge.
    await as(dave, () => q("update public.prep_plans set interview_date = current_date - 1"));
    expect((await as(dave, () => q("select * from public.my_reminders()"))).rows).toHaveLength(1);
    await insertSubmission(dave, { user_id: daveId, role: "Dave Role" });
    expect((await as(dave, () => q("select * from public.my_reminders()"))).rows).toHaveLength(0);
  });
});

describe("company requests (demand capture)", () => {
  it("anonymous and signed-in requests are counted once each and hidden from non-admins", async () => {
    await as("anon", () => q("select public.request_company_experiences($1, 'browser-1')", [company]));
    await as("anon", () => q("select public.request_company_experiences($1, 'browser-1')", [company]));
    await as("anon", () => q("select public.request_company_experiences($1, 'browser-2')", [company]));
    await as("bob", () => q("select public.request_company_experiences($1)", [company]));
    await as("bob", () => q("select public.request_company_experiences($1)", [company]));
    await expect(as("anon", () => q("select public.request_company_experiences($1)", [company]))).rejects.toThrow(/missing requester/);
    const has = await as("anon", () => q("select public.has_requested($1, 'browser-1') as h", [company]));
    expect(has.rows[0].h).toBe(true);
    await expect(as("anon", () => q("select * from public.company_requests"))).rejects.toThrow(/permission denied/i);
    await expect(as("bob", () => q("select * from public.requested_companies()"))).rejects.toThrow(/admin only/);
    const admin = await as("admin", () => q("select name, request_count from public.requested_companies()"));
    expect(admin.rows).toEqual([{ name: "Acme Labs", request_count: 3 }]);
  });
});

describe("growth metrics", () => {
  it("counts visits, return visits and UTM sources; admin only", async () => {
    await as("anon", () => q("insert into public.events (name, anon_id, utm_source, utm_medium, utm_campaign) values ('visit','v1','instagram','bio','first50')"));
    await q("insert into public.events (name, anon_id, created_at) values ('visit','v1', now() - interval '2 days')");
    await as("anon", () => q("insert into public.events (name, anon_id) values ('submit_started','v1')"));
    await as("anon", () => q("insert into public.events (name, anon_id, utm_source) values ('save_added','v1','instagram')"));
    await expect(as("bob", () => q("select public.growth_metrics()"))).rejects.toThrow(/admin only/);
    const m = (await as("admin", () => q("select public.growth_metrics() as m"))).rows[0].m as Record<string, unknown>;
    expect(m).toMatchObject({ return_visitors: 1, form_starts: 1, saves: 1, requests: 3 });
    expect(JSON.stringify(m.by_source)).toContain("instagram");
  });

  it("public_stats returns counts only", async () => {
    const r = await as("anon", () => q("select public.public_stats() as s"));
    expect(Object.keys(r.rows[0].s as object).sort()).toEqual(["approved_reports", "companies_with_reports"]);
  });
});
