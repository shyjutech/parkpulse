import { z } from "zod";

export const FeedbackSchema = z.object({
  strengths: z.array(z.string().min(1).max(300)).min(1).max(5),
  gaps: z.array(z.string().min(1).max(300)).min(1).max(5),
  tips: z.array(z.string().min(1).max(300)).min(2).max(5),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

/** Used when the model's output can't be parsed/validated. Still a complete, honest response — it just says so. */
export const FALLBACK_FEEDBACK: Feedback = {
  strengths: ["You completed the practice interview."],
  gaps: ["We couldn't generate detailed feedback for this session."],
  tips: [
    "Review your own answers and think about what you'd add.",
    "Compare your experience with real candidate reports on the company's page.",
  ],
};

/** Best-effort: strips a stray markdown fence if the model added one anyway, then validates against the schema. Never throws. */
export function parseFeedback(raw: string): Feedback {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return FALLBACK_FEEDBACK;
  }
  const result = FeedbackSchema.safeParse(parsed);
  return result.success ? result.data : FALLBACK_FEEDBACK;
}
