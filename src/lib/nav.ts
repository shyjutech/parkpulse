/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNext(next: string | null | undefined, fallback = "/") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : fallback;
}

export function qs(params: Record<string, string | number | undefined | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v) !== "") u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** "Mar 2026" from a date or ISO string. */
export function monthYear(d: string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function fullDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** First day of the month N months ago, as YYYY-MM-DD. */
export function sinceMonthsAgo(months: number, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return d.toISOString().slice(0, 10);
}
