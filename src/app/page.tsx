import Link from "next/link";
import ExperienceCard from "@/components/ExperienceCard";
import LoginButton from "@/components/LoginButton";
import ReminderBanner from "@/components/ReminderBanner";
import TrackEvent from "@/components/TrackEvent";
import { PARKS } from "@/lib/constants";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ExperienceWithCompany } from "@/lib/types";

const steps = [
  ["1", "Browse freely", "Read approved experiences and filter by company, location, role and level. No sign-in needed."],
  ["2", "Share what you know", "One question or topic is enough. Salary, outcome and rounds are optional."],
  ["3", "Come back prepared", "Follow companies, save reports and keep a private checklist for your interview."],
];

export default async function Home() {
  let signedIn = false;
  let latest: ExperienceWithCompany[] = [];
  try {
    signedIn = !!(await getViewer()).userId;
    const supabase = await createClient();
    const { data } = await supabase.rpc("browse_experiences", { p_limit: 3 });
    latest = (data ?? []) as ExperienceWithCompany[];
  } catch {
    // Render the static parts if the backend is unavailable.
  }

  return (
    <div>
      <TrackEvent name="landing_view" />
      {signedIn && <ReminderBanner />}
      <section className="py-4 text-center sm:py-10">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-brand-700 sm:text-6xl">
          Know what to expect before your next interview.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-stone-600">
          Anonymous interview questions, salary ranges and candidate experiences from Kerala&apos;s IT companies.
        </p>

        <form action="/experiences" role="search" className="mx-auto mt-6 flex max-w-xl gap-2">
          <label htmlFor="home-q" className="sr-only">Search companies, roles or questions</label>
          <input id="home-q" name="q" placeholder="Search a company, role or question" className="min-h-12 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-4" />
          <button className="min-h-12 rounded-lg bg-brand-700 px-5 font-medium text-white hover:bg-brand-800">Search</button>
        </form>
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm">
          {PARKS.filter((p) => p !== "Other").map((p) => (
            <Link key={p} href={`/experiences?park=${p}`} className="rounded-full border border-stone-300 bg-white px-3 py-2 hover:border-brand-600">
              {p}
            </Link>
          ))}
          <Link href="/companies" className="rounded-full border border-stone-300 bg-white px-3 py-2 hover:border-brand-600">All companies</Link>
        </div>

        <div className="mx-auto mt-8 max-w-sm space-y-3 text-left">
          <Link href="/submit" className="flex min-h-12 items-center justify-center rounded-lg bg-brand-700 px-5 font-medium text-white hover:bg-brand-800">
            Share your experience
          </Link>
          {!signedIn && (
            <>
              <p className="pt-2 text-center text-sm text-stone-600">Sign in to save reports, follow companies and keep a checklist.</p>
              <LoginButton next="/dashboard" />
            </>
          )}
        </div>
      </section>

      {latest.length > 0 && (
        <section aria-labelledby="latest" className="border-t border-stone-200 py-8">
          <div className="flex items-baseline justify-between">
            <h2 id="latest" className="text-xl font-semibold">Latest approved reports</h2>
            <Link href="/experiences" className="text-sm text-brand-700 underline">See all</Link>
          </div>
          <div className="mt-4 space-y-4">
            {latest.map((e) => (
              <ExperienceCard key={e.id} e={e} company={{ name: e.company_name, slug: e.company_slug }} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="how" className="border-t border-stone-200 py-8 text-center">
        <h2 id="how" className="text-2xl font-semibold">How ParkPulse works</h2>
        <ol className="mt-6 grid gap-4 text-left sm:grid-cols-3">
          {steps.map(([n, title, body]) => (
            <li key={n} className="rounded-xl border border-stone-200 bg-white p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">{n}</span>
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-stone-600">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="trust" className="border-t border-stone-200 py-8">
        <h2 id="trust" className="text-center text-2xl font-semibold">Anonymous by design</h2>
        <ul className="mx-auto mt-4 max-w-2xl list-disc space-y-2 pl-5 text-stone-700">
          <li>Google sign-in details are collected only to prevent abuse and power your private features. They are never displayed publicly.</li>
          <li>Moderators review every report before it appears. Reviewed does not mean verified, so treat reports as individual experiences.</li>
          <li>Salaries are shown as ranges and counts, never exact figures.</li>
          <li>Please leave out names, contact details and confidential information. We check for the obvious ones.</li>
        </ul>
        <p className="mt-4 text-center text-sm"><Link href="/privacy" className="text-brand-700 underline">Privacy details</Link></p>
      </section>
    </div>
  );
}
