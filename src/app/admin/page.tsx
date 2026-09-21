import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import ConfirmButton from "@/components/ConfirmButton";
import { deleteSubmission, moderate, verifyCompany } from "./actions";

export const metadata = { title: "Admin" };

interface Pending {
  id: string;
  role: string;
  experience_level: string;
  interview_date: string | null;
  rounds: string | null;
  questions: string;
  difficulty: string | null;
  outcome: string | null;
  salary_type: string | null;
  salary_bucket: string | null;
  rating: number | null;
  culture_notes: string | null;
  submitted_at: string;
  companies: { id: string; name: string; park: string; verified: boolean } | null;
}

interface Reviewed {
  id: string;
  role: string;
  status: string;
  submitted_at: string;
  companies: { name: string } | null;
}

interface Growth {
  visitors: number;
  return_visitors: number;
  form_starts: number;
  submissions: number;
  saves: number;
  follows: number;
  checklists: number;
  requests: number;
  by_source: { source: string; visitors: number; submissions: number }[];
}

interface Requested {
  company_id: string;
  name: string;
  slug: string;
  park: string;
  request_count: number;
  approved_reports: number;
}

interface Metrics {
  authenticated_users: number;
  contributors: number;
  contributors_viewed_full_data: number;
  submissions: number;
  approved_submissions: number;
  returning_contributors: number;
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");

export default async function AdminPage() {
  // UX gate only; every query below is independently enforced by the database.
  const viewer = await getViewer();
  if (!viewer.isAdmin) notFound();

  const supabase = await createClient();
  const [pendingRes, metricsRes, reviewedRes, unverifiedRes, growthRes, requestedRes] = await Promise.all([
    supabase
      .from("submissions")
      .select(
        "id, role, experience_level, interview_date, rounds, questions, difficulty, outcome, salary_type, salary_bucket, rating, culture_notes, submitted_at, companies(id, name, park, verified)",
      )
      .eq("status", "pending")
      .order("submitted_at")
      .limit(50),
    supabase.rpc("phase1_metrics"),
    supabase
      .from("submissions")
      .select("id, role, status, submitted_at, companies(name)")
      .in("status", ["approved", "rejected"])
      .order("submitted_at", { ascending: false })
      .limit(30),
    supabase
      .from("companies")
      .select("id, name, park, review_count")
      .eq("verified", false)
      .order("name")
      .limit(100),
    supabase.rpc("growth_metrics"),
    supabase.rpc("requested_companies"),
  ]);
  const growth = growthRes.data as Growth | null;
  const requested = (requestedRes.data ?? []) as Requested[];
  const unverified = (unverifiedRes.data ?? []) as { id: string; name: string; park: string; review_count: number }[];
  const reviewed = (reviewedRes.data ?? []) as unknown as Reviewed[];
  const pending = (pendingRes.data ?? []) as unknown as Pending[];
  const m = metricsRes.data as Metrics | null;

  const btn = "min-h-11 rounded-md px-4 text-sm font-medium";
  return (
    <div>
      <h1 className="text-2xl font-semibold">Moderation</h1>

      {m && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["Contribution rate", pct(m.contributors, m.authenticated_users), `${m.contributors}/${m.authenticated_users} signed-in users`],
            ["Unlock engagement", pct(m.contributors_viewed_full_data, m.contributors), `${m.contributors_viewed_full_data}/${m.contributors} contributors`],
            ["Approval rate", pct(m.approved_submissions, m.submissions), `${m.approved_submissions}/${m.submissions} submissions`],
            ["Returning contributors", String(m.returning_contributors), "active on 2+ days"],
          ].map(([label, value, sub]) => (
            <div key={label} className="rounded-lg border border-stone-200 bg-white p-3">
              <dt className="text-stone-500">{label}</dt>
              <dd className="text-xl font-semibold">{value}</dd>
              <dd className="text-xs text-stone-500">{sub}</dd>
            </div>
          ))}
        </dl>
      )}

      {growth && (
        <section aria-labelledby="growth" className="mt-8">
          <h2 id="growth" className="text-lg font-semibold">Core journey</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Visitors", growth.visitors],
              ["Return visitors", growth.return_visitors],
              ["Form starts", growth.form_starts],
              ["Submissions", growth.submissions],
              ["Saves", growth.saves],
              ["Follows", growth.follows],
              ["Checklists", growth.checklists],
              ["Requests", growth.requests],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-stone-200 bg-white p-3">
                <dt className="text-stone-500">{label}</dt>
                <dd className="text-xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {growth.by_source.length > 0 && (
            <table className="mt-4 w-full max-w-md text-left text-sm">
              <caption className="mb-1 text-left text-xs text-stone-500">By traffic source (UTM)</caption>
              <thead><tr className="text-stone-500"><th className="py-1 font-medium">Source</th><th className="font-medium">Visitors</th><th className="font-medium">Submissions</th></tr></thead>
              <tbody>
                {growth.by_source.map((r) => (
                  <tr key={r.source} className="border-t border-stone-200"><td className="py-1">{r.source}</td><td>{r.visitors}</td><td>{r.submissions}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section aria-labelledby="requested" className="mt-8">
        <h2 id="requested" className="text-lg font-semibold">Requested companies</h2>
        {requested.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">No requests yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {requested.map((r) => (
              <li key={r.company_id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span><span className="font-medium">{r.name}</span> · {r.park} · {r.approved_reports} approved {r.approved_reports === 1 ? "report" : "reports"}</span>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">{r.request_count} {r.request_count === 1 ? "request" : "requests"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mt-8 text-lg font-semibold">Pending submissions ({pending.length})</h2>
      {pendingRes.error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">Couldn&apos;t load the queue.</p>
      )}
      {!pendingRes.error && pending.length === 0 && <p className="mt-3 text-stone-600">Nothing to review. 🎉</p>}
      <div className="mt-4 space-y-4">
        {pending.map((p) => (
          <article key={p.id} className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">{p.companies?.name} <span className="font-normal text-stone-500">· {p.companies?.park}</span></h3>
                <p className="text-sm text-stone-600">
                  {[p.role, p.experience_level, p.interview_date?.slice(0, 7), p.difficulty, p.outcome, p.salary_type && `${p.salary_type}${p.salary_bucket ? ` ${p.salary_bucket}` : ""}`, p.rating ? `${p.rating}/5` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              {p.companies && !p.companies.verified && (
                <form action={verifyCompany}>
                  <input type="hidden" name="id" value={p.companies.id} />
                  <button className="rounded-md border border-stone-300 px-3 py-2 text-xs hover:border-brand-600">
                    Company not verified · mark verified
                  </button>
                </form>
              )}
            </div>
            {(["questions", "rounds", "culture_notes"] as const).filter((f) => p[f]).map((f) => (
              <div key={f} className="mt-3">
                <h4 className="text-xs font-semibold uppercase text-stone-500">{f.replace("_", " ")}</h4>
                <p className="whitespace-pre-wrap break-words text-sm">{p[f]}</p>
              </div>
            ))}
            <form action={moderate} className="mt-4 flex gap-3">
              <input type="hidden" name="id" value={p.id} />
              <button name="decision" value="approved" className={`${btn} bg-brand-700 text-white hover:bg-brand-800`}>Approve</button>
              <button name="decision" value="rejected" className={`${btn} border border-stone-300 hover:border-red-600 hover:text-red-700`}>Reject</button>
            </form>
            <form action={deleteSubmission} className="mt-2">
              <input type="hidden" name="id" value={p.id} />
              <ConfirmButton confirmMessage="Permanently delete this submission? This cannot be undone." className="text-xs text-red-700 underline">
                Delete permanently
              </ConfirmButton>
            </form>
          </article>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold">Unverified companies ({unverified.length})</h2>
      {unverified.length === 0 ? (
        <p className="mt-3 text-stone-600">All companies are verified.</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {unverified.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>
                <span className="font-medium">{c.name}</span> · {c.park} · {c.review_count} approved
              </span>
              <form action={verifyCompany}>
                <input type="hidden" name="id" value={c.id} />
                <button className="min-h-11 rounded-md bg-brand-700 px-3 text-xs font-medium text-white hover:bg-brand-800">Verify</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-lg font-semibold">Recently reviewed</h2>
      {reviewed.length === 0 ? (
        <p className="mt-3 text-stone-600">No approved or rejected submissions yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {reviewed.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>
                <span className="font-medium">{r.companies?.name}</span> · {r.role} ·{" "}
                <span className={r.status === "approved" ? "text-brand-700" : "text-stone-500"}>{r.status}</span> ·{" "}
                {new Date(r.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <form action={deleteSubmission}>
                <input type="hidden" name="id" value={r.id} />
                <ConfirmButton confirmMessage="Permanently delete this submission? This cannot be undone." className="min-h-11 rounded-md border border-stone-300 px-3 text-xs text-red-700 hover:border-red-600">
                  Delete
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
