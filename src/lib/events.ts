import { cookies } from "next/headers";
import { ANON_COOKIE, UTM_COOKIE, decodeUtm } from "./attribution";
import { EVENT_NAMES, type EventName } from "./constants";
import { createClient } from "./supabase/server";

export function isEventName(v: unknown): v is EventName {
  return typeof v === "string" && (EVENT_NAMES as readonly string[]).includes(v);
}

/** Anonymous visitor id set by the proxy. */
export async function getAnonId() {
  return (await cookies()).get(ANON_COOKIE)?.value ?? null;
}

/**
 * Best-effort event log. Records only the event name, the visitor id, an
 * optional company id and first-touch UTM tags. Never report content.
 * Analytics must never break a user flow.
 */
export async function logEvent(name: EventName, companyId?: string | null) {
  try {
    const supabase = await createClient();
    const cookieStore = await cookies();
    await supabase.from("events").insert({
      name,
      anon_id: cookieStore.get(ANON_COOKIE)?.value ?? null,
      company_id: companyId ?? null,
      ...decodeUtm(cookieStore.get(UTM_COOKIE)?.value),
    });
  } catch {
    // ignore
  }
}
