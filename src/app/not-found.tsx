import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-stone-600">That page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="mt-4 inline-block text-brand-700 underline">Go home</Link>
    </div>
  );
}
