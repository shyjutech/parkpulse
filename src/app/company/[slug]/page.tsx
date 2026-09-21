import Link from "next/link";
import { notFound } from "next/navigation";
import BarList from "@/components/BarList";
import { VerifiedBadge } from "@/components/CompanyCard";
import { FollowButton, RequestButton } from "@/components/CompanyActions";
import ExperienceCard from "@/components/ExperienceCard";
import Pagination from "@/components/Pagination";
import SalaryChart from "@/components/SalaryChart";
import Stars from "@/components/Stars";
import TrackEvent from "@/components/TrackEvent";
import { DIFFICULTIES, EXPERIENCE_LEVELS, OUTCOMES, PAGE_SIZE, SALARY_BUCKETS } from "@/lib/constants";
import { getAnonId } from "@/lib/events";
import { savedIds } from "@/lib/engagement";
import { fullDate, monthYear, qs } from "@/lib/nav";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_COLUMNS, EXPERIENCE_COLUMNS, sampleNote, type Company, type Experience } from "@/lib/types";

interface Breakdown {
  total: number;
  salary: Record<string, number>;
  difficulty: Record<string, number>;
  outcome: Record<string, number>;
  levels: Record<string, number>;
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

const VIEWS = [
  { id: "reports", label: "Recent reports" },
  { id: "rounds", label: "Rounds" },
  { id: "questions", label: "Questions & topics" },
] as const;
type View = (typeof VIEWS)[number]["id"];

export async function generateMetadata({ params }: PageProps<"/company/[slug]">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("name").eq("slug", slug).maybeSingle();
  return { title: data?.name ?? "Company" };
}

function Snippet({ e, text }: { e: Experience; text: string }) {
  return (
    <li className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-500">
        {e.role} · {e.experience_level} · interviewed {monthYear(e.interview_date) || `posted ${fullDate(e.submitted_at)}`}
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{text}</p>
    </li>
  );
}

export default async function CompanyPage({ params, searchParams }: PageProps<"/company/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const view: View = VIEWS.some((v) => v.id === sp.view) ? (sp.view as View) : "reports";
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const supabase = await createClient();

  const { data } = await supabase.from("companies").select(COMPANY_COLUMNS).eq("slug", slug).maybeSingle();
  if (!data) notFound();
  const company = data as Company;
  const viewer = await getViewer();
  const here = `/company/${company.slug}${qs({ view: view === "reports" ? "" : view, page: page > 1 ? page : undefined })}`;
  const from = (page - 1) * PAGE_SIZE;

  let list = supabase
    .from("submissions")
    .select(EXPERIENCE_COLUMNS)
    .eq("company_id", company.id)
    .eq("status", "approved");
  if (view === "rounds") list = list.not("rounds", "is", null);
  const [b, listRes, followRes, requestedRes] = await Promise.all([
    supabase.rpc("company_breakdown", { p_company: company.id }),
    list.order("interview_date", { ascending: false, nullsFirst: false }).order("submitted_at", { ascending: false }).range(from, from + PAGE_SIZE),
    viewer.userId
      ? supabase.from("company_follows").select("company_id").eq("company_id", company.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc("has_requested", { p_company: company.id, p_anon: await getAnonId() }),
  ]);

  const breakdown = (b.data as Breakdown | null) ?? null;
  const rows = (listRes.data ?? []) as unknown as Experience[];
  const hasNext = rows.length > PAGE_SIZE;
  const experiences = rows.slice(0, PAGE_SIZE);
  const loadError = !!(b.error || listRes.error);
  const following = !!followRes.data;
  const requested = requestedRes.data === true;
  const saved = await savedIds(supabase, experiences.map((e) => e.id), !!viewer.userId);

  // Reading a followed company's page clears its "new reports" badge.
  if (following) {
    await supabase.from("company_follows").update({ last_seen_at: new Date().toISOString() }).eq("company_id", company.id);
  }

  const n = company.review_count;
  const rating = Number(company.avg_rating);
  const salaryN = breakdown ? sum(breakdown.salary) : 0;
  const diffN = breakdown ? sum(breakdown.difficulty) : 0;
  const outN = breakdown ? sum(breakdown.outcome) : 0;

  return (
    <div>
      <TrackEvent name="company_view" companyId={company.id} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        <VerifiedBadge verified={company.verified} />
      </div>
      <p className="mt-1 text-stone-600">{company.park}</p>

      <div className="mt-4 rounded-lg border border-stone-200 bg-white p-4 text-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span><strong>{n}</strong> {n === 1 ? "report" : "reports"}</span>
          {company.latest_report_on && <span>Latest interview: <strong>{monthYear(company.latest_report_on)}</strong></span>}
          {n >= 3 && rating > 0 && (
            <span className="flex items-center gap-2"><Stars value={rating} /> {rating.toFixed(1)} avg. interview experience</span>
          )}
        </div>
        <p className="mt-2 text-stone-600">{sampleNote(n)}</p>
        <p className="mt-1 text-xs text-stone-500">Reviewed by moderators, not verified. Reports are individual, self-reported experiences.</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/submit?company=${encodeURIComponent(company.slug)}`}
          className="inline-flex min-h-11 items-center rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
        >
          Share your experience
        </Link>
        <FollowButton companyId={company.id} following={following} signedIn={!!viewer.userId} next={here} />
        <Link
          href={viewer.userId ? `/prep/${company.slug}` : `/login?next=${encodeURIComponent(`/prep/${company.slug}`)}`}
          className="inline-flex min-h-11 items-center rounded-md border border-stone-300 bg-white px-4 text-sm font-medium hover:border-brand-600"
        >
          Preparing? Start a checklist
        </Link>
      </div>

      {(n < 5 || requested) && (
        <div className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white p-4">
          <p className="mb-3 text-sm text-stone-700">
            {n === 0 ? "Nobody has shared an experience here yet." : "Few reports so far."} Want to see more?
          </p>
          <RequestButton companyId={company.id} requested={requested} next={here} />
        </div>
      )}

      {loadError && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-800">
          We couldn&apos;t load all the data right now. Please refresh in a moment.
        </p>
      )}

      {breakdown && breakdown.total > 0 && (
        <section className="mt-8" aria-labelledby="dist">
          <h2 id="dist" className="text-lg font-semibold">At a glance</h2>
          <p className="mt-1 text-xs text-stone-500">Optional answers: not everyone fills every field, so counts differ.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <BarList title={`Experience level (${breakdown.total})`} items={EXPERIENCE_LEVELS.map((l) => ({ label: l, count: breakdown.levels[l] ?? 0 }))} />
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              {diffN > 0 ? (
                <BarList title={`Difficulty (${diffN} ${diffN === 1 ? "report" : "reports"})`} items={DIFFICULTIES.map((d) => ({ label: d, count: breakdown.difficulty[d] ?? 0 }))} />
              ) : (
                <p className="text-sm text-stone-500">No difficulty ratings shared yet.</p>
              )}
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              {outN > 0 ? (
                <BarList title={`Outcomes (${outN} ${outN === 1 ? "report" : "reports"})`} items={OUTCOMES.map((o) => ({ label: o, count: breakdown.outcome[o] ?? 0 }))} />
              ) : (
                <p className="text-sm text-stone-500">No outcomes shared yet.</p>
              )}
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <h3 className="text-sm font-semibold">Annual CTC ranges shared ({salaryN})</h3>
              {salaryN > 0 ? (
                <>
                  <SalaryChart data={SALARY_BUCKETS.map((s) => ({ bucket: s, count: breakdown.salary[s] ?? 0 }))} />
                  <p className="text-xs text-stone-500">
                    Counts per range from {salaryN} optional {salaryN === 1 ? "answer" : "answers"}
                    {salaryN < 5 ? ". Too few to say what is typical." : "."} Exact salaries are never shown.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-stone-500">No salary ranges shared yet.</p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="mt-8" aria-labelledby="reports">
        <h2 id="reports" className="sr-only">Reports</h2>
        <nav className="flex flex-wrap gap-2" aria-label="Report sections">
          {VIEWS.map((v) => (
            <Link
              key={v.id}
              href={`/company/${company.slug}${qs({ view: v.id === "reports" ? "" : v.id })}`}
              aria-current={view === v.id ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm ${
                view === v.id ? "border-brand-700 bg-brand-50 font-medium text-brand-800" : "border-stone-300 bg-white"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </nav>

        {experiences.length === 0 ? (
          <p className="mt-4 text-stone-600">
            {view === "rounds" ? "No interview rounds shared yet." : "No approved reports for this company yet."}
          </p>
        ) : view === "reports" ? (
          <div className="mt-4 space-y-4">
            {experiences.map((e) => (
              <ExperienceCard key={e.id} e={e} save={{ signedIn: !!viewer.userId, saved: saved.has(e.id), next: here }} />
            ))}
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {experiences.map((e) => (
              <Snippet key={e.id} e={e} text={view === "rounds" ? e.rounds! : e.questions} />
            ))}
          </ul>
        )}
        <Pagination
          page={page}
          hasNext={hasNext}
          hrefFor={(p) => `/company/${company.slug}${qs({ view: view === "reports" ? "" : view, page: p > 1 ? p : undefined })}`}
        />
      </section>
    </div>
  );
}
