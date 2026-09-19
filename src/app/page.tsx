import Link from "next/link";
import LoginButton from "@/components/LoginButton";
import TrackEvent from "@/components/TrackEvent";
import { getViewer } from "@/lib/session";

const steps = [
  ["1", "Browse companies", "See which Kerala IT companies are listed, with their park and interview experience rating."],
  ["2", "Share your experience", "Tell us about one interview: the rounds, the questions, the salary range and the outcome."],
  ["3", "Unlock the full database", "The moment you submit, you can read every approved anonymous experience."],
];

export default async function Home() {
  let signedIn = false;
  let contributed = false;
  try {
    const v = await getViewer();
    signedIn = !!v.userId;
    contributed = v.hasContributed;
  } catch {
    // Treat as signed out.
  }

  return (
    <div>
      <TrackEvent name="landing_view" />
      <section className="py-6 text-center sm:py-12">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-brand-700 sm:text-6xl">
          Know what to expect before your next interview.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-stone-600">
          Anonymous salary ranges, interview questions and candidate experiences from Kerala&apos;s IT companies.
        </p>

        <div className="mx-auto mt-8 max-w-sm space-y-3 text-left">
          {signedIn ? (
            <>
              <Link
                href={contributed ? "/companies" : "/submit"}
                className="flex min-h-12 items-center justify-center rounded-lg bg-brand-700 px-5 font-medium text-white hover:bg-brand-800"
              >
                {contributed ? "Explore companies" : "Share your experience to unlock"}
              </Link>
              {contributed ? (
                <Link href="/submit" className="flex min-h-12 items-center justify-center rounded-lg border border-stone-900 px-5 font-medium hover:bg-stone-100">
                  Share another experience
                </Link>
              ) : (
                <Link href="/companies" className="flex min-h-12 items-center justify-center rounded-lg border border-stone-900 px-5 font-medium hover:bg-stone-100">
                  Explore companies
                </Link>
              )}
            </>
          ) : (
            <>
              <h2 className="text-center text-lg font-semibold">One tap to get started</h2>
              <LoginButton next="/submit" />
              <Link href="/companies" className="flex min-h-12 items-center justify-center rounded-lg border border-stone-900 px-5 font-medium hover:bg-stone-100">
                Explore companies
              </Link>
              <p className="pt-1 text-center text-xs text-stone-500">
                Google sign-in only keeps spam out. Your name and email are never shown.
              </p>
            </>
          )}
        </div>
        <p className="mt-6 text-sm text-stone-500">Infopark · Technopark · Cyberpark · other Kerala IT companies</p>
      </section>

      <section aria-labelledby="how" className="border-t border-stone-200 py-10 text-center">
        <h2 id="how" className="text-2xl font-semibold">Get ahead with ParkPulse</h2>
        <p className="mx-auto mt-2 max-w-xl text-stone-600">
          Trusted insights from real candidates, so you have what you need to succeed.
        </p>
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

      <section aria-labelledby="trust" className="border-t border-stone-200 py-10">
        <h2 id="trust" className="text-center text-2xl font-semibold">Anonymous by design</h2>
        <ul className="mx-auto mt-4 max-w-2xl list-disc space-y-2 pl-5 text-stone-700">
          <li>You sign in with Google only to prevent abuse. Your name, email and photo are never shown to anyone.</li>
          <li>Every experience is reviewed by a moderator before it is visible to others.</li>
          <li>Salaries are shown as ranges and counts, never exact figures.</li>
          <li>We ask you not to include names, contact details or confidential company information, and we check for the obvious ones.</li>
        </ul>
      </section>
    </div>
  );
}
