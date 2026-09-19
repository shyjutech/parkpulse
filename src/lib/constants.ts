export const PARKS = ["Infopark", "Technopark", "Cyberpark", "Other"] as const;
export const EXPERIENCE_LEVELS = ["Fresher", "0–2 years", "3–5 years", "6–10 years", "10+ years"] as const;
export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export const OUTCOMES = ["Offer", "Rejected", "No response", "Withdrew"] as const;
export const SALARY_TYPES = ["Current CTC", "Offered CTC", "Not disclosed"] as const;
export const SALARY_BUCKETS = [
  "Below ₹3L",
  "₹3L–₹5L",
  "₹5L–₹8L",
  "₹8L–₹12L",
  "₹12L–₹18L",
  "₹18L–₹25L",
  "₹25L+",
] as const;

export const MIN_LENGTHS = { rounds: 30, questions: 50, culture_notes: 50 } as const;
export const MAX_LENGTHS = { role: 100, rounds: 3000, questions: 5000, culture_notes: 3000 } as const;

export const PRIVACY_WARNING =
  "Your experience will be published anonymously after moderation. Do not include names, email addresses, phone numbers, manager names, client names, confidential company information, passwords, internal documents, or other personally identifying information.";

export const PAGE_SIZE = 10;
export const DIRECTORY_PAGE_SIZE = 20;

export const EVENT_NAMES = [
  "landing_view",
  "signin_completed",
  "company_view",
  "submit_started",
  "submit_completed",
  "unlock_completed",
  "full_company_view",
  "search_used",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];
