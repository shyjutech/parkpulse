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

export const MIN_LENGTHS = { rounds: 15, questions: 10, culture_notes: 15 } as const;
export const MAX_LENGTHS = { role: 100, rounds: 3000, questions: 5000, culture_notes: 3000 } as const;

export const PRIVACY_WARNING =
  "Your experience will be published anonymously after moderation. Do not include names, email addresses, phone numbers, manager names, client names, confidential company information, passwords, internal documents, or other personally identifying information.";

export const PAGE_SIZE = 10;
export const DIRECTORY_PAGE_SIZE = 20;

export const RECENCY_OPTIONS = [
  { value: "", label: "Any time", months: 0 },
  { value: "3m", label: "Last 3 months", months: 3 },
  { value: "12m", label: "Last 12 months", months: 12 },
  { value: "24m", label: "Last 2 years", months: 24 },
] as const;

export const LAUNCH_GOAL = 50;
export const INSTAGRAM_HANDLE = "shyju.tech";

export const PRIVACY_SUMMARY =
  "When you sign in with Google we collect your name and email so we can prevent abuse and let you save and follow. These details are never displayed publicly, and reports never show who wrote them.";
export const MODERATION_NOTE =
  "Moderators review reports for policy issues and personal details before they appear. Reviewed does not mean verified: we can't confirm that any experience is accurate.";

export const STARTER_CHECKLIST = [
  "Read the job description and note the key skills",
  "Revise the core topics for the role",
  "Read experiences reported by other candidates",
  "Prepare 2–3 questions to ask the interviewer",
  "Get documents and travel or meeting link ready",
] as const;

export const EVENT_NAMES = [
  "landing_view",
  "signin_completed",
  "company_view",
  "submit_started",
  "submit_completed",
  "unlock_completed",
  "full_company_view",
  "search_used",
  "visit",
  "campaign_view",
  "save_added",
  "follow_added",
  "checklist_created",
  "experience_requested",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];
