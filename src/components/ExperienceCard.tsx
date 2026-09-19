import type { Experience } from "@/lib/types";
import Stars from "./Stars";

function freshness(date: string | null, submittedAt: string): string {
  const d = new Date(date ?? submittedAt);
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

const chip = "rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700";

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</h4>
      {/* Plain text only: React escapes it and whitespace is preserved with CSS. */}
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-800">{text}</p>
    </div>
  );
}

export default function ExperienceCard({ e }: { e: Experience }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold break-words">{e.role}</h3>
          <p className="text-sm text-stone-600">
            {e.experience_level} · {e.interview_date ? "Interviewed" : "Shared"} {freshness(e.interview_date, e.submitted_at)}
          </p>
        </div>
        <div className="text-sm">
          <Stars value={e.rating} /> <span className="text-stone-600">interview experience</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={chip}>Difficulty: {e.difficulty}</span>
        <span className={chip}>Outcome: {e.outcome}</span>
        {e.salary_bucket && <span className={chip}>CTC: {e.salary_bucket}</span>}
      </div>
      <Block title="Interview rounds" text={e.rounds} />
      <Block title="Questions asked" text={e.questions} />
      <Block title="Culture notes" text={e.culture_notes} />
    </article>
  );
}
