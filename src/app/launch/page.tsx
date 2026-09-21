import Link from "next/link";
import TrackEvent from "@/components/TrackEvent";
import { INSTAGRAM_HANDLE, LAUNCH_GOAL, MODERATION_NOTE, PRIVACY_SUMMARY } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Help build our first 50 interview experiences",
  description: "Share one anonymous interview experience from a Kerala IT company and help the next candidate.",
};

// Real numbers, read on each visit. Nothing here is estimated or padded.
export const dynamic = "force-dynamic";

export default async function LaunchPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_stats");
  const stats = data as { approved_reports: number; companies_with_reports: number } | null;
  const approved = stats?.approved_reports ?? null;
  const companies = stats?.companies_with_reports ?? null;
  const pct = approved === null ? 0 : Math.min(100, Math.round((approved / LAUNCH_GOAL) * 100));

  return (
    <div className="mx-auto max-w-md pb-10">
      <TrackEvent name="campaign_view" />
      <p className="text-sm text-stone-600">
        From{" "}
        <a href={`https://instagram.com/${INSTAGRAM_HANDLE}`} className="font-medium text-brand-700 underline" rel="noopener noreferrer">
          @{INSTAGRAM_HANDLE}
        </a>
      </p>
      <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">
        Help build our first {LAUNCH_GOAL} interview experiences
      </h1>
      <p className="mt-3 text-stone-700">
        Interviewed at a Kerala IT company? Share what it was like, anonymously. It takes about 2 minutes, and it helps the next candidate walk in prepared.
      </p>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4" aria-live="polite">
        {approved === null ? (
          <p className="text-sm text-stone-600">Progress is unavailable right now.</p>
        ) : (
          <>
            <p className="text-sm text-stone-600">Approved so far</p>
            <p className="mt-1 text-3xl font-semibold">
              {approved} <span className="text-lg font-normal text-stone-500">of {LAUNCH_GOAL}</span>
            </p>
            <div
              className="mt-3 h-3 overflow-hidden rounded-full bg-stone-100"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={LAUNCH_GOAL}
              aria-valuenow={Math.min(approved, LAUNCH_GOAL)}
              aria-label="Approved experiences toward the goal"
            >
              <div className="h-3 rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-stone-500">
              {approved === 0
                ? "Nothing approved yet. Yours could be the first."
                : `${approved === 1 ? "1 report" : `${approved} reports`} from ${companies} ${companies === 1 ? "company" : "companies"}. Counts include only reports a moderator has approved.`}
            </p>
          </>
        )}
      </div>

      <Link
        href="/submit"
        className="mt-6 flex min-h-14 items-center justify-center rounded-xl bg-brand-700 px-5 text-lg font-medium text-white hover:bg-brand-800"
      >
        Share your experience
      </Link>
      <Link
        href="/experiences"
        className="mt-3 flex min-h-12 items-center justify-center rounded-xl border border-stone-300 bg-white px-5 font-medium hover:border-brand-600"
      >
        See what&apos;s been shared
      </Link>

      <section className="mt-8" aria-labelledby="ask">
        <h2 id="ask" className="text-lg font-semibold">What we ask for</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
          <li>The company, your role, your experience level and the interview month.</li>
          <li>One question, topic or a short description of what happened.</li>
          <li>Everything else, including salary range and outcome, is optional.</li>
        </ul>
      </section>

      <section className="mt-8 rounded-xl border border-stone-200 bg-white p-4" aria-labelledby="privacy">
        <h2 id="privacy" className="text-lg font-semibold">Your privacy</h2>
        <p className="mt-2 text-sm text-stone-700">{PRIVACY_SUMMARY}</p>
        <p className="mt-2 text-sm text-stone-700">
          Please leave out names, contact details, manager or client names and confidential information.
        </p>
        <p className="mt-2 text-sm text-stone-700">{MODERATION_NOTE}</p>
        <p className="mt-3 text-sm">
          <Link href="/privacy" className="text-brand-700 underline">Read the full privacy details</Link>
        </p>
      </section>
    </div>
  );
}
