import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { EVENT_NAMES, type EventName } from "./constants";
import { createClient } from "./supabase/server";

export function isEventName(v: unknown): v is EventName {
  return typeof v === "string" && (EVENT_NAMES as readonly string[]).includes(v);
}

const ANON_COOKIE = "pp_aid";

/** Best-effort event log. Analytics must never break a user flow. */
export async function logEvent(name: EventName, companyId?: string | null) {
  try {
    const supabase = await createClient();
    const cookieStore = await cookies();
    let anonId = cookieStore.get(ANON_COOKIE)?.value;
    if (!anonId) {
      anonId = randomUUID();
      try {
        cookieStore.set(ANON_COOKIE, anonId, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
      } catch {
        // Not settable outside route handlers/actions; the event is still logged.
      }
    }
    await supabase.from("events").insert({ name, anon_id: anonId, company_id: companyId ?? null });
  } catch {
    // ignore
  }
}
