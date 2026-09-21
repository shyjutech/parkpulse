import Link from "next/link";
import { requestExperiences, toggleFollow } from "@/app/actions";

const secondary =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-stone-300 bg-white px-4 text-sm font-medium hover:border-brand-600";

export function FollowButton({
  companyId,
  following,
  signedIn,
  next,
}: {
  companyId: string;
  following: boolean;
  signedIn: boolean;
  next: string;
}) {
  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(next)}`} className={secondary}>
        Sign in to follow
      </Link>
    );
  }
  return (
    <form action={toggleFollow}>
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="following" value={following ? "1" : "0"} />
      <input type="hidden" name="next" value={next} />
      <button
        aria-pressed={following}
        className={`${secondary} ${following ? "border-brand-700 bg-brand-50 text-brand-800" : ""}`}
      >
        {following ? "✓ Following" : "+ Follow"}
      </button>
    </form>
  );
}

export function RequestButton({ companyId, requested, next }: { companyId: string; requested: boolean; next: string }) {
  if (requested) {
    return <p className="text-sm text-brand-800">✓ Requested. Thanks, this helps us decide whom to ask for reports.</p>;
  }
  return (
    <form action={requestExperiences}>
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="next" value={next} />
      <button className={secondary}>Request experiences for this company</button>
    </form>
  );
}
