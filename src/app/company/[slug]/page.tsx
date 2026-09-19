import { notFound } from "next/navigation";
import BarList from "@/components/BarList";
import { VerifiedBadge } from "@/components/CompanyCard";
import ExperienceCard from "@/components/ExperienceCard";
import Pagination from "@/components/Pagination";
import SalaryChart from "@/components/SalaryChart";
import Stars from "@/components/Stars";
import TrackEvent from "@/components/TrackEvent";
import UnlockCta from "@/components/UnlockCta";
import { DIFFICULTIES, OUTCOMES, PAGE_SIZE, SALARY_BUCKETS } from "@/lib/constants";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_COLUMNS, EXPERIENCE_COLUMNS, type Company, type Experience } from "@/lib/types";

interface Breakdown {
  total: number;
  salary: Record<string, number>;
  difficulty: Record<string, number>;
  outcome: Record<string, number>;
}

export async function generateMetadata({ params }: PageProps<"/company/[slug]">) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("name").eq("slug", slug).maybeSingle();
  return { title: data?.name ?? "Company" };
}

export default async function CompanyPage({ params, searchParams }: PageProps<"/company/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const supabase = await createClient();

  const { data } = await supabase.from("companies").select(COMPANY_COLUMNS).eq("slug", slug).maybeSingle();
  if (!data) notFound();
  const company = data as Company;

  const viewer = await getViewer();
  const unlocked = viewer.hasContributed || viewer.isAdmin;

  let breakdown: Breakdown | null = null;
  let experiences: Experience[] = [];
  let hasNext = false;
  let loadError = false;

  if (unlocked) {
    const from = (page - 1) * PAGE_SIZE;
    const [b, list] = await Promise.all([
      supabase.rpc("company_breakdown", { p_company: company.id }),
      supabase
        .from("submissions")
        .select(EXPERIENCE_COLUMNS)
        .eq("company_id", company.id)
        .eq("status", "approved")
        .order("submitted_at", { ascending: false })
        .range(from, from + PAGE_SIZE),
    ]);
    if (b.error || list.error) loadError = true;
    breakdown = (b.data as Breakdown | null) ?? null;
    const rows = (list.data ?? []) as unknown as Experience[];
    hasNext = rows.length > PAGE_SIZE;
    experiences = rows.slice(0, PAGE_SIZE);
  }

  return (
    <div>
      <TrackEvent name={unlocked ? "full_company_view" : "company_view"} companyId={company.id} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        <VerifiedBadge verified={company.verified} />
      </div>
      <p className="mt-1 text-stone-600">{company.park}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-stone-200 bg-white p-4 text-sm">
        <span>
          <strong>{company.review_count}</strong> approved {company.review_count === 1 ? "experience" : "experiences"}
        </span>
        {company.review_count > 0 ? (
          <span className="flex items-center gap-2">
            <Stars value={Number(company.avg_rating)} />
            {Number(company.avg_rating).toFixed(1)} overall interview experience
          </span>
        ) : (
          <span className="text-stone-500">No ratings yet</span>
        )}
        {company.review_count > 0 && company.review_count < 5 && (
          <span className="text-stone-500">Based on {company.review_count} — treat as anecdotal.</span>
        )}
      </div>

      {!unlocked && (
        <div className="mt-6">
          <UnlockCta signedIn={!!viewer.userId} next={`/company/${company.slug}`} />
        </div>
      )}

      {unlocked && loadError && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-800">
          We couldn&apos;t load all the data right now. Please refresh in a moment.
        </p>
      )}

      {unlocked && breakdown && breakdown.total > 0 && (
        <section className="mt-8" aria-labelledby="dist">
          <h2 id="dist" className="text-lg font-semibold">Salary and interview breakdown</h2>
          <div className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Annual CTC ranges shared</h3>
            {Object.keys(breakdown.salary).length > 0 ? (
              <SalaryChart data={SALARY_BUCKETS.map((b) => ({ bucket: b, count: breakdown.salary[b] ?? 0 }))} />
            ) : (
              <p className="mt-2 text-sm text-stone-500">Nobody has shared a salary range yet.</p>
            )}
            <p className="mt-1 text-xs text-stone-500">Counts of experiences per range. Exact salaries are never shown.</p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <BarList title="Difficulty" items={DIFFICULTIES.map((d) => ({ label: d, count: breakdown.difficulty[d] ?? 0 }))} />
            </div>
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <BarList title="Outcomes" items={OUTCOMES.map((o) => ({ label: o, count: breakdown.outcome[o] ?? 0 }))} />
            </div>
          </div>
        </section>
      )}

      {unlocked && (
        <section className="mt-8" aria-labelledby="exp">
          <h2 id="exp" className="text-lg font-semibold">Experiences</h2>
          {experiences.length === 0 ? (
            <p className="mt-2 text-stone-600">No approved experiences for this company yet.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {experiences.map((e) => <ExperienceCard key={e.id} e={e} />)}
            </div>
          )}
          <Pagination page={page} hasNext={hasNext} hrefFor={(p) => `/company/${company.slug}?page=${p}`} />
        </section>
      )}
    </div>
  );
}
