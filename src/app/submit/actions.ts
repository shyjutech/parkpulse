"use server";

import { logEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { validateSubmission, type FieldErrors, type SubmissionInput } from "@/lib/validation";

export type SubmitResult =
  | { ok: true }
  | { ok: false; message?: string; errors?: FieldErrors };

const FRIENDLY = "We couldn't save your experience. Please try again in a moment.";

export async function submitExperience(input: SubmissionInput): Promise<SubmitResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: "Please sign in to share your experience." };

  // Authoritative validation: never trust the browser's copy of these checks.
  const errors = validateSubmission(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  let companyId = input.company_id;
  if (!companyId) {
    const { data, error } = await supabase.rpc("propose_company", {
      p_name: input.new_company_name.trim(),
      p_park: input.new_company_park,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.id) return { ok: false, message: FRIENDLY };
    companyId = row.id;
  }

  // user_id comes from the verified session, and RLS re-checks it. Status is not
  // writable by clients at all, so the row always starts as "pending".
  const { error } = await supabase.from("submissions").insert({
    user_id: auth.user.id,
    company_id: companyId,
    role: input.role.trim(),
    experience_level: input.experience_level,
    interview_date: input.interview_date || null,
    rounds: input.rounds.trim(),
    questions: input.questions.trim(),
    difficulty: input.difficulty,
    outcome: input.outcome,
    salary_type: input.salary_type,
    salary_bucket: input.salary_type === "Not disclosed" ? null : input.salary_bucket,
    rating: Number(input.rating),
    culture_notes: input.culture_notes.trim(),
  });
  if (error) {
    return { ok: false, message: error.code === "23503" ? "That company no longer exists. Please pick it again." : FRIENDLY };
  }

  await logEvent("submit_completed", companyId);
  const { data: profile } = await supabase.from("profiles").select("contribution_count").maybeSingle();
  if (profile?.contribution_count === 1) await logEvent("unlock_completed", companyId);
  return { ok: true };
}
