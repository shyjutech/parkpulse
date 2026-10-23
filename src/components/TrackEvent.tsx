"use client";

import { useEffect } from "react";
import type { EventName } from "@/lib/constants";
import { postEvent } from "@/lib/clientEvents";

/** Fires one analytics event when mounted. */
export default function TrackEvent({ name, companyId }: { name: EventName; companyId?: string }) {
  useEffect(() => {
    postEvent(name, companyId);
  }, [name, companyId]);
  return null;
}
