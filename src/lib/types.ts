export interface Company {
  id: string;
  name: string;
  slug: string;
  park: string;
  verified: boolean;
  review_count: number;
  avg_rating: number;
}

/** Public, anonymous experience. Deliberately has no author fields. */
export interface Experience {
  id: string;
  role: string;
  experience_level: string;
  interview_date: string | null;
  rounds: string;
  questions: string;
  difficulty: string;
  outcome: string;
  salary_bucket: string | null;
  rating: number;
  culture_notes: string;
  submitted_at: string;
}

export const EXPERIENCE_COLUMNS =
  "id, role, experience_level, interview_date, rounds, questions, difficulty, outcome, salary_bucket, rating, culture_notes, submitted_at";
export const COMPANY_COLUMNS = "id, name, slug, park, verified, review_count, avg_rating";
