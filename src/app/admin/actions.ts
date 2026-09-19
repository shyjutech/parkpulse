"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Authorisation is enforced in Postgres (moderate_submission checks is_admin()
// and the companies UPDATE policy requires it too). Nothing here is trusted.
export async function moderate(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!id || (decision !== "approved" && decision !== "rejected")) return;
  const supabase = await createClient();
  await supabase.rpc("moderate_submission", { p_id: id, p_decision: decision });
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
