import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { moderate, verifyCompany } from "./actions";

export const metadata = { title: "Admin" };

interface Pending {
  id: string;
  role: string;
  experience_level: string;
  interview_date: string | null;
  rounds: string;
  questions: string;
  difficulty: string;
  outcome: string;
  salary_type: string;
  salary_bucket: string | null;
  rating: number;
  culture_notes: string;
  submitted_at: string;
  companies: { id: string; name: string; park: string; verified: boolean } | null;
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
  const [pendingRes, metricsRes] = await Promise.all([
    supabase
      .from("submissions")
      .select(
        "id, role, experience_level, interview_date, rounds, questions, difficulty, outcome, salary_type, salary_bucket, rating, culture_notes, submitted_at, companies(id, name, park, verified)",
      )
      .eq("status", "pending")
      .order("submitted_at")
      .limit(50),
    supabase.rpc("phase1_metrics"),
  ]);
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
                  {p.role} · {p.experience_level} · {p.difficulty} · {p.outcome} · {p.salary_type}
                  {p.salary_bucket ? ` ${p.salary_bucket}` : ""} · {p.rating}/5
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
            {(["rounds", "questions", "culture_notes"] as const).map((f) => (
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
          </article>
        ))}
      </div>
    </div>
  );
}
