import Link from "next/link";
import { toggleSave } from "@/app/actions";
import { fullDate, monthYear } from "@/lib/nav";
import type { Experience } from "@/lib/types";
import Stars from "./Stars";

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

export interface SaveState {
  signedIn: boolean;
  saved: boolean;
  /** Path to return to after signing in or toggling. */
  next: string;
}

function SaveButton({ id, state }: { id: string; state: SaveState }) {
  const cls =
    "min-h-11 rounded-md border px-3 text-sm " +
    (state.saved ? "border-brand-700 bg-brand-50 text-brand-800" : "border-stone-300 text-stone-700 hover:border-brand-600");
  if (!state.signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(state.next)}`} className={`${cls} inline-flex items-center`}>
        Sign in to save
      </Link>
    );
  }
  return (
    <form action={toggleSave}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="saved" value={state.saved ? "1" : "0"} />
      <input type="hidden" name="next" value={state.next} />
      <button className={cls} aria-pressed={state.saved}>{state.saved ? "★ Saved" : "☆ Save"}</button>
    </form>
  );
}

export default function ExperienceCard({
  e,
  company,
  save,
  preview = false,
}: {
  e: Experience;
  company?: { name: string; slug: string };
  save?: SaveState;
  preview?: boolean;
}) {
  const interviewed = monthYear(e.interview_date);
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
      {company && (
        <Link href={`/company/${company.slug}`} className="mb-1 inline-block text-sm font-medium text-brand-700 hover:underline">
          {company.name}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold break-words">{e.role}</h3>
          <p className="text-sm text-stone-600">{e.experience_level}</p>
        </div>
        {e.rating ? (
          <div className="text-sm">
            <Stars value={e.rating} /> <span className="text-stone-600">interview experience</span>
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-stone-500">
        {interviewed && <>Interviewed <strong className="font-medium text-stone-700">{interviewed}</strong></>}
        {interviewed && !preview && " · "}
        {!preview && <>Posted {fullDate(e.submitted_at)}</>}
      </p>

      {(e.difficulty || e.outcome || e.salary_bucket) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {e.difficulty && <span className={chip}>Difficulty: {e.difficulty}</span>}
          {e.outcome && <span className={chip}>Outcome: {e.outcome}</span>}
          {e.salary_bucket && <span className={chip}>CTC: {e.salary_bucket}</span>}
        </div>
      )}
      <Block title="Question, topic or summary" text={e.questions} />
      {e.rounds && <Block title="Interview rounds" text={e.rounds} />}
      {e.culture_notes && <Block title="Culture notes" text={e.culture_notes} />}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
        <p className="text-xs text-stone-500">
          {preview ? "Preview only. Nothing has been submitted yet." : "Reviewed by moderators. Not verified."}
        </p>
        {save && !preview && <SaveButton id={e.id} state={save} />}
      </div>
    </article>
  );
}
