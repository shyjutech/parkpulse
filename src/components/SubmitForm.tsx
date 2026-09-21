"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { submitExperience } from "@/app/submit/actions";
import {
  DIFFICULTIES,
  EXPERIENCE_LEVELS,
  MIN_LENGTHS,
  OUTCOMES,
  PRIVACY_WARNING,
  SALARY_BUCKETS,
  SALARY_TYPES,
} from "@/lib/constants";
import { validateSubmission, monthToDate, type FieldErrors, type SubmissionInput } from "@/lib/validation";
import CompanyPicker, { type CompanyValue } from "./CompanyPicker";
import ExperienceCard from "./ExperienceCard";
import LoginButton from "./LoginButton";

const inputCls = "min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 py-2";
const DRAFT_KEY = "pp_draft_v1";

const empty: SubmissionInput = {
  company_id: "",
  new_company_name: "",
  new_company_park: "",
  role: "",
  experience_level: "",
  interview_date: "",
  questions: "",
  rounds: "",
  difficulty: "",
  outcome: "",
  salary_type: "",
  salary_bucket: "",
  rating: "",
  culture_notes: "",
  acknowledged: false,
};

interface Draft {
  v: SubmissionInput;
  companyName: string;
  step: "edit" | "preview";
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return d && d.v ? { ...d, v: { ...empty, ...d.v, acknowledged: false } } : null;
  } catch {
    return null;
  }
}

function saveDraft(d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, v: { ...d.v, acknowledged: false } }));
  } catch {
    // Storage unavailable (private mode): the form still works, just without a draft.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Err({ msg }: { msg?: string }) {
  return msg ? <p role="alert" className="mt-1 text-sm text-red-700">{msg}</p> : null;
}

function Choice({
  legend, name, options, value, onChange, error, allowClear,
}: {
  legend: string; name: string; options: readonly string[]; value: string;
  onChange: (v: string) => void; error?: string; allowClear?: boolean;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o}
            className={`flex min-h-11 cursor-pointer items-center rounded-md border px-4 text-sm ${
              value === o ? "border-brand-700 bg-brand-50 font-medium text-brand-800" : "border-stone-300 bg-white"
            }`}
          >
            <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} className="sr-only" />
            {o}
          </label>
        ))}
        {allowClear && value && (
          <button type="button" onClick={() => onChange("")} className="min-h-11 px-2 text-sm text-stone-500 underline">
            Clear
          </button>
        )}
      </div>
      <Err msg={error} />
    </fieldset>
  );
}

function FormInner({
  signedIn,
  initialCompany,
}: {
  signedIn: boolean;
  initialCompany: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [initial] = useState(() => {
    const draft = loadDraft();
    let v = draft?.v ?? empty;
    let companyName = draft?.companyName ?? "";
    if (initialCompany) {
      v = { ...v, company_id: initialCompany.id, new_company_name: "", new_company_park: "" };
      companyName = initialCompany.name;
    }
    return { v, companyName, step: draft?.step ?? "edit", restored: !!draft };
  });
  const [v, setV] = useState<SubmissionInput>(initial.v);
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [step, setStep] = useState<"edit" | "preview">(initial.step);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  function update(next: SubmissionInput, name = companyName, nextStep = step) {
    setV(next);
    saveDraft({ v: next, companyName: name, step: nextStep });
  }
  const set = <K extends keyof SubmissionInput>(k: K, val: SubmissionInput[K]) => update({ ...v, [k]: val });

  const company: CompanyValue = { companyId: v.company_id, companyName, newName: v.new_company_name, newPark: v.new_company_park };
  const optionalFilled = !!(v.rounds || v.difficulty || v.outcome || v.salary_type || v.rating || v.culture_notes);

  function goPreview(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    // The privacy checkbox lives on the preview step, so ignore it here.
    const found = validateSubmission({ ...v, acknowledged: true });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setMessage("Please fix the highlighted fields.");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[role=alert]")?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    setStep("preview");
    saveDraft({ v, companyName, step: "preview" });
    window.scrollTo({ top: 0 });
  }

  function backToEdit() {
    setStep("edit");
    saveDraft({ v, companyName, step: "edit" });
  }

  function submit() {
    setMessage(null);
    const found = validateSubmission(v);
    setErrors(found);
    if (found.acknowledged) return setMessage("Please confirm the privacy statement to submit.");
    if (Object.keys(found).length > 0) {
      setStep("edit");
      return setMessage("Please fix the highlighted fields.");
    }
    startTransition(async () => {
      try {
        const res = await submitExperience(v);
        if (res.ok) {
          clearDraft();
          router.push("/submit/done");
          return;
        }
        if (res.errors) {
          setErrors(res.errors);
          setStep("edit");
        }
        setMessage(res.message ?? "Please fix the highlighted fields.");
      } catch {
        setMessage("Something went wrong. Check your connection and try again. Your draft is safe.");
      }
    });
  }

  if (step === "preview") {
    const shownCompany = companyName || v.new_company_name;
    return (
      <div className="space-y-5">
        <h2 className="text-lg font-semibold">Preview</h2>
        <p className="text-sm text-stone-600">
          This is how your report will look once approved, without your name or account. Check it for anything that could identify you or others.
        </p>
        <ExperienceCard
          preview
          company={{ name: shownCompany || "Company", slug: "" }}
          e={{
            id: "preview",
            role: v.role.trim(),
            experience_level: v.experience_level,
            interview_date: monthToDate(v.interview_date),
            questions: v.questions.trim(),
            rounds: v.rounds.trim() || null,
            difficulty: v.difficulty || null,
            outcome: v.outcome || null,
            salary_bucket: v.salary_type && v.salary_type !== "Not disclosed" ? v.salary_bucket || null : null,
            rating: v.rating ? Number(v.rating) : null,
            culture_notes: v.culture_notes.trim() || null,
            submitted_at: new Date().toISOString(),
          }}
        />
        <Section title="Privacy">
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{PRIVACY_WARNING}</p>
          <p className="text-xs text-stone-500">
            Your Google name and email are collected only to prevent abuse. They are never shown publicly. Moderators review reports before they appear; reviewed does not mean verified.
          </p>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={v.acknowledged} onChange={(e) => set("acknowledged", e.target.checked)} />
            <span>I understand that my experience will be published anonymously after moderation.</span>
          </label>
        </Section>
        {message && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{message}</p>}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={backToEdit} className="min-h-12 rounded-md border border-stone-300 bg-white px-5 font-medium hover:border-brand-600">
            ← Edit
          </button>
          {signedIn ? (
            <button
              type="button"
              onClick={submit}
              disabled={pending || !v.acknowledged}
              className="min-h-12 flex-1 rounded-md bg-brand-700 px-5 font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              {pending ? "Submitting…" : "Submit for review"}
            </button>
          ) : (
            <div className="flex-1 sm:max-w-xs">
              <LoginButton next="/submit" />
              <p className="mt-2 text-xs text-stone-500">Sign in to submit. Your draft is saved on this device and will be here when you return.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={goPreview} noValidate className="space-y-5">
      {initial.restored && (
        <p className="rounded-md bg-brand-50 p-3 text-sm text-brand-800">
          Welcome back. We restored your draft.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              clearDraft();
              setV(empty);
              setCompanyName("");
              setErrors({});
            }}
          >
            Start over
          </button>
        </p>
      )}

      <Section title="The basics" hint="Only these are required.">
        <CompanyPicker
          value={company}
          errors={{ name: errors.new_company_name, park: errors.new_company_park }}
          onChange={(c) => {
            setCompanyName(c.companyName);
            update({ ...v, company_id: c.companyId, new_company_name: c.newName, new_company_park: c.newPark }, c.companyName);
          }}
        />
        <div>
          <label htmlFor="role" className="block text-sm font-medium">Role you interviewed for</label>
          <input id="role" className={inputCls} value={v.role} maxLength={100} placeholder="e.g. Flutter Developer" onChange={(e) => set("role", e.target.value)} aria-invalid={!!errors.role} />
          <Err msg={errors.role} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="level" className="block text-sm font-medium">Your experience level</label>
            <select id="level" className={inputCls} value={v.experience_level} onChange={(e) => set("experience_level", e.target.value)}>
              <option value="">Select…</option>
              {EXPERIENCE_LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
            <Err msg={errors.experience_level} />
          </div>
          <div>
            <label htmlFor="month" className="block text-sm font-medium">Interview month</label>
            <input id="month" type="month" className={inputCls} value={v.interview_date} max={new Date().toISOString().slice(0, 7)} onChange={(e) => set("interview_date", e.target.value)} />
            <Err msg={errors.interview_date} />
          </div>
        </div>
        <div>
          <label htmlFor="questions" className="block text-sm font-medium">One question, topic, or a short description</label>
          <textarea id="questions" rows={4} className={inputCls} value={v.questions} onChange={(e) => set("questions", e.target.value)} placeholder="e.g. Asked about state management in Flutter and a DSA problem on arrays" aria-invalid={!!errors.questions} />
          <p className="mt-1 text-xs text-stone-500">Even one line helps. At least {MIN_LENGTHS.questions} characters.</p>
          <Err msg={errors.questions} />
        </div>
      </Section>

      <details className="rounded-lg border border-stone-200 bg-white" open={optionalFilled}>
        <summary className="min-h-12 cursor-pointer px-4 py-3 text-base font-semibold">
          Add more detail <span className="text-sm font-normal text-stone-500">(optional)</span>
        </summary>
        <div className="space-y-5 border-t border-stone-100 p-4 sm:p-5">
          <div>
            <label htmlFor="rounds" className="block text-sm font-medium">Interview rounds</label>
            <textarea id="rounds" rows={3} className={inputCls} value={v.rounds} onChange={(e) => set("rounds", e.target.value)} placeholder="e.g. Online test, technical round, HR discussion" aria-invalid={!!errors.rounds} />
            <Err msg={errors.rounds} />
          </div>
          <Choice legend="How difficult was it?" name="difficulty" options={DIFFICULTIES} value={v.difficulty} onChange={(x) => set("difficulty", x)} error={errors.difficulty} allowClear />
          <Choice legend="What was the outcome?" name="outcome" options={OUTCOMES} value={v.outcome} onChange={(x) => set("outcome", x)} error={errors.outcome} allowClear />
          <Choice
            legend="What does the salary represent?"
            name="salary_type"
            options={SALARY_TYPES}
            value={v.salary_type}
            onChange={(x) => update({ ...v, salary_type: x, salary_bucket: x === "Not disclosed" ? "" : v.salary_bucket })}
            error={errors.salary_type}
            allowClear
          />
          {v.salary_type && v.salary_type !== "Not disclosed" && (
            <div>
              <label htmlFor="bucket" className="block text-sm font-medium">Annual CTC range</label>
              <select id="bucket" className={inputCls} value={v.salary_bucket} onChange={(e) => set("salary_bucket", e.target.value)}>
                <option value="">Select…</option>
                {SALARY_BUCKETS.map((b) => <option key={b}>{b}</option>)}
              </select>
              <p className="mt-1 text-xs text-stone-500">Only the range is stored and shown, never an exact figure.</p>
              <Err msg={errors.salary_bucket} />
            </div>
          )}
          <Choice legend="Rate your overall interview experience (1 poor, 5 excellent)" name="rating" options={["1", "2", "3", "4", "5"]} value={v.rating} onChange={(x) => set("rating", x)} error={errors.rating} allowClear />
          <div>
            <label htmlFor="culture" className="block text-sm font-medium">Culture notes</label>
            <textarea id="culture" rows={3} className={inputCls} value={v.culture_notes} onChange={(e) => set("culture_notes", e.target.value)} placeholder="Interviewer attitude, office environment" aria-invalid={!!errors.culture_notes} />
            <Err msg={errors.culture_notes} />
          </div>
        </div>
      </details>

      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        Don&apos;t include names, contact details, manager or client names, or confidential information.
      </p>

      {message && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{message}</p>}

      <button type="submit" className="min-h-12 w-full rounded-md bg-brand-700 px-5 font-medium text-white hover:bg-brand-800 sm:w-auto">
        Preview
      </button>
      <p className="text-xs text-stone-500">Your draft is saved on this device as you type.</p>
    </form>
  );
}

const noop = () => () => {};

/** The draft lives in localStorage, so render the form only on the client. */
export default function SubmitForm(props: { signedIn: boolean; initialCompany: { id: string; name: string } | null }) {
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  if (!isClient) {
    return <div className="h-64 animate-pulse rounded-lg bg-stone-200" role="status" aria-label="Loading form" />;
  }
  return <FormInner {...props} />;
}
