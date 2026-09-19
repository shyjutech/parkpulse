import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";

export const metadata = { title: "You're in" };

export default async function DonePage() {
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login");
  if (!viewer.hasContributed) redirect("/submit");
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <h1 className="text-2xl font-semibold">🎉 You&apos;ve unlocked ParkPulse.</h1>
      <p className="mt-3 text-stone-600">
        Your contribution is being reviewed. It will become visible to other contributors once approved.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/companies" className="rounded-md bg-brand-700 px-5 py-3 font-medium text-white hover:bg-brand-800">
          Browse company data
        </Link>
        <Link href="/dashboard" className="rounded-md border border-stone-300 bg-white px-5 py-3 hover:border-brand-600">
          My contributions
        </Link>
      </div>
    </div>
  );
}
