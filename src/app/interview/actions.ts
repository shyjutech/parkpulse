"use server";

import { redirect } from "next/navigation";
import { EXPERIENCE_LEVELS } from "@/lib/constants";
import { logEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

export type StartResult = { ok: true; sessionId: string } | { ok: false; message: string };

const FRIENDLY = "Couldn't start the interview right now. Please try again in a moment.";

export async function startInterview(fd: FormData): Promise<StartResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/interview");

  const role = String(fd.get("role") ?? "").trim().slice(0, 100);
  const experienceLevel = String(fd.get("experience_level") ?? "");
  const companyId = String(fd.get("company_id") ?? "").trim() || null;

  if (role.length < 2) return { ok: false, message: "Enter the role you want to practice for." };
  if (!(EXPERIENCE_LEVELS as readonly string[]).includes(experienceLevel)) {
    return { ok: false, message: "Choose your experience level." };
  }

  const { data, error } = await supabase.rpc("start_ai_interview", {
    p_role: role,
    p_experience_level: experienceLevel,
    p_company_id: companyId,
  });

  if (error) {
    if (error.message.includes("daily interview limit")) {
      return { ok: false, message: "You've reached today's interview limit. Please try again tomorrow." };
    }
    if (error.message.includes("no interview credit")) {
      return { ok: false, message: "You don't have an interview credit available right now." };
    }
    return { ok: false, message: FRIENDLY };
  }
  if (typeof data !== "string") return { ok: false, message: FRIENDLY };
  await logEvent("ai_interview_started", companyId);
  return { ok: true, sessionId: data };
}
