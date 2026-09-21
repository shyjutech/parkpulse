"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

// A soft, dismissible prompt. It never hides content: readers keep full access.
const COUNT_KEY = "pp_report_views";
const SNOOZE_KEY = "pp_nudge_until";
const EVENT = "pp-nudge-change";
const THRESHOLD = 3;
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const isReportPage = (p: string) => p === "/experiences" || p.startsWith("/company/");
const isQuietPage = (p: string) =>
  ["/submit", "/login", "/admin", "/privacy", "/launch", "/auth"].some((q) => p === q || p.startsWith(`${q}/`));

/** "<report pages viewed>|<1 if snoozed>", read from storage (time is checked here, not during render). */
function snapshot() {
  try {
    const snoozed = Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return `${Number(localStorage.getItem(COUNT_KEY) || 0)}|${snoozed ? 1 : 0}`;
  } catch {
    return "0|0";
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export default function ContributeNudge() {
  const pathname = usePathname();
  const state = useSyncExternalStore(subscribe, snapshot, () => "0|0");

  // Count each report page the visitor opens.
  useEffect(() => {
    if (!isReportPage(pathname)) return;
    try {
      const n = Number(localStorage.getItem(COUNT_KEY) || 0);
      localStorage.setItem(COUNT_KEY, String(Math.min(n + 1, 99)));
      window.dispatchEvent(new Event(EVENT));
    } catch {
      // Storage unavailable: no nudge, no problem.
    }
  }, [pathname]);

  const [count, snoozed] = state.split("|").map(Number);
  if (count < THRESHOLD || snoozed === 1 || isQuietPage(pathname)) return null;

  function snooze() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <aside
      role="region"
      aria-label="Share your experience"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-1 sm:px-3">
        <p className="text-sm text-stone-800">
          <strong>Found this useful?</strong> Help the next candidate: share yours anonymously in about 2 minutes.
        </p>
        <div className="flex gap-2">
          <Link href="/submit" className="inline-flex min-h-11 items-center rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
            Share experience
          </Link>
          <button onClick={snooze} className="min-h-11 rounded-md border border-stone-300 px-3 text-sm text-stone-700 hover:border-stone-500">
            Not now
          </button>
        </div>
      </div>
    </aside>
  );
}
