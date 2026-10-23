/** Clamped, always-finite parse of AI_INTERVIEW_MAX_QUESTIONS. Defaults to 6. */
export function maxQuestions(): number {
  const raw = Number(process.env.AI_INTERVIEW_MAX_QUESTIONS);
  if (!Number.isFinite(raw) || raw < 1) return 6;
  return Math.min(Math.floor(raw), 15);
}

export const MAX_ANSWER_CHARS = 2000;
export const MAX_SKILLS_CHARS = 500;
