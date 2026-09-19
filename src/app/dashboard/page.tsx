import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My contributions" };

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-900" },
  approved: { label: "Approved", cls: "bg-brand-100 text-brand-800" },
  rejected: { label: "Rejected", cls: "bg-stone-200 text-stone-700" },
};

interface Row {
  id: string;
  company_name: string;
  company_slug: string;
  role: string;
  status: string;
  submitted_at: string;
}

export default async function DashboardPage() {
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login?next=/dashboard");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_submissions");
  const rows = (data ?? []) as Row[];

  return (
    <div>
      <h1 className="text-2xl font-semibold">My contributions</h1>
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          We couldn&apos;t load your contributions. Please try again shortly.
        </p>
      )}
      {!error && rows.length === 0 && (
        <p className="mt-4 text-stone-600">
          You haven&apos;t shared anything yet.{" "}
          <Link href="/submit" className="font-medium text-brand-700 underline">Share your experience</Link> to unlock the full database.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {rows.map((r) => {
            const s = STATUS[r.status] ?? STATUS.pending;
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-medium">{r.company_name}</p>
                  <p className="text-sm text-stone-600">
                    {r.role} · {new Date(r.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>{s.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
