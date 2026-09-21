import type { SupabaseClient } from "@supabase/supabase-js";

/** Which of these approved reports has the signed-in user saved? (RLS limits this to their own saves.) */
export async function savedIds(supabase: SupabaseClient, ids: string[], signedIn: boolean) {
  if (!signedIn || ids.length === 0) return new Set<string>();
  const { data } = await supabase.from("saved_experiences").select("submission_id").in("submission_id", ids);
  return new Set((data ?? []).map((r: { submission_id: string }) => r.submission_id));
}
