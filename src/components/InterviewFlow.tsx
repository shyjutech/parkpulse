"use client";

import { useEffect, useState, useTransition } from "react";
import { startInterview } from "@/app/interview/actions";
import { EXPERIENCE_LEVELS } from "@/lib/constants";
import type { Feedback } from "@/lib/interview/feedback";
import { MAX_SKILLS_CHARS } from "@/lib/interview/constants";

const inputCls = "min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 py-2";

interface Company {
  id: string;
  name: string;
}

interface Message {
  role: "assistant" | "user";
  content: string;
  source?: "reported" | "generic";
}

type Phase = "setup" | "loading" | "chatting" | "done" | "blocked";

interface TurnResponse {
  ok: boolean;
  done?: boolean;
  question?: string;
  source?: "reported" | "generic";
  questionNumber?: number;
  totalQuestions?: number;
  feedback?: Feedback | null;
  message?: string;
  creditRestored?: boolean;
}

async function postTurn(payload: Record<string, unknown>): Promise<TurnResponse> {
  const res = await fetch("/api/interview/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function SourceBadge({ source }: { source?: "reported" | "generic" }) {
  if (!source) return null;
  return source === "reported" ? (
    <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-800">Reported by candidates</span>
  ) : (
    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">Generic for this role</span>
  );
}

export default function InterviewFlow({ companies }: { companies: Company[] }) {
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>("setup");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [skills, setSkills] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [progress, setProgress] = useState<{ n: number; total: number }>({ n: 0, total: 0 });
  const [answer, setAnswer] = useState("");
  const [pendingAnswer, setPendingAnswer] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Warn before a refresh, tab close, or navigation away loses an
  // in-progress interview. Only while a session is actually open — nothing
  // to lose during setup, and nothing left to lose once it's done/blocked.
  useEffect(() => {
    if (phase !== "chatting" && phase !== "loading") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  function requestTurn(sid: string, answerToSend: string | undefined, priorMessages: Message[]) {
    setPhase("loading");
    setError(null);
    setPendingAnswer(answerToSend);
    startTransition(async () => {
      try {
        const res = await postTurn({
          sessionId: sid,
          answer: answerToSend,
          skills,
          transcript: priorMessages.map((m) => ({ role: m.role, content: m.content })),
        });
        if (!res.ok) {
          setError(res.message ?? "Something went wrong. Please try again.");
          setPhase(res.creditRestored ? "blocked" : "chatting");
          return;
        }
        if (res.done) {
          setFeedback(res.feedback ?? null);
          setPhase("done");
          return;
        }
        setMessages((prev) => [...prev, { role: "assistant", content: res.question ?? "", source: res.source }]);
        setProgress({ n: res.questionNumber ?? 0, total: res.totalQuestions ?? 0 });
        setAnswer("");
        setPhase("chatting");
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
        setPhase("chatting");
      }
    });
  }

  function handleSetupSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await startInterview(fd);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setSessionId(res.sessionId);
      requestTurn(res.sessionId, undefined, []);
    });
  }

  function handleAnswerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || !answer.trim()) return;
    const withAnswer: Message[] = [...messages, { role: "user", content: answer.trim() }];
    const prior = messages; // server appends the new answer itself
    setMessages(withAnswer);
    requestTurn(sessionId, answer.trim(), prior);
  }

  function retry() {
    if (!sessionId) return;
    const prior = pendingAnswer ? messages.slice(0, -1) : messages;
    requestTurn(sessionId, pendingAnswer, prior);
  }

  if (phase === "blocked") {
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
        <p className="text-amber-900">{error}</p>
        <a href="/interview" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">
          Start again
        </a>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="mt-6 space-y-5">
        <div className="rounded-lg border border-brand-600/30 bg-brand-50 p-5">
          <h2 className="font-semibold text-brand-800">Interview complete</h2>
          <p className="mt-1 text-sm text-stone-700">You reached the end of the interview. See the feedback below for how your answers came across.</p>
        </div>

        {feedback ? (
          <>
            <p className="text-sm text-stone-600">This feedback is AI-generated and can be wrong — use it as a starting point, not a verdict.</p>
            <section>
              <h3 className="text-sm font-semibold uppercase text-stone-500">What went well</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-800">
                {feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
            <section>
              <h3 className="text-sm font-semibold uppercase text-stone-500">Room to improve</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-800">
                {feedback.gaps.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
            <section>
              <h3 className="text-sm font-semibold uppercase text-stone-500">Tips for next time</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-stone-800">
                {feedback.tips.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
          </>
        ) : (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="font-medium text-amber-900">Automated feedback wasn&apos;t available</p>
            <p className="mt-1 text-sm text-amber-900">
              This is not an assessment of your answers — we simply couldn&apos;t generate feedback for this session. You still completed the full practice interview.
            </p>
          </div>
        )}

        <a href="/dashboard" className="inline-flex min-h-11 items-center rounded-md border border-stone-300 bg-white px-4 text-sm font-medium hover:border-brand-600">
          Back to My space
        </a>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <form action={handleSetupSubmit} className="mt-6 space-y-4 rounded-lg border border-stone-200 bg-white p-5">
        <div>
          <label htmlFor="role" className="block text-sm font-medium">Role you want to practice for</label>
          <input id="role" name="role" required maxLength={100} placeholder="e.g. Flutter Developer" className={inputCls} />
        </div>
        <div>
          <label htmlFor="level" className="block text-sm font-medium">Your experience level</label>
          <select id="level" name="experience_level" required className={inputCls} defaultValue="">
            <option value="" disabled>Select…</option>
            {EXPERIENCE_LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="company" className="block text-sm font-medium">Company <span className="font-normal text-stone-500">(optional)</span></label>
          <select id="company" name="company_id" className={inputCls} defaultValue="">
            <option value="">Not sure yet / any company</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-stone-500">Picking a company lets some questions be drawn from real candidate reports for it.</p>
        </div>
        <div>
          <label htmlFor="skills" className="block text-sm font-medium">Anything you especially want to be asked about? <span className="font-normal text-stone-500">(optional)</span></label>
          <textarea
            id="skills"
            rows={3}
            maxLength={MAX_SKILLS_CHARS}
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="e.g. state management, system design"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-stone-500">{skills.length}/{MAX_SKILLS_CHARS}</p>
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button type="submit" disabled={pending} className="min-h-12 w-full rounded-md bg-brand-700 px-5 font-medium text-white hover:bg-brand-800 disabled:opacity-50 sm:w-auto">
          {pending ? "Starting…" : "Start interview"}
        </button>
      </form>
    );
  }

  // chatting / loading
  return (
    <div className="mt-6 space-y-4">
      {progress.total > 0 && (
        <p className="text-sm text-stone-500">Question {Math.min(progress.n, progress.total)} of {progress.total}</p>
      )}
      <div className="space-y-4">
        {messages.map((m, i) =>
          m.role === "assistant" ? (
            <div key={i} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{m.content}</p>
                <SourceBadge source={m.source} />
              </div>
            </div>
          ) : (
            <div key={i} className="ml-6 rounded-lg bg-brand-50 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{m.content}</p>
            </div>
          ),
        )}
      </div>

      {phase === "loading" && (
        <div className="rounded-lg border border-stone-200 bg-white p-4" role="status" aria-label="Thinking">
          <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200" />
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          <p role="alert">{error}</p>
          <button type="button" onClick={retry} className="mt-2 min-h-11 rounded-md border border-red-300 bg-white px-3 text-sm text-red-800 hover:bg-red-100">
            Try again
          </button>
        </div>
      )}

      {phase === "chatting" && (
        <form onSubmit={handleAnswerSubmit} className="space-y-3">
          <label htmlFor="answer" className="sr-only">Your answer</label>
          <textarea
            id="answer"
            rows={4}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={2000}
            placeholder="Type your answer…"
            className={inputCls}
          />
          <button type="submit" disabled={pending || !answer.trim()} className="min-h-12 w-full rounded-md bg-brand-700 px-5 font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            Submit answer
          </button>
        </form>
      )}
    </div>
  );
}
