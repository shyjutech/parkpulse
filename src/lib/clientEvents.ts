import type { EventName } from "./constants";

/** Fire-and-forget POST to the events endpoint. Failures are ignored: analytics must never break a user flow. */
export function postEvent(name: EventName, companyId?: string) {
  fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, companyId }),
    keepalive: true,
  }).catch(() => {});
}

function dailyStorageKey(name: EventName): string {
  return `pp_last_${name}`;
}

/** True when `stored` (the last-logged date for this key, or null) means today hasn't been logged yet. Pure, so it's unit-testable without a DOM. */
export function isUnloggedToday(stored: string | null, today: string): boolean {
  return stored !== today;
}

/** Logs `name` at most once per calendar day per browser (same dedup `visit` has always used), so reloads and repeat visits don't inflate it. */
export function logOncePerDay(name: EventName, companyId?: string) {
  try {
    const key = dailyStorageKey(name);
    const today = new Date().toISOString().slice(0, 10);
    if (!isUnloggedToday(localStorage.getItem(key), today)) return;
    localStorage.setItem(key, today);
  } catch {
    return; // Storage unavailable (private mode): skip rather than log every reload.
  }
  postEvent(name, companyId);
}

const PENDING_SIGNIN_KEY = "pp_pending_signin";

/** Marks that the user was just sent to Google from the submit flow, so the return trip can be recognised. */
export function markPendingSignin() {
  try {
    sessionStorage.setItem(PENDING_SIGNIN_KEY, "1");
  } catch {
    // ignore
  }
}

/** Consumes (clears) the pending-signin marker and reports whether it was set. One-shot: a second call returns false. */
export function consumePendingSignin(): boolean {
  try {
    const was = sessionStorage.getItem(PENDING_SIGNIN_KEY) === "1";
    if (was) sessionStorage.removeItem(PENDING_SIGNIN_KEY);
    return was;
  } catch {
    return false;
  }
}
