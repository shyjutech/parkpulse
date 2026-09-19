"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-stone-600">We hit a problem loading this page. Please try again.</p>
      <button onClick={reset} className="mt-4 rounded-md bg-brand-700 px-4 py-2 text-white hover:bg-brand-800">Try again</button>
    </div>
  );
}
