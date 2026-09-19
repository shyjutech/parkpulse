"use client";

import { useEffect } from "react";
import type { EventName } from "@/lib/constants";

/** Fires one analytics event when mounted. Failures are ignored. */
export default function TrackEvent({ name, companyId }: { name: EventName; companyId?: string }) {
  useEffect(() => {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, companyId }),
      keepalive: true,
    }).catch(() => {});
  }, [name, companyId]);
  return null;
}
