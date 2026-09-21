import { NextResponse } from "next/server";
import type { EventName } from "@/lib/constants";
import { isEventName, logEvent } from "@/lib/events";

// Only page-level events may be reported by the browser. Outcome events
// (submit_completed, save_added, follow_added, ...) are logged by server
// actions after the action succeeds, so they can't be forged from here.
const CLIENT_EVENTS: readonly EventName[] = [
  "landing_view",
  "company_view",
  "submit_started",
  "search_used",
  "visit",
  "campaign_view",
];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !isEventName(body.name) || !CLIENT_EVENTS.includes(body.name)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const companyId = typeof body.companyId === "string" && body.companyId.length <= 64 ? body.companyId : null;
  await logEvent(body.name, companyId);
  return NextResponse.json({ ok: true });
}
