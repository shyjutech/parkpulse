import SubmitForm from "@/components/SubmitForm";
import TrackEvent from "@/components/TrackEvent";
import { MODERATION_NOTE, PRIVACY_SUMMARY } from "@/lib/constants";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Share your experience" };

export default async function SubmitPage({ searchParams }: PageProps<"/submit">) {
  const sp = await searchParams;
  const viewer = await getViewer();

  let initialCompany: { id: string; name: string } | null = null;
  if (typeof sp.company === "string") {
    const supabase = await createClient();
    const { data } = await supabase.from("companies").select("id, name").eq("slug", sp.company.slice(0, 120)).maybeSingle();
    initialCompany = data ?? null;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <TrackEvent name="submit_started" />
      <h1 className="text-2xl font-semibold">Share your interview experience</h1>
      <p className="mt-2 text-stone-600">
        Takes about 2 minutes. You don&apos;t need to sign in until the last step, and you can add as little or as much as you like.
      </p>
      <details className="mt-3 rounded-md border border-stone-200 bg-white p-3 text-sm text-stone-600">
        <summary className="cursor-pointer font-medium text-stone-800">How your data is used</summary>
        <p className="mt-2">{PRIVACY_SUMMARY}</p>
        <p className="mt-2">{MODERATION_NOTE}</p>
      </details>
      <div className="mt-6">
        <SubmitForm signedIn={!!viewer.userId} initialCompany={initialCompany} />
      </div>
    </div>
  );
}
