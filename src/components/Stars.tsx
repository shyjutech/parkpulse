export default function Stars({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <span aria-label={`${value.toFixed(1)} out of 5`} className="whitespace-nowrap text-amber-500">
      {"★".repeat(rounded)}
      <span className="text-stone-300">{"★".repeat(5 - rounded)}</span>
    </span>
  );
}
