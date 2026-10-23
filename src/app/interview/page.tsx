import Link from "next/link";
import { redirect } from "next/navigation";
import InterviewFlow from "@/components/InterviewFlow";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "AI mock interview" };

// Not linked from any nav or page yet — reachable only by URL until the
// product decides it's ready to surface (the "Surface it" phase).
export default async function InterviewPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/interview");

  const { data: credit } = await supabase
    .from("interview_credits")
    .select("id")
    .is("consumed_at", null)
    .limit(1)
    .maybeSingle();

  if (!credit) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <h1 className="text-2xl font-semibold">AI mock interview</h1>
        <p className="mt-3 text-stone-600">
          You don&apos;t have an interview credit available right now. Sharing an interview experience that gets approved earns you one, up to 3.
        </p>
        <Link href="/submit" className="mt-6 inline-flex min-h-12 items-center rounded-md bg-brand-700 px-5 font-medium text-white hover:bg-brand-800">
          Share your experience
        </Link>
      </div>
    );
  }

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name")
    .gt("review_count", 0)
    .order("review_count", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">AI mock interview</h1>
      <p className="mt-2 text-stone-600">
        Practice out loud with a free AI interviewer. Text only for now — about 10 minutes.
      </p>
      <p className="mt-2 text-xs text-stone-500">
        Your answers are sent to a third-party AI provider to generate questions and feedback. The conversation isn&apos;t stored after your session ends. Feedback is AI-generated, practice only, and can be wrong.{" "}
        <Link href="/privacy" className="underline">Privacy details</Link>
      </p>
      <InterviewFlow companies={companies ?? []} />
    </div>
  );
}
