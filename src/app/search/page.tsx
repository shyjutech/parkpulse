import CompanyCard from "@/components/CompanyCard";
import ExperienceCard from "@/components/ExperienceCard";
import Pagination from "@/components/Pagination";
import TrackEvent from "@/components/TrackEvent";
import UnlockCta from "@/components/UnlockCta";
import { PAGE_SIZE } from "@/lib/constants";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_COLUMNS, type Company, type Experience } from "@/lib/types";
import Link from "next/link";

export const metadata = { title: "Search" };

type Hit = Experience & { company_name: string; company_slug: string };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 100);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const viewer = await getViewer();
  const canReadExperiences = viewer.hasContributed || viewer.isAdmin;
  const supabase = await createClient();

  let companies: Company[] = [];
  let hits: Hit[] = [];
  let failed = false;
  let hasNext = false;

  if (q.length >= 2) {
    // Company names are public teaser data. Experience text is gated in the database.
    const escaped = q.replace(/[\\%_,()]/g, " ");
    const companyRes = await supabase
      .from("companies")
      .select(COMPANY_COLUMNS)
      .ilike("name", `%${escaped}%`)
      .order("review_count", { ascending: false })
      .limit(10);
    if (companyRes.error) failed = true;
    else companies = (companyRes.data ?? []) as Company[];

    if (canReadExperiences) {
      const res = await supabase.rpc("search_submissions", {
        q,
        p_limit: PAGE_SIZE + 1,
        p_offset: (page - 1) * PAGE_SIZE,
      });
      if (res.error) failed = true;
      else {
        const rows = (res.data ?? []) as Hit[];
        hasNext = rows.length > PAGE_SIZE;
        hits = rows.slice(0, PAGE_SIZE);
      }
    }
  }

  return (
    <div>
      {q.length >= 2 && <TrackEvent name="search_used" />}
      <h1 className="text-2xl font-semibold">Search</h1>
      <form className="mt-4 flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search</label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Company, role, question…"
          className="min-h-11 flex-1 rounded-md border border-stone-300 bg-white px-3"
        />
        <button className="rounded-md bg-brand-700 px-4 font-medium text-white hover:bg-brand-800">Search</button>
      </form>

      {q.length > 0 && q.length < 2 && <p className="mt-4 text-sm text-stone-600">Type at least 2 characters.</p>}
      {failed && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          Search isn&apos;t working right now. Please try again shortly.
        </p>
      )}

      {q.length >= 2 && (
        <>
          <h2 className="mt-8 font-semibold">Companies</h2>
          {companies.length === 0 ? (
            <p className="mt-2 text-sm text-stone-600">No companies match “{q}”.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {companies.map((c) => <CompanyCard key={c.id} company={c} />)}
            </div>
          )}

          <h2 className="mt-8 font-semibold">Experiences</h2>
          {!canReadExperiences ? (
            <div className="mt-3"><UnlockCta signedIn={!!viewer.userId} next={`/search?q=${encodeURIComponent(q)}`} /></div>
          ) : hits.length === 0 ? (
            <p className="mt-2 text-sm text-stone-600">No approved experiences match “{q}”.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {hits.map((h) => (
                <div key={h.id}>
                  <Link href={`/company/${h.company_slug}`} className="mb-1 inline-block text-sm font-medium text-brand-700 hover:underline">
                    {h.company_name}
                  </Link>
                  <ExperienceCard e={h} />
                </div>
              ))}
              <Pagination page={page} hasNext={hasNext} hrefFor={(p) => `/search?q=${encodeURIComponent(q)}&page=${p}`} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
