"use client";

import { useEffect } from "react";
import { logOncePerDay } from "@/lib/clientEvents";

/** Logs at most one anonymous "visit" per browser per day, so return visits can be measured. */
export default function VisitTracker() {
  useEffect(() => {
    logOncePerDay("visit");
  }, []);
  return null;
}
