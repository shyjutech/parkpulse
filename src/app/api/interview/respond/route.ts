import { NextResponse } from "next/server";
import { MAX_ANSWER_CHARS, MAX_SKILLS_CHARS, maxQuestions } from "@/lib/interview/constants";
import { parseFeedback } from "@/lib/interview/feedback";
import { planNextTurn, type GroundingQuestion } from "@/lib/interview/grounding";
import {
  InterviewConfigError,
  InterviewProviderError,
  callOpenRouter,
  type ChatCompletionResult,
} from "@/lib/interview/openrouter";
import {
  buildFeedbackMessages,
  buildGenericQuestionMessages,
  groundedQuestionPresentation,
  type ChatMessage,
  type InterviewContext,
} from "@/lib/interview/prompt";
import { createClient } from "@/lib/supabase/server";

// Calls an external provider with real latency, so this route (not a server
// action) gets an explicit duration budget. Kept comfortably above
// REQUEST_TIMEOUT_MS + its one retry so a provider timeout can still return a
// clean JSON error instead of the platform killing the function.
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GROUNDING_LIMIT = 5;

function fail(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function parseTranscript(raw: unknown, messageCount: number): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is { role: string; content: string } =>
        !!m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string" &&
        ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant"),
    )
    // Bound to what this session could legitimately have produced so far (2
    // messages per completed turn: one question, one answer), regardless of
    // what the client actually sends — the server never trusts this for
    // anything but conversational context, never for progress/limits.
    .slice(0, messageCount * 2)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 2000) }));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request.", 400);
  }
  const b = body as Record<string, unknown>;
  const sessionId = typeof b.sessionId === "string" ? b.sessionId : "";
  const answer = typeof b.answer === "string" ? b.answer.trim().slice(0, MAX_ANSWER_CHARS) : "";
  const skills = typeof b.skills === "string" ? b.skills.trim().slice(0, MAX_SKILLS_CHARS) : "";
  if (!UUID_RE.test(sessionId)) return fail("Invalid session.", 400);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("Please sign in.", 401);

  // If this session (or any other of theirs) has gone stale since they were
  // last here, this is what actually enforces the timeout — not a scheduled
  // job. If it just got marked abandoned, the fetch below correctly sees
  // status != 'active' and the caller gets "This interview isn't active."
  await supabase.rpc("abandon_stale_sessions", { p_user: auth.user.id });

  // RLS already scopes this to the caller's own rows, so finding nothing
  // means either it doesn't exist or it isn't theirs — same response either way.
  const { data: session } = await supabase
    .from("ai_interview_sessions")
    .select("id, company_id, role, experience_level, status, message_count")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status !== "active") return fail("This interview isn't active.", 404);

  const maxQ = maxQuestions();
  const transcript = parseTranscript(b.transcript, session.message_count);
  if (answer && session.message_count > 0) transcript.push({ role: "user", content: answer });

  let companyName: string | null = null;
  const groundingQuestions: GroundingQuestion[] = [];
  const groundingRounds: string[] = [];
  if (session.company_id) {
    const [{ data: company }, { data: reports }] = await Promise.all([
      supabase.from("companies").select("name").eq("id", session.company_id).maybeSingle(),
      supabase
        .from("submissions")
        .select("questions, rounds")
        .eq("company_id", session.company_id)
        .eq("status", "approved")
        .order("submitted_at", { ascending: false })
        .limit(GROUNDING_LIMIT),
    ]);
    companyName = company?.name ?? null;
    for (const r of reports ?? []) {
      if (r.questions) groundingQuestions.push({ text: r.questions });
      if (r.rounds) groundingRounds.push(r.rounds);
    }
  }

  const ctx: InterviewContext = {
    role: session.role,
    experienceLevel: session.experience_level,
    companyName,
    skills,
    groundingRoundsSummaries: groundingRounds,
  };

  const plan = planNextTurn(session.message_count, groundingQuestions, maxQ);
  const questionNumber = session.message_count + 1;

  if (plan.kind === "done") {
    let completion: ChatCompletionResult | null = null;
    try {
      completion = await callOpenRouter(buildFeedbackMessages(ctx, transcript), { jsonMode: true, maxTokens: 700 });
    } catch (err) {
      logFailure("feedback", err);
      // The interview itself already succeeded (all questions were asked);
      // don't make the candidate retry or lose their credit over the
      // feedback summary specifically. Fall back and finish normally.
    }
    if (completion) {
      await supabase.rpc("add_ai_session_tokens", {
        p_session_id: sessionId,
        p_input_tokens: completion.inputTokens,
        p_output_tokens: completion.outputTokens,
        p_model: completion.model,
      });
    }
    // null (not a watered-down Feedback object) when the provider call failed
    // or its output couldn't be validated — the client renders a distinct
    // "feedback wasn't available" state for that, never something that reads
    // like a real (if thin) assessment.
    const feedback = completion ? parseFeedback(completion.content) : null;
    const { error: completeErr } = await supabase.rpc("complete_ai_session", { p_session_id: sessionId });
    if (completeErr) return fail("Couldn't finish the interview right now. Please try again.", 500);
    return NextResponse.json({ ok: true, done: true, feedback });
  }

  if (plan.kind === "grounded") {
    const question = groundedQuestionPresentation(plan.question, companyName);
    const { error } = await supabase.rpc("record_ai_turn", {
      p_session_id: sessionId,
      p_input_tokens: 0,
      p_output_tokens: 0,
      p_model: null,
    });
    if (error) return fail("Couldn't load the next question. Please try again.", 500);
    return NextResponse.json({ ok: true, done: false, question, source: "reported", questionNumber, totalQuestions: maxQ });
  }

  // Generic (AI-generated) question.
  let completion: ChatCompletionResult;
  try {
    completion = await callOpenRouter(buildGenericQuestionMessages(ctx, transcript));
  } catch (err) {
    logFailure("question", err);
    if (session.message_count === 0) {
      // Nothing was ever delivered for this session — restore the credit so
      // the attempt didn't cost anything, and say so plainly.
      const { data: restored } = await supabase.rpc("fail_ai_session", { p_session_id: sessionId });
      return fail(
        restored
          ? "Something went wrong starting your interview. Your credit has been restored — please try again."
          : "Something went wrong starting your interview. Please try again.",
        502,
        { creditRestored: !!restored },
      );
    }
    // Mid-interview hiccup: the session is untouched (message_count hasn't
    // moved), so resubmitting the same answer is a safe retry.
    return fail("Something went wrong getting the next question. Please try again.", 502);
  }

  const { data: newCount, error: recordErr } = await supabase.rpc("record_ai_turn", {
    p_session_id: sessionId,
    p_input_tokens: completion.inputTokens,
    p_output_tokens: completion.outputTokens,
    p_model: completion.model,
  });
  if (recordErr) return fail("Couldn't save your progress. Please try again.", 500);

  return NextResponse.json({
    ok: true,
    done: false,
    question: completion.content.trim(),
    source: "generic",
    questionNumber: typeof newCount === "number" ? newCount : questionNumber,
    totalQuestions: maxQ,
  });
}

function logFailure(stage: "question" | "feedback", err: unknown) {
  const kind = err instanceof InterviewConfigError ? "config" : err instanceof InterviewProviderError ? "provider" : "unknown";
  // Server-side only — never forwarded to the client, which only ever sees
  // the friendly messages above.
  console.error(`[interview:${stage}] ${kind} error:`, err instanceof Error ? err.message : err);
}
