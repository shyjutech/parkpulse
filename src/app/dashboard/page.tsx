import Link from "next/link";
import { redirect } from "next/navigation";
import ExperienceCard from "@/components/ExperienceCard";
import ReminderBanner from "@/components/ReminderBanner";
import { savedIds } from "@/lib/engagement";
import { fullDate, monthYear } from "@/lib/nav";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { EXPERIENCE_COLUMNS, type Experience, type ExperienceWithCompany } from "@/lib/types";

export const metadata = { title: "My space" };

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Awaiting review", cls: "bg-amber-100 text-amber-900" },
  approved: { label: "Approved", cls: "bg-brand-100 text-brand-800" },
  rejected: { label: "Not published", cls: "bg-stone-200 text-stone-700" },
};

interface Mine { id: string; company_name: string; company_slug: string; role: string; status: string; submitted_at: string }
interface Followed { company_id: string; name: string; slug: string; park: string; review_count: number; latest_report_on: string | null; new_count: number }
interface Plan { id: string; role: string | null; interview_date: string | null; companies: { name: string; slug: string } | null }
interface SavedRow { created_at: string; submissions: (Experience & { companies: { name: string; slug: string } | null }) | null }

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="text-lg font-semibold">{children}</h2>;
}

export default async function DashboardPage() {
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login?next=/dashboard");
  const supabase = await createClient();

  const [mineRes, followedRes, newRes, plansRes, itemsRes, savedRes] = await Promise.all([
    supabase.rpc("my_submissions"),
    supabase.rpc("my_followed_companies"),
    supabase.rpc("my_new_experiences", { p_limit: 5 }),
    supabase.from("prep_plans").select("id, role, interview_date, companies(name, slug)").order("created_at", { ascending: false }),
    supabase.from("prep_items").select("plan_id, done"),
    supabase
      .from("saved_experiences")
      .select(`created_at, submissions(${EXPERIENCE_COLUMNS}, companies(name, slug))`)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const mine = (mineRes.data ?? []) as Mine[];
  const followed = (followedRes.data ?? []) as Followed[];
  const fresh = (newRes.data ?? []) as ExperienceWithCompany[];
  const plans = (plansRes.data ?? []) as unknown as Plan[];
  const items = (itemsRes.data ?? []) as { plan_id: string; done: boolean }[];
  const saved = ((savedRes.data ?? []) as unknown as SavedRow[]).filter((s) => s.submissions);
  const savedSet = await savedIds(supabase, [...saved.map((s) => s.submissions!.id), ...fresh.map((f) => f.id)], true);
  const anyError = mineRes.error || followedRes.error || plansRes.error || savedRes.error;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">My space</h1>
        <p className="mt-1 text-sm text-stone-600">Private to you. Nothing here is shown publicly.</p>
      </div>
      <ReminderBanner />
      {anyError && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          Some of this page couldn&apos;t load. Please refresh in a moment.
        </p>
      )}

      {fresh.length > 0 && (
        <section aria-labelledby="new">
          <H id="new">New for you</H>
          <p className="mt-1 text-sm text-stone-600">Newly approved reports from companies you follow or are preparing for.</p>
          <div className="mt-3 space-y-4">
            {fresh.map((f) => (
              <ExperienceCard key={f.id} e={f} company={{ name: f.company_name, slug: f.company_slug }} save={{ signedIn: true, saved: savedSet.has(f.id), next: "/dashboard" }} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="following">
        <H id="following">Followed companies</H>
        {followed.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">
            You aren&apos;t following any companies. Open a <Link href="/companies" className="text-brand-700 underline">company</Link> and tap Follow to hear about new reports.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {followed.map((c) => (
              <li key={c.company_id}>
                <Link href={`/company/${c.slug}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-stone-50">
                  <span>
                    <span className="font-medium">{c.name}</span>
                    <span className="block text-sm text-stone-600">
                      {c.review_count} {c.review_count === 1 ? "report" : "reports"}
                      {c.latest_report_on && ` · latest interview ${monthYear(c.latest_report_on)}`}
                    </span>
                  </span>
                  {Number(c.new_count) > 0 && (
                    <span className="rounded-full bg-brand-700 px-2.5 py-1 text-xs font-medium text-white">{c.new_count} new</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="prep">
        <H id="prep">Preparation checklists</H>
        {plans.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">
            Have an interview coming up? Open a company and choose &ldquo;Preparing? Start a checklist&rdquo;.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {plans.map((p) => {
              const mineItems = items.filter((i) => i.plan_id === p.id);
              const done = mineItems.filter((i) => i.done).length;
              return (
                <li key={p.id}>
                  <Link href={`/prep/${p.companies?.slug}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-stone-50">
                    <span>
                      <span className="font-medium">{p.companies?.name}</span>
                      <span className="block text-sm text-stone-600">
                        {p.role ? `${p.role} · ` : ""}
                        {p.interview_date ? `Interview ${fullDate(p.interview_date)}` : "No interview date"}
                      </span>
                    </span>
                    <span className="text-sm text-stone-600">{mineItems.length > 0 ? `${done}/${mineItems.length} done` : "Empty"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="saved">
        <H id="saved">Saved experiences</H>
        {saved.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">
            Tap Save on any report to keep it here. <Link href="/experiences" className="text-brand-700 underline">Browse experiences</Link>.
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            {saved.map((s) => (
              <ExperienceCard
                key={s.submissions!.id}
                e={s.submissions!}
                company={s.submissions!.companies ?? undefined}
                save={{ signedIn: true, saved: savedSet.has(s.submissions!.id), next: "/dashboard" }}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="mine">
        <H id="mine">My contributions</H>
        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">
            You haven&apos;t shared anything yet. <Link href="/submit" className="text-brand-700 underline">Share your experience</Link>. It takes about 2 minutes.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {mine.map((r) => {
              const s = STATUS[r.status] ?? STATUS.pending;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div>
                    <p className="font-medium">{r.company_name}</p>
                    <p className="text-sm text-stone-600">{r.role} · {fullDate(r.submitted_at)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>{s.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
