export interface Company {
  id: string;
  name: string;
  slug: string;
  park: string;
  verified: boolean;
  review_count: number;
  avg_rating: number;
  latest_report_on: string | null;
}

/** Public, anonymous experience. Deliberately has no author fields. Optional answers may be null. */
export interface Experience {
  id: string;
  role: string;
  experience_level: string;
  interview_date: string | null;
  rounds: string | null;
  questions: string;
  difficulty: string | null;
  outcome: string | null;
  salary_bucket: string | null;
  rating: number | null;
  culture_notes: string | null;
  submitted_at: string;
}

export interface ExperienceWithCompany extends Experience {
  company_name: string;
  company_slug: string;
}

export const EXPERIENCE_COLUMNS =
  "id, role, experience_level, interview_date, rounds, questions, difficulty, outcome, salary_bucket, rating, culture_notes, submitted_at";
export const COMPANY_COLUMNS = "id, name, slug, park, verified, review_count, avg_rating, latest_report_on";

/** Honest wording for how much a set of reports can tell you. */
export function sampleNote(n: number): string {
  if (n === 0) return "No approved reports yet.";
  if (n < 5) return `Based on ${n} ${n === 1 ? "report" : "reports"}. Treat this as anecdotal: individual experiences vary a lot.`;
  if (n < 15) return `Based on ${n} reports. That's a small sample, so patterns may not be typical.`;
  return `Based on ${n} reports. These are self-reported and unverified.`;
}
