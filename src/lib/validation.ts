import {
  DIFFICULTIES,
  EXPERIENCE_LEVELS,
  MAX_LENGTHS,
  MIN_LENGTHS,
  OUTCOMES,
  PARKS,
  SALARY_BUCKETS,
  SALARY_TYPES,
} from "./constants";

// ---------------------------------------------------------------------------
// PII + spam heuristics. These are safeguards, not a replacement for moderation.
// ---------------------------------------------------------------------------

const EMAIL = /[a-z0-9._%+-]+\s?(?:@|\[at\]|\(at\))\s?[a-z0-9-]+(?:\.|\s?\[dot\]\s?)[a-z]{2,}/i;
// +91 / 0 prefixed or bare Indian mobile numbers, plus any 10+ digit run with separators.
const PHONE = /(?:\+?\d{1,3}[\s-]?)?(?:\(?0?\)?[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|\b\d(?:[\s.-]?\d){9,}\b/;
// ".net" is deliberately excluded so "ASP.NET" is not flagged.
const URL_LIKE =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|in|io|org|co|me|ly|app|dev|xyz|info|link|page)(?:\/\S*)?\b/i;

export type PiiKind = "email" | "phone" | "url";

export function detectPii(text: string): PiiKind[] {
  const found: PiiKind[] = [];
  if (EMAIL.test(text)) found.push("email");
  if (PHONE.test(text)) found.push("phone");
  // Remove emails first so an address's domain isn't also reported as a link.
  if (URL_LIKE.test(text.replace(new RegExp(EMAIL, "gi"), " "))) found.push("url");
  return found;
}

const PROMO =
  /\b(whatsapp me|dm me|telegram|click here|buy now|earn (?:money|₹|rs)|referral code|promo code|join (?:our|my)|subscribe|follow me|limited offer|work from home and earn|100% (?:guarantee|placement))\b/i;
const KEYBOARD_MASH = /(asdf|qwer|zxcv|hjkl|lorem ipsum|test test|blah blah)/i;

/** Returns a human-readable reason if the text looks like spam/garbage, else null. */
export function detectSpam(text: string, minDistinctWords: number): string | null {
  const t = text.trim();
  if (/(.)\1{7,}/.test(t)) return "Please avoid long runs of repeated characters.";
  if (PROMO.test(t)) return "This looks promotional. ParkPulse only accepts genuine interview experiences.";
  if (KEYBOARD_MASH.test(t)) return "This doesn't look like a real answer. Please describe what actually happened.";
  const words = t.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  const distinct = new Set(words);
  if (distinct.size < minDistinctWords) return "Please add a little more detail so this is useful to others.";
  if (words.length >= 8) {
    const top = Math.max(...[...distinct].map((w) => words.filter((x) => x === w).length));
    if (top / words.length > 0.5) return "This text repeats the same word too often.";
  }
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  if (letters / t.length < 0.5) return "Please write in sentences rather than symbols or numbers.";
  return null;
}

// ---------------------------------------------------------------------------
// Submission validation (used by the form for instant feedback and, as the
// authoritative check, by the server action).
// Required: company, role, experience band, interview month, and one
// question/topic/short description. Everything else is optional.
// ---------------------------------------------------------------------------

export interface SubmissionInput {
  company_id: string;
  new_company_name: string;
  new_company_park: string;
  role: string;
  experience_level: string;
  /** Interview month as "YYYY-MM" (from <input type="month">). */
  interview_date: string;
  /** The one required free-text field: a question, topic or short description. */
  questions: string;
  rounds: string;
  difficulty: string;
  outcome: string;
  salary_type: string;
  salary_bucket: string;
  rating: string;
  culture_notes: string;
  acknowledged: boolean;
}

export type FieldErrors = Partial<Record<keyof SubmissionInput, string>>;

const oneOf = (list: readonly string[], v: string) => list.includes(v);

function piiMessage(kinds: PiiKind[]): string {
  const labels = { email: "an email address", phone: "a phone number", url: "a link or website" };
  return `This looks like it contains ${kinds.map((k) => labels[k]).join(" and ")}. Please remove it before submitting.`;
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** "YYYY-MM" -> "YYYY-MM-01" for the date column; null when empty. */
export function monthToDate(month: string): string | null {
  return MONTH.test(month) ? `${month}-01` : null;
}

function checkText(
  e: FieldErrors,
  field: "rounds" | "questions" | "culture_notes",
  value: string,
  required: boolean,
  minWords: number,
) {
  const v = value.trim();
  if (!v) {
    if (required) e[field] = "Add one question, topic or a short description of what happened.";
    return;
  }
  if (v.length < MIN_LENGTHS[field]) {
    e[field] = `Please write at least ${MIN_LENGTHS[field]} characters (${v.length} so far).`;
    return;
  }
  if (v.length > MAX_LENGTHS[field]) {
    e[field] = `Please keep this under ${MAX_LENGTHS[field]} characters.`;
    return;
  }
  const pii = detectPii(v);
  const spam = detectSpam(v, minWords);
  if (pii.length) e[field] = piiMessage(pii);
  else if (spam) e[field] = spam;
}

export function validateSubmission(input: SubmissionInput, today = new Date()): FieldErrors {
  const e: FieldErrors = {};

  if (!input.company_id) {
    const name = input.new_company_name.trim();
    if (name.length < 2 || name.length > 120) e.new_company_name = "Enter the company name (2–120 characters), or pick one from the list.";
    else if (detectPii(name).length) e.new_company_name = "Company name shouldn't contain links or contact details.";
    if (!oneOf(PARKS, input.new_company_park)) e.new_company_park = "Choose where the company is located.";
  }

  const role = input.role.trim();
  if (role.length < 2) e.role = "Enter the role you interviewed for.";
  else if (role.length > MAX_LENGTHS.role) e.role = `Keep the role under ${MAX_LENGTHS.role} characters.`;
  else if (detectPii(role).length) e.role = piiMessage(detectPii(role));

  if (!oneOf(EXPERIENCE_LEVELS, input.experience_level)) e.experience_level = "Choose your experience level.";

  const m = MONTH.exec(input.interview_date);
  if (!m) e.interview_date = "Choose the month of the interview.";
  else {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const cur = today.getUTCFullYear() * 12 + today.getUTCMonth();
    if (y * 12 + (mo - 1) > cur) e.interview_date = "The interview month can't be in the future.";
    else if (y < 2010) e.interview_date = "Please enter a more recent interview.";
  }

  checkText(e, "questions", input.questions, true, 2);
  checkText(e, "rounds", input.rounds, false, 3);
  checkText(e, "culture_notes", input.culture_notes, false, 3);

  // Optional structured answers: only validated when provided.
  if (input.difficulty && !oneOf(DIFFICULTIES, input.difficulty)) e.difficulty = "Choose how difficult it was.";
  if (input.outcome && !oneOf(OUTCOMES, input.outcome)) e.outcome = "Choose the outcome.";
  if (input.salary_type && !oneOf(SALARY_TYPES, input.salary_type)) e.salary_type = "Choose what the salary represents.";
  else if (input.salary_type && input.salary_type !== "Not disclosed" && !oneOf(SALARY_BUCKETS, input.salary_bucket))
    e.salary_bucket = "Choose the annual CTC range, or leave the salary blank.";
  if (input.rating) {
    const rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) e.rating = "Choose a rating from 1 to 5.";
  }

  if (!input.acknowledged) e.acknowledged = "Please confirm before submitting.";

  return e;
}
