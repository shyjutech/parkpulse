import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Thank you" };

export default async function DonePage() {
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/submit");

  // Only promise a credit if they're not already at the lifetime cap (3) --
  // still true for almost everyone, but stays honest at the edge.
  const supabase = await createClient();
  const { count } = await supabase.from("interview_credits").select("id", { count: "exact", head: true });
  const mayEarnMore = (count ?? 0) < 3;

  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <h1 className="text-2xl font-semibold">Thank you for sharing 🎉</h1>
      <p className="mt-3 text-stone-600">
        Your experience is waiting for review. Moderators check for policy issues and personal details before it appears. It will be visible to everyone once approved.
        {mayEarnMore && " You'll get 1 free AI mock interview once it's approved."}
      </p>
      <p className="mt-2 text-sm text-stone-500">You can track its status, and your AI interview credits, under My space.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/experiences" className="inline-flex min-h-12 items-center rounded-md bg-brand-700 px-5 font-medium text-white hover:bg-brand-800">
          Browse experiences
        </Link>
        <Link href="/dashboard" className="inline-flex min-h-12 items-center rounded-md border border-stone-300 bg-white px-5 hover:border-brand-600">
          My space
        </Link>
      </div>
    </div>
  );
}
