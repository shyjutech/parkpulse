import { EXPERIENCE_LEVELS, PARKS, RECENCY_OPTIONS } from "@/lib/constants";

export interface FilterValues {
  q: string;
  company: string;
  park: string;
  role: string;
  level: string;
  recency: string;
}

const field = "min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm";

/** Plain GET form: filters live in the URL, so results are shareable and server-rendered. */
export default function Filters({ v, action }: { v: FilterValues; action: string }) {
  const active = [v.company, v.park, v.role, v.level, v.recency].filter(Boolean).length;
  return (
    <form action={action} role="search" className="space-y-3">
      <div className="flex gap-2">
        <label htmlFor="q" className="sr-only">Search companies, roles, questions</label>
        <input id="q" name="q" defaultValue={v.q} placeholder="Search companies, roles, questions…" className={`${field} flex-1`} />
        <button className="min-h-11 rounded-md bg-brand-700 px-5 font-medium text-white hover:bg-brand-800">Search</button>
      </div>
      <details className="rounded-md border border-stone-200 bg-white p-3" open={active > 0}>
        <summary className="min-h-8 cursor-pointer text-sm font-medium">
          Filters{active > 0 ? ` (${active} applied)` : ""}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">Company
            <input name="company" defaultValue={v.company} placeholder="e.g. UST" className={`${field} mt-1`} />
          </label>
          <label className="text-sm">Location
            <select name="park" defaultValue={v.park} className={`${field} mt-1`}>
              <option value="">Anywhere</option>
              {PARKS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-sm">Role
            <input name="role" defaultValue={v.role} placeholder="e.g. Flutter" className={`${field} mt-1`} />
          </label>
          <label className="text-sm">Experience level
            <select name="level" defaultValue={v.level} className={`${field} mt-1`}>
              <option value="">Any</option>
              {EXPERIENCE_LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="text-sm">Interview date
            <select name="recency" defaultValue={v.recency} className={`${field} mt-1`}>
              {RECENCY_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
        </div>
      </details>
    </form>
  );
}
