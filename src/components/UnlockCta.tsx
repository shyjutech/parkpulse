import Link from "next/link";

export default function UnlockCta({ signedIn, next }: { signedIn: boolean; next: string }) {
  return (
    <section className="rounded-lg border border-brand-600/30 bg-brand-50 p-5">
      <h2 className="text-lg font-semibold text-brand-800">Unlock the full data</h2>
      <p className="mt-1 text-sm text-stone-700">
        Share one interview experience to see salary ranges, difficulty, outcomes and every approved experience.
        You unlock access as soon as you submit. No need to wait for approval.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={signedIn ? "/submit" : `/login?next=${encodeURIComponent("/submit")}`}
          className="rounded-md bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800"
        >
          Share your experience
        </Link>
        {!signedIn && (
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm hover:border-brand-600"
          >
            Already contributed? Sign in
          </Link>
        )}
      </div>
    </section>
  );
}
