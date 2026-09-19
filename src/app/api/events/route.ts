import { NextResponse } from "next/server";
import { isEventName, logEvent } from "@/lib/events";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !isEventName(body.name)) return NextResponse.json({ ok: false }, { status: 400 });
  const companyId = typeof body.companyId === "string" && body.companyId.length <= 64 ? body.companyId : null;
  await logEvent(body.name, companyId);
  return NextResponse.json({ ok: true });
}
