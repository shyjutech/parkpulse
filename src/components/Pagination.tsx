import Link from "next/link";

export default function Pagination({
  page,
  hasNext,
  hrefFor,
}: {
  page: number;
  hasNext: boolean;
  hrefFor: (page: number) => string;
}) {
  if (page <= 1 && !hasNext) return null;
  const btn = "rounded-md border border-stone-300 bg-white px-4 py-2 text-sm hover:border-brand-600";
  return (
    <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
      {page > 1 ? <Link href={hrefFor(page - 1)} className={btn}>← Previous</Link> : <span />}
      <span className="text-sm text-stone-500">Page {page}</span>
      {hasNext ? <Link href={hrefFor(page + 1)} className={btn}>Next →</Link> : <span />}
    </nav>
  );
}
