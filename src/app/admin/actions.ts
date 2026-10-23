"use server";

import { revalidatePath } from "next/cache";
import { logEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

// Authorisation is enforced in Postgres (moderate_submission checks is_admin()
// and the companies UPDATE policy requires it too). Nothing here is trusted.
export async function moderate(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_submission", { p_id: id, p_decision: decision });
  if (!error && decision === "approved") {
    // submission_earned_credit() is the one narrow admin-only read into
    // another user's interview_credits (RLS is otherwise strictly own-rows),
    // needed only so this event is logged accurately -- not every approval
    // grants one (cap of 3, or the author already has an unconsumed credit).
    const { data: earned } = await supabase.rpc("submission_earned_credit", { p_submission_id: id });
    // userId: null -- this describes the submission's author, not the admin
    // who's calling it; see logEvent's own doc comment for why.
    if (earned) await logEvent("credit_granted", null, null);
  }
  revalidatePath("/admin");
}

export async function verifyCompany(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("companies").update({ verified: true }).eq("id", id);
  revalidatePath("/admin");
}

// Admin-only in the database: the submissions DELETE policy requires is_admin(),
// so for anyone else this deletes zero rows.
export async function deleteSubmission(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("submissions").delete().eq("id", id);
  revalidatePath("/admin");
}
