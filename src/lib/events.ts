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
 *
 * `userId` defaults to the caller's own session (the events table's
 * user_id column defaults to auth.uid(), and its insert policy only ever
 * allows your own id or null — you can't attribute an event to someone
 * else). Pass `userId: null` explicitly when the event describes something
 * that happened to a DIFFERENT user than whoever is calling this (e.g. an
 * admin action), so it's recorded as an unattributed count rather than
 * silently misattributed to the admin.
 */
export async function logEvent(name: EventName, companyId?: string | null, userId?: string | null) {
  try {
    const supabase = await createClient();
    const cookieStore = await cookies();
    await supabase.from("events").insert({
      name,
      anon_id: cookieStore.get(ANON_COOKIE)?.value ?? null,
      company_id: companyId ?? null,
      ...(userId === undefined ? {} : { user_id: userId }),
      ...decodeUtm(cookieStore.get(UTM_COOKIE)?.value),
    });
  } catch {
    // ignore
  }
}
