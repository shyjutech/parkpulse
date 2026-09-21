import Link from "next/link";

/** A gentle card between reports for people who haven't contributed. Never blocks anything. */
export default function InlineNudge() {
  return (
    <div className="rounded-lg border border-brand-600/30 bg-brand-50 p-4">
      <p className="text-sm font-medium text-brand-800">Interviewed somewhere recently?</p>
      <p className="mt-1 text-sm text-stone-700">
        Reports like these come from people like you. One question or topic is enough, and it&apos;s anonymous.
      </p>
      <Link href="/submit" className="mt-3 inline-flex min-h-11 items-center rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
        Share your experience
      </Link>
    </div>
  );
}
