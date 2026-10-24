import { z } from "zod";

export const FeedbackSchema = z.object({
  // No minimum on strengths/gaps: a candidate who answers "I don't know"
  // throughout genuinely has zero strengths, and one who answers everything
  // well genuinely has zero gaps — the model reporting that honestly must
  // not fail validation and fall back to "feedback wasn't available"
  // (confirmed live: real model output was `strengths: []` for an
  // all-"I don't know" transcript, which used to be rejected here).
  strengths: z.array(z.string().min(1).max(300)).max(5),
  gaps: z.array(z.string().min(1).max(300)).max(5),
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
