"use client";

import { useEffect } from "react";

/** Logs at most one anonymous "visit" per browser per day, so return visits can be measured. */
export default function VisitTracker() {
  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem("pp_last_visit") === today) return;
      localStorage.setItem("pp_last_visit", today);
    } catch {
      return;
    }
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "visit" }),
      keepalive: true,
    }).catch(() => {});
  }, []);
  return null;
}
