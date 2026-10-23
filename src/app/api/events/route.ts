import { NextResponse } from "next/server";
import type { EventName } from "@/lib/constants";
import { isEventName, logEvent } from "@/lib/events";

// Only page-level and client-only-observable events may be reported by the
// browser. signin_prompted/signin_returned are inherently client-only (the
// server has no way to know a button was clicked or a draft was restored),
// so they're self-reported same as the others here. Outcome events that a
// server CAN verify (submit_completed, save_added, follow_added, ...) are
// logged by server actions after the action succeeds instead.
const CLIENT_EVENTS: readonly EventName[] = [
  "landing_view",
  "company_view",
  "form_view",
  "form_start",
  "signin_prompted",
  "signin_returned",
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
