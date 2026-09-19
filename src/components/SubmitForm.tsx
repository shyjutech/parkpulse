"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
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
import { validateSubmission, type FieldErrors, type SubmissionInput } from "@/lib/validation";
import CompanyPicker, { type CompanyValue } from "./CompanyPicker";

const inputCls = "min-h-11 w-full rounded-md border border-stone-300 bg-white px-3 py-2";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Err({ id, msg }: { id: string; msg?: string }) {
  return msg ? <p id={id} role="alert" className="mt-1 text-sm text-red-700">{msg}</p> : null;
}

function Choice({
  legend,
  name,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  name: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
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
      </div>
      <Err id={`${name}-err`} msg={error} />
    </fieldset>
  );
}

const empty: SubmissionInput = {
  company_id: "",
  new_company_name: "",
  new_company_park: "",
  role: "",
  experience_level: "",
  interview_date: "",
  rounds: "",
  questions: "",
  difficulty: "",
  outcome: "",
  salary_type: "",
  salary_bucket: "",
  rating: "",
  culture_notes: "",
  acknowledged: false,
};

export default function SubmitForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState<SubmissionInput>(empty);
  const [companyName, setCompanyName] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const set = <K extends keyof SubmissionInput>(k: K, val: SubmissionInput[K]) => setV((p) => ({ ...p, [k]: val }));

  const company: CompanyValue = {
    companyId: v.company_id,
    companyName,
    newName: v.new_company_name,
    newPark: v.new_company_park,
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const found = validateSubmission(v);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setMessage("Please fix the highlighted fields.");
      document.querySelector<HTMLElement>("[role=alert]")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await submitExperience(v);
        if (res.ok) {
          router.push("/submit/done");
          return;
        }
        if (res.errors) setErrors(res.errors);
        setMessage(res.message ?? "Please fix the highlighted fields.");
      } catch {
        setMessage("Something went wrong. Check your connection and try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Section title="Company">
        <CompanyPicker
          value={company}
          errors={{ name: errors.new_company_name, park: errors.new_company_park }}
          onChange={(c) => {
            setCompanyName(c.companyName);
            setV((p) => ({ ...p, company_id: c.companyId, new_company_name: c.newName, new_company_park: c.newPark }));
          }}
        />
      </Section>

      <Section title="Role and experience">
        <div>
          <label htmlFor="role" className="block text-sm font-medium">Role you interviewed for</label>
          <input id="role" className={inputCls} value={v.role} maxLength={100} placeholder="e.g. Flutter Developer" onChange={(e) => set("role", e.target.value)} aria-invalid={!!errors.role} />
          <Err id="role-err" msg={errors.role} />
        </div>
        <div>
          <label htmlFor="level" className="block text-sm font-medium">Your experience level</label>
          <select id="level" className={inputCls} value={v.experience_level} onChange={(e) => set("experience_level", e.target.value)}>
            <option value="">Select…</option>
            {EXPERIENCE_LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
          <Err id="level-err" msg={errors.experience_level} />
        </div>
        <div>
          <label htmlFor="date" className="block text-sm font-medium">When was the interview? <span className="font-normal text-stone-500">(optional)</span></label>
          <input id="date" type="date" className={inputCls} value={v.interview_date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("interview_date", e.target.value)} />
          <Err id="date-err" msg={errors.interview_date} />
        </div>
      </Section>

      <Section title="The interview">
        <div>
          <label htmlFor="rounds" className="block text-sm font-medium">What were the interview rounds?</label>
          <textarea id="rounds" rows={4} className={inputCls} value={v.rounds} onChange={(e) => set("rounds", e.target.value)} placeholder="e.g. Online test, technical round, HR discussion" aria-invalid={!!errors.rounds} />
          <p className="mt-1 text-xs text-stone-500">{v.rounds.trim().length}/{MIN_LENGTHS.rounds} characters minimum</p>
          <Err id="rounds-err" msg={errors.rounds} />
        </div>
        <div>
          <label htmlFor="questions" className="block text-sm font-medium">What questions were you asked?</label>
          <textarea id="questions" rows={6} className={inputCls} value={v.questions} onChange={(e) => set("questions", e.target.value)} placeholder="Topics, problems and questions you remember" aria-invalid={!!errors.questions} />
          <p className="mt-1 text-xs text-stone-500">{v.questions.trim().length}/{MIN_LENGTHS.questions} characters minimum</p>
          <Err id="questions-err" msg={errors.questions} />
        </div>
        <Choice legend="How difficult was it?" name="difficulty" options={DIFFICULTIES} value={v.difficulty} onChange={(x) => set("difficulty", x)} error={errors.difficulty} />
      </Section>

      <Section title="Salary">
        <Choice legend="What does this salary represent?" name="salary_type" options={SALARY_TYPES} value={v.salary_type} onChange={(x) => setV((p) => ({ ...p, salary_type: x, salary_bucket: x === "Not disclosed" ? "" : p.salary_bucket }))} error={errors.salary_type} />
        {v.salary_type && v.salary_type !== "Not disclosed" && (
          <div>
            <label htmlFor="bucket" className="block text-sm font-medium">Annual CTC range</label>
            <select id="bucket" className={inputCls} value={v.salary_bucket} onChange={(e) => set("salary_bucket", e.target.value)}>
              <option value="">Select…</option>
              {SALARY_BUCKETS.map((b) => <option key={b}>{b}</option>)}
            </select>
            <p className="mt-1 text-xs text-stone-500">Only the range is stored and shown, never an exact figure.</p>
            <Err id="bucket-err" msg={errors.salary_bucket} />
          </div>
        )}
      </Section>

      <Section title="Outcome and rating">
        <Choice legend="What was the outcome?" name="outcome" options={OUTCOMES} value={v.outcome} onChange={(x) => set("outcome", x)} error={errors.outcome} />
        <Choice legend="How would you rate your overall interview experience?" name="rating" options={["1", "2", "3", "4", "5"]} value={v.rating} onChange={(x) => set("rating", x)} error={errors.rating} />
        <p className="-mt-2 text-xs text-stone-500">1 = poor, 5 = excellent. This is about the interview process, not the company or its pay.</p>
      </Section>

      <Section title="Culture">
        <div>
          <label htmlFor="culture" className="block text-sm font-medium">What did you notice about the people and workplace?</label>
          <textarea id="culture" rows={4} className={inputCls} value={v.culture_notes} onChange={(e) => set("culture_notes", e.target.value)} placeholder="Interviewer attitude, office environment, what you heard about the work" aria-invalid={!!errors.culture_notes} />
          <p className="mt-1 text-xs text-stone-500">{v.culture_notes.trim().length}/{MIN_LENGTHS.culture_notes} characters minimum</p>
          <Err id="culture-err" msg={errors.culture_notes} />
        </div>
      </Section>

      <Section title="Privacy">
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{PRIVACY_WARNING}</p>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={v.acknowledged} onChange={(e) => set("acknowledged", e.target.checked)} />
          <span>I understand that my experience will be published anonymously after moderation.</span>
        </label>
        <Err id="ack-err" msg={errors.acknowledged} />
      </Section>

      {message && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{message}</p>}

      <button
        type="submit"
        disabled={pending || !v.acknowledged}
        className="w-full rounded-md bg-brand-700 px-5 py-3 font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {pending ? "Submitting…" : "Submit and unlock"}
      </button>
    </form>
  );
}
