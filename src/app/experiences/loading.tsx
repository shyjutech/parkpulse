export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="h-8 w-1/3 animate-pulse rounded bg-stone-200" />
      <div className="h-11 w-full animate-pulse rounded bg-stone-200" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-lg bg-stone-200" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
