import Link from "next/link";
import CompanyCard from "@/components/CompanyCard";
import Pagination from "@/components/Pagination";
import { DIRECTORY_PAGE_SIZE, PARKS } from "@/lib/constants";
import { qs } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_COLUMNS, type Company } from "@/lib/types";

export const metadata = { title: "Companies" };

const field = "min-h-11 rounded-md border border-stone-300 bg-white px-3 text-sm";

export default async function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const park = typeof sp.park === "string" && (PARKS as readonly string[]).includes(sp.park) ? sp.park : "";
  const from = (page - 1) * DIRECTORY_PAGE_SIZE;

  const supabase = await createClient();
  // Unverified companies with no approved reports yet are proposals, not directory entries.
  let query = supabase
    .from("companies")
    .select(COMPANY_COLUMNS)
    .or("verified.eq.true,review_count.gt.0");
  if (park) query = query.eq("park", park);
  if (q) query = query.ilike("name", `%${q.replace(/[\\%_,()]/g, " ")}%`);
  const { data, error } = await query
    .order("review_count", { ascending: false })
    .order("name")
    .range(from, from + DIRECTORY_PAGE_SIZE);
  const companies = (data ?? []) as Company[];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Companies</h1>
      <form className="mt-4 flex flex-wrap gap-2" role="search">
        <label htmlFor="q" className="sr-only">Company name</label>
        <input id="q" name="q" defaultValue={q} placeholder="Search company name" className={`${field} min-w-0 flex-1`} />
        <label htmlFor="park" className="sr-only">Location</label>
        <select id="park" name="park" defaultValue={park} className={field}>
          <option value="">All locations</option>
          {PARKS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button className="min-h-11 rounded-md bg-brand-700 px-4 font-medium text-white hover:bg-brand-800">Search</button>
      </form>

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-800">
          We couldn&apos;t load companies right now. Please try again in a moment.
        </p>
      )}
      {!error && companies.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-stone-300 bg-white p-6 text-stone-600">
          {q || park ? "No companies match. " : "No companies listed yet. "}
          <Link href="/submit" className="font-medium text-brand-700 underline">Share an experience</Link> to add one.
        </div>
      )}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {companies.slice(0, DIRECTORY_PAGE_SIZE).map((c) => (
          <CompanyCard key={c.id} company={c} />
        ))}
      </div>
      <Pagination
        page={page}
        hasNext={companies.length > DIRECTORY_PAGE_SIZE}
        hrefFor={(p) => `/companies${qs({ q, park, page: p > 1 ? p : undefined })}`}
      />
    </div>
  );
}
