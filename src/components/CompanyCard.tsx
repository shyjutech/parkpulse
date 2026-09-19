import Link from "next/link";
import type { Company } from "@/lib/types";
import Stars from "./Stars";

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">Verified</span>
  ) : (
    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">Not yet verified</span>
  );
}

export default function CompanyCard({ company }: { company: Company }) {
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
      <p className="mt-3 flex items-center gap-2 text-sm text-stone-700">
        {company.review_count > 0 ? (
          <>
            <Stars value={Number(company.avg_rating)} />
            <span>
              {Number(company.avg_rating).toFixed(1)} interview experience · {company.review_count}{" "}
              {company.review_count === 1 ? "experience" : "experiences"}
            </span>
          </>
        ) : (
          <span className="text-stone-500">No approved experiences yet</span>
        )}
      </p>
    </Link>
  );
}
