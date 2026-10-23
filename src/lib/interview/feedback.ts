import { z } from "zod";

export const FeedbackSchema = z.object({
  strengths: z.array(z.string().min(1).max(300)).min(1).max(5),
  gaps: z.array(z.string().min(1).max(300)).min(1).max(5),
  tips: z.array(z.string().min(1).max(300)).min(2).max(5),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

/**
 * Best-effort: strips a stray markdown fence if the model added one anyway,
 * then validates against the schema. Returns `null` — never a watered-down
 * Feedback object — when the model's output can't be parsed or validated, so
 * the caller is forced to render a distinct "feedback wasn't available"
 * state rather than something that reads like a real (if thin) assessment.
 */
export function parseFeedback(raw: string): Feedback | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const result = FeedbackSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
