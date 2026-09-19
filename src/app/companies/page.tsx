import Link from "next/link";
import CompanyCard from "@/components/CompanyCard";
import Pagination from "@/components/Pagination";
import { DIRECTORY_PAGE_SIZE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_COLUMNS, type Company } from "@/lib/types";

export const metadata = { title: "Companies" };

export default async function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const from = (page - 1) * DIRECTORY_PAGE_SIZE;
  const supabase = await createClient();
  // Unverified companies with no approved experiences yet are proposals, not directory entries.
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_COLUMNS)
    .or("verified.eq.true,review_count.gt.0")
    .order("review_count", { ascending: false })
    .order("name")
    .range(from, from + DIRECTORY_PAGE_SIZE);
  const companies = (data ?? []) as Company[];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Companies</h1>
      <form action="/search" className="mt-4 flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search</label>
        <input
          id="q"
          name="q"
          placeholder="Search companies, roles or questions"
          className="min-h-11 flex-1 rounded-md border border-stone-300 bg-white px-3"
        />
        <button className="rounded-md bg-brand-700 px-4 font-medium text-white hover:bg-brand-800">Search</button>
      </form>

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-800">
          We couldn&apos;t load companies right now. Please try again in a moment.
        </p>
      )}
      {!error && companies.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-stone-300 bg-white p-6 text-stone-600">
          No companies listed yet. Be the first to{" "}
          <Link href="/submit" className="font-medium text-brand-700 underline">share an experience</Link>.
        </div>
      )}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {companies.slice(0, DIRECTORY_PAGE_SIZE).map((c) => (
          <CompanyCard key={c.id} company={c} />
        ))}
      </div>
      <Pagination page={page} hasNext={companies.length > DIRECTORY_PAGE_SIZE} hrefFor={(p) => `/companies?page=${p}`} />
    </div>
  );
}
