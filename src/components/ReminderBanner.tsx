import Link from "next/link";
import { dismissReminder } from "@/app/actions";
import { fullDate } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

interface Reminder {
  plan_id: string;
  company_name: string;
  company_slug: string;
  interview_date: string;
}

/** Post-interview nudge. Dismissible; disappears once the user shares a report for that company. */
export default async function ReminderBanner() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_reminders");
  const reminders = (data ?? []) as Reminder[];
  if (reminders.length === 0) return null;
  return (
    <div className="mb-6 space-y-3">
      {reminders.map((r) => (
        <div key={r.plan_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Your interview at <strong>{r.company_name}</strong> was on {fullDate(r.interview_date)}. How did it go? Sharing it takes about 2 minutes and helps the next candidate.
          </p>
          <div className="flex gap-2">
            <Link href={`/submit?company=${encodeURIComponent(r.company_slug)}`} className="inline-flex min-h-11 items-center rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
              Share experience
            </Link>
            <form action={dismissReminder}>
              <input type="hidden" name="plan_id" value={r.plan_id} />
              <button className="min-h-11 rounded-md border border-amber-300 px-3 text-sm text-amber-900 hover:bg-amber-100" aria-label={`Dismiss reminder for ${r.company_name}`}>
                Dismiss
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
