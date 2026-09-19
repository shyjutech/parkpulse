export default function BarList({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((i) => (
          <li key={i.label} className="text-sm">
            <div className="flex justify-between">
              <span>{i.label}</span>
              <span className="text-stone-600">{i.count}</span>
            </div>
            <div className="mt-1 h-2 rounded bg-stone-100" aria-hidden>
              <div className="h-2 rounded bg-brand-600" style={{ width: `${(i.count / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
