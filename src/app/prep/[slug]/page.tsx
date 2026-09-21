import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addPrepItem, addStarterItems, deletePrepItem, deletePrepPlan, savePrepPlan, togglePrepItem } from "@/app/actions";
import { fullDate } from "@/lib/nav";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Preparation checklist" };

interface Item { id: string; text: string; done: boolean }

const field = "min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm";

export default async function PrepPage({ params }: PageProps<"/prep/[slug]">) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer.userId) redirect(`/login?next=${encodeURIComponent(`/prep/${slug}`)}`);

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, slug, review_count")
    .eq("slug", slug)
    .maybeSingle();
  if (!company) notFound();

  // RLS limits both queries to the signed-in user's own rows.
  const { data: plan } = await supabase
    .from("prep_plans")
    .select("id, role, interview_date")
    .eq("company_id", company.id)
    .maybeSingle();
  const { data: itemRows } = plan
    ? await supabase.from("prep_items").select("id, text, done").eq("plan_id", plan.id).order("position").order("created_at")
    : { data: [] };
  const items = (itemRows ?? []) as Item[];
  const done = items.filter((i) => i.done).length;
  const next = `/prep/${company.slug}`;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/company/${company.slug}`} className="text-sm text-brand-700 hover:underline">← {company.name}</Link>
      <h1 className="mt-2 text-2xl font-semibold">Preparing for {company.name}</h1>
      <p className="mt-1 text-sm text-stone-600">A private checklist. Only you can see it.</p>

      <form action={savePrepPlan} className="mt-5 space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <input type="hidden" name="company_id" value={company.id} />
        <input type="hidden" name="slug" value={company.slug} />
        <label className="block text-sm font-medium">Role <span className="font-normal text-stone-500">(optional)</span>
          <input name="role" defaultValue={plan?.role ?? ""} maxLength={100} placeholder="e.g. Flutter Developer" className={`${field} mt-1`} />
        </label>
        <label className="block text-sm font-medium">Interview date <span className="font-normal text-stone-500">(optional)</span>
          <input type="date" name="interview_date" defaultValue={plan?.interview_date ?? ""} className={`${field} mt-1`} />
        </label>
        <p className="text-xs text-stone-500">
          If you add a date, we&apos;ll remind you to share how it went once it has passed. You can dismiss the reminder.
        </p>
        <button className="min-h-11 rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
          {plan ? "Save" : "Start checklist"}
        </button>
        {plan?.interview_date && <p className="text-xs text-stone-500">Interview on {fullDate(plan.interview_date)}</p>}
      </form>

      {plan && (
        <section className="mt-6" aria-labelledby="list">
          <h2 id="list" className="text-lg font-semibold">
            Checklist {items.length > 0 && <span className="text-sm font-normal text-stone-500">({done}/{items.length} done)</span>}
          </h2>

          {items.length === 0 && (
            <form action={addStarterItems} className="mt-3 rounded-lg border border-dashed border-stone-300 bg-white p-4">
              <input type="hidden" name="plan_id" value={plan.id} />
              <input type="hidden" name="next" value={next} />
              <p className="text-sm text-stone-600">Nothing here yet. Start with a few general prompts, or add your own below.</p>
              <button className="mt-3 min-h-11 rounded-md border border-stone-300 px-4 text-sm hover:border-brand-600">Add starter items</button>
            </form>
          )}

          <ul className="mt-3 divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 p-2 pl-3">
                <form action={togglePrepItem} className="flex-1">
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="done" value={i.done ? "1" : "0"} />
                  <input type="hidden" name="next" value={next} />
                  <button className="flex min-h-11 w-full items-center gap-3 text-left text-sm" aria-pressed={i.done}>
                    <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${i.done ? "border-brand-700 bg-brand-700 text-white" : "border-stone-400"}`}>
                      {i.done ? "✓" : ""}
                    </span>
                    <span className={i.done ? "text-stone-400 line-through" : ""}>{i.text}</span>
                  </button>
                </form>
                <form action={deletePrepItem}>
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="next" value={next} />
                  <button className="min-h-11 px-3 text-xs text-stone-500 hover:text-red-700" aria-label={`Remove ${i.text}`}>Remove</button>
                </form>
              </li>
            ))}
          </ul>

          <form action={addPrepItem} className="mt-3 flex gap-2">
            <input type="hidden" name="plan_id" value={plan.id} />
            <input type="hidden" name="next" value={next} />
            <label htmlFor="new-item" className="sr-only">New checklist item</label>
            <input id="new-item" name="text" maxLength={200} placeholder="Add an item, e.g. Revise Dart isolates" className={`${field} flex-1`} required />
            <button className="min-h-11 rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">Add</button>
          </form>

          <p className="mt-6 text-sm text-stone-600">
            {company.review_count > 0 ? (
              <>Read what {company.review_count} other {company.review_count === 1 ? "candidate" : "candidates"} reported: <Link className="text-brand-700 underline" href={`/company/${company.slug}?view=questions`}>questions &amp; topics</Link> · <Link className="text-brand-700 underline" href={`/company/${company.slug}?view=rounds`}>rounds</Link>.</>
            ) : (
              <>No reports for this company yet. <Link className="text-brand-700 underline" href={`/company/${company.slug}`}>Request some</Link>.</>
            )}
          </p>

          <form action={deletePrepPlan} className="mt-8">
            <input type="hidden" name="plan_id" value={plan.id} />
            <button className="text-xs text-stone-500 underline hover:text-red-700">Delete this checklist</button>
          </form>
        </section>
      )}
    </div>
  );
}
