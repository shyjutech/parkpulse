import Link from "next/link";
import ExperienceCard from "@/components/ExperienceCard";
import Filters from "@/components/Filters";
import InlineNudge from "@/components/InlineNudge";
import Pagination from "@/components/Pagination";
import TrackEvent from "@/components/TrackEvent";
import { PAGE_SIZE, RECENCY_OPTIONS } from "@/lib/constants";
import { savedIds } from "@/lib/engagement";
import { qs, sinceMonthsAgo } from "@/lib/nav";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ExperienceWithCompany } from "@/lib/types";

export const metadata = { title: "Experiences" };

type Row = ExperienceWithCompany & { company_park: string; total_count: number };

const pick = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim().slice(0, 100) : "");

export default async function ExperiencesPage({ searchParams }: PageProps<"/experiences">) {
  const sp = await searchParams;
  const f = {
    q: pick(sp.q),
    company: pick(sp.company),
    park: pick(sp.park),
    role: pick(sp.role),
    level: pick(sp.level),
    recency: pick(sp.recency),
  };
  const page = Math.max(1, Number(pick(sp.page)) || 1);
  const months = RECENCY_OPTIONS.find((r) => r.value === f.recency)?.months ?? 0;
  const filtered = Object.values(f).some(Boolean);

  const supabase = await createClient();
  const viewer = await getViewer();
  const { data, error } = await supabase.rpc("browse_experiences", {
    p_q: f.q || null,
    p_company: f.company || null,
    p_park: f.park || null,
    p_role: f.role || null,
    p_level: f.level || null,
    p_since: months ? sinceMonthsAgo(months) : null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  const rows = (data ?? []) as Row[];
  const total = rows[0] ? Number(rows[0].total_count) : 0;
  const saved = await savedIds(supabase, rows.map((r) => r.id), !!viewer.userId);
  const here = `/experiences${qs({ ...f, page: page > 1 ? page : undefined })}`;
  const from = (page - 1) * PAGE_SIZE + 1;

  return (
    <div>
      {f.q && <TrackEvent name="search_used" />}
      <h1 className="text-2xl font-semibold">Interview experiences</h1>
      <p className="mt-1 text-sm text-stone-600">
        Anonymous reports from Kerala IT candidates. Open to everyone, no sign-in needed.
      </p>
      <div className="mt-4">
        <Filters v={f} action="/experiences" />
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-800">
          We couldn&apos;t load experiences right now. Please try again in a moment.
        </p>
      )}

      {!error && (
        <p className="mt-6 text-sm text-stone-600" aria-live="polite">
          {total === 0
            ? "No reports found."
            : `Showing ${from}–${from + rows.length - 1} of ${total} ${total === 1 ? "report" : "reports"}`}
          {filtered && (
            <>
              {" "}· <Link href="/experiences" className="text-brand-700 underline">Clear filters</Link>
            </>
          )}
        </p>
      )}

      {!error && rows.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-stone-300 bg-white p-6 text-stone-600">
          {filtered ? (
            <>Nothing matches those filters. Try removing one, or <Link href="/submit" className="font-medium text-brand-700 underline">share an experience</Link> to help fill the gap.</>
          ) : (
            <>No approved reports yet. <Link href="/submit" className="font-medium text-brand-700 underline">Be the first to share one</Link>.</>
          )}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {rows.map((r, i) => (
          <div key={r.id} className="space-y-4">
            <ExperienceCard
              e={r}
              company={{ name: r.company_name, slug: r.company_slug }}
              save={{ signedIn: !!viewer.userId, saved: saved.has(r.id), next: here }}
            />
            {i === 2 && !viewer.hasContributed && <InlineNudge />}
          </div>
        ))}
      </div>
      <Pagination
        page={page}
        hasNext={page * PAGE_SIZE < total}
        hrefFor={(p) => `/experiences${qs({ ...f, page: p > 1 ? p : undefined })}`}
      />
    </div>
  );
}
