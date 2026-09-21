import Link from "next/link";
import { monthYear } from "@/lib/nav";
import type { Company } from "@/lib/types";
import Stars from "./Stars";

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">Verified company</span>
  ) : (
    <span
      className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600"
      title="We haven't confirmed this company's details yet."
    >
      Company not yet verified
    </span>
  );
}

export default function CompanyCard({ company }: { company: Company }) {
  const n = company.review_count;
  const rating = Number(company.avg_rating);
  return (
    <Link
      href={`/company/${company.slug}`}
      className="block rounded-lg border border-stone-200 bg-white p-4 hover:border-brand-600"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{company.name}</h3>
        <VerifiedBadge verified={company.verified} />
      </div>
      <p className="mt-1 text-sm text-stone-600">{company.park}</p>
      <p className="mt-3 text-sm text-stone-700">
        {n > 0 ? (
          <>
            <strong>{n}</strong> {n === 1 ? "report" : "reports"}
            {company.latest_report_on && <span className="text-stone-500"> · latest interview {monthYear(company.latest_report_on)}</span>}
          </>
        ) : (
          <span className="text-stone-500">No reports yet</span>
        )}
      </p>
      {n >= 3 && rating > 0 && (
        <p className="mt-1 flex items-center gap-2 text-sm text-stone-600">
          <Stars value={rating} /> {rating.toFixed(1)} interview experience
        </p>
      )}
    </Link>
  );
}
