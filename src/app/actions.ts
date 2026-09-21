"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { STARTER_CHECKLIST } from "@/lib/constants";
import { getAnonId, logEvent } from "@/lib/events";
import { safeNext } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

// Every action below runs as the signed-in user through RLS: the database, not
// this code, guarantees people can only touch their own rows.

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function requireUser(next: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase, user: data.user };
}

export async function toggleSave(fd: FormData) {
  const id = str(fd, "id");
  const next = safeNext(str(fd, "next"));
  const { supabase, user } = await requireUser(next);
  if (!id) return;
  if (str(fd, "saved") === "1") {
    await supabase.from("saved_experiences").delete().eq("submission_id", id);
  } else {
    const { error } = await supabase.from("saved_experiences").insert({ user_id: user.id, submission_id: id });
    if (!error) await logEvent("save_added");
  }
  revalidatePath(next);
}

export async function toggleFollow(fd: FormData) {
  const companyId = str(fd, "company_id");
  const next = safeNext(str(fd, "next"));
  const { supabase, user } = await requireUser(next);
  if (!companyId) return;
  if (str(fd, "following") === "1") {
    await supabase.from("company_follows").delete().eq("company_id", companyId);
  } else {
    const { error } = await supabase.from("company_follows").insert({ user_id: user.id, company_id: companyId });
    if (!error) await logEvent("follow_added", companyId);
  }
  revalidatePath(next);
}

/** Open to signed-out visitors; deduplicated per browser (or per account). */
export async function requestExperiences(fd: FormData) {
  const companyId = str(fd, "company_id");
  const next = safeNext(str(fd, "next"));
  if (!companyId) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_company_experiences", {
    p_company: companyId,
    p_anon: await getAnonId(),
  });
  if (!error) await logEvent("experience_requested", companyId);
  revalidatePath(next);
}

export async function savePrepPlan(fd: FormData) {
  const companyId = str(fd, "company_id");
  const slug = str(fd, "slug");
  const next = `/prep/${slug}`;
  const { supabase, user } = await requireUser(next);
  const role = str(fd, "role").trim().slice(0, 100) || null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(fd, "interview_date")) ? str(fd, "interview_date") : null;
  const { data: existing } = await supabase.from("prep_plans").select("id").eq("company_id", companyId).maybeSingle();
  if (existing) {
    await supabase.from("prep_plans").update({ role, interview_date: date, reminder_dismissed: false }).eq("id", existing.id);
  } else {
    const { error } = await supabase
      .from("prep_plans")
      .insert({ user_id: user.id, company_id: companyId, role, interview_date: date });
    if (!error) await logEvent("checklist_created", companyId);
  }
  revalidatePath(next);
  revalidatePath("/dashboard");
}

export async function deletePrepPlan(fd: FormData) {
  const { supabase } = await requireUser("/dashboard");
  await supabase.from("prep_plans").delete().eq("id", str(fd, "plan_id"));
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function addPrepItem(fd: FormData) {
  const next = safeNext(str(fd, "next"), "/dashboard");
  const { supabase, user } = await requireUser(next);
  const text = str(fd, "text").trim().slice(0, 200);
  if (!text) return;
  const planId = str(fd, "plan_id");
  const { count } = await supabase.from("prep_items").select("id", { count: "exact", head: true }).eq("plan_id", planId);
  await supabase.from("prep_items").insert({ plan_id: planId, user_id: user.id, text, position: count ?? 0 });
  revalidatePath(next);
}

export async function addStarterItems(fd: FormData) {
  const next = safeNext(str(fd, "next"), "/dashboard");
  const { supabase, user } = await requireUser(next);
  const planId = str(fd, "plan_id");
  await supabase
    .from("prep_items")
    .insert(STARTER_CHECKLIST.map((text, i) => ({ plan_id: planId, user_id: user.id, text, position: i })));
  revalidatePath(next);
}

export async function togglePrepItem(fd: FormData) {
  const next = safeNext(str(fd, "next"), "/dashboard");
  const { supabase } = await requireUser(next);
  await supabase.from("prep_items").update({ done: str(fd, "done") !== "1" }).eq("id", str(fd, "id"));
  revalidatePath(next);
  revalidatePath("/dashboard");
}

export async function deletePrepItem(fd: FormData) {
  const next = safeNext(str(fd, "next"), "/dashboard");
  const { supabase } = await requireUser(next);
  await supabase.from("prep_items").delete().eq("id", str(fd, "id"));
  revalidatePath(next);
}

export async function dismissReminder(fd: FormData) {
  const { supabase } = await requireUser("/dashboard");
  await supabase.from("prep_plans").update({ reminder_dismissed: true }).eq("id", str(fd, "plan_id"));
  revalidatePath("/", "layout");
}
