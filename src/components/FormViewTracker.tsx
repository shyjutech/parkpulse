"use client";

import { useEffect } from "react";
import { logOncePerDay } from "@/lib/clientEvents";

/**
 * Replaces the old `submit_started` call. Fires once per browser per day (any
 * visitor, signed in or not): this is a page view, not "the user engaged with
 * the form" — that's `form_start`, fired separately from the first field edit.
 */
export default function FormViewTracker() {
  useEffect(() => {
    logOncePerDay("form_view");
  }, []);
  return null;
}
