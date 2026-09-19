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
  await db.exec(
    fs.readFileSync(
      path.join(__dirname, "../../supabase/migrations/20260919000000_phase1_init.sql"),
      "utf8",
    ),
  );
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

  it("signed-out users cannot read submissions or profiles", async () => {
    await expect(as("anon", () => q("select id from public.submissions"))).rejects.toThrow(/permission denied/i);
    await expect(as("anon", () => q("select id from public.profiles"))).rejects.toThrow(/permission denied/i);
  });

  it("signed-in users can submit, and the new row is pending", async () => {
    await insertSubmission("bob", { user_id: ids.bob, role: "QA Engineer" });
    const r = await as("bob", () => q("select status from public.submissions where role = 'QA Engineer'"));
    expect(r.rows).toEqual([{ status: "pending" }]);
  });
});

describe("contribution gate", () => {
  let carolRowSeen: number;

  it("a contribution flips has_contributed and bumps the count (via trigger)", async () => {
    const before = await as("carol", () => q("select has_contributed, contribution_count from public.profiles"));
    expect(before.rows).toEqual([{ has_contributed: false, contribution_count: 0 }]);
    await insertSubmission("carol", { user_id: ids.carol, role: "Backend Engineer" });
    const after = await as("carol", () => q("select has_contributed, contribution_count from public.profiles"));
    expect(after.rows).toEqual([{ has_contributed: true, contribution_count: 1 }]);
  });

  it("locked user sees no approved rows, no search hits, no breakdown", async () => {
    await superInsertApproved({ role: "Data Engineer", user_id: ids.admin });
    // Fresh locked user (dave) — bob already contributed in the previous suite.
    const dave = "00000000-0000-0000-0000-00000000000d";
    await q("insert into auth.users (id, email) values ($1, 'dave@example.com')", [dave]);
    ids["dave" as keyof typeof ids] = dave;
    emails.dave = "dave@example.com";
    const rows = await as("dave" as Actor, () => q("select id from public.submissions"));
    expect(rows.rows).toHaveLength(0);
    const search = await as("dave" as Actor, () => q("select * from public.search_submissions('flutter')"));
    expect(search.rows).toHaveLength(0);
    const breakdown = await as("dave" as Actor, () => q("select public.company_breakdown($1) as b", [company]));
    expect(breakdown.rows[0].b).toBeNull();
  });

  it("contributor sees approved rows from others, but not others' pending", async () => {
    const rows = await as("carol", () => q("select role, status from public.submissions order by role"));
    carolRowSeen = rows.rows.length;
    const statuses = new Set(rows.rows.map((r) => r.status));
    // carol's own pending + approved from others; never alice's/bob's pending
    expect(rows.rows.filter((r) => r.role === "QA Engineer")).toHaveLength(0);
    expect(rows.rows.filter((r) => r.role === "Data Engineer")).toHaveLength(1);
    expect(statuses.has("approved")).toBe(true);
    expect(carolRowSeen).toBeGreaterThan(0);
  });

  it("search and breakdown work for contributors and return approved data only", async () => {
    const search = await as("carol", () => q("select role from public.search_submissions('data engineer')"));
    expect(search.rows.map((r) => r.role)).toEqual(["Data Engineer"]);
    const none = await as("carol", () => q("select role from public.search_submissions('backend')"));
    expect(none.rows).toHaveLength(0); // carol's own pending row is not searchable
    const b = await as("carol", () => q("select public.company_breakdown($1) as b", [company]));
    expect(b.rows[0].b).toMatchObject({ total: 1, salary: { "₹8L–₹12L": 1 }, difficulty: { Medium: 1 } });
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
    const r = await as("alice", () => q("select * from public.search_submissions('data engineer')"));
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
