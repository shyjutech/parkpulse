import { describe, expect, it } from "vitest";
import { detectPii, detectSpam, monthToDate, validateSubmission, type SubmissionInput } from "./validation";

const valid: SubmissionInput = {
  company_id: "c1",
  new_company_name: "",
  new_company_park: "",
  role: "Flutter Developer",
  experience_level: "3–5 years",
  interview_date: "2026-01",
  questions: "They asked about widget lifecycle, state management with Bloc, and Dart isolates.",
  rounds: "Three rounds: an online screening, a technical discussion and an HR round.",
  difficulty: "Medium",
  outcome: "Offer",
  salary_type: "Offered CTC",
  salary_bucket: "₹8L–₹12L",
  rating: "4",
  culture_notes: "Friendly interviewers, quick feedback and clear communication of the timeline.",
  acknowledged: true,
};

const minimal: SubmissionInput = {
  ...valid,
  questions: "System design and DSA",
  rounds: "",
  difficulty: "",
  outcome: "",
  salary_type: "",
  salary_bucket: "",
  rating: "",
  culture_notes: "",
};

describe("detectPii", () => {
  it.each([
    ["mail me at jane.doe@gmail.com", ["email"]],
    ["reach jane [at] gmail.com", ["email"]],
    ["call +91 98765 43210", ["phone"]],
    ["call 9876543210 anytime", ["phone"]],
    ["see https://example.com/x", ["url"]],
    ["visit www.foo.bar now", ["url"]],
    ["check bit.ly/abc", ["url"]],
    ["portfolio at mysite.io", ["url"]],
  ])("flags %s", (text, kinds) => {
    expect(detectPii(text)).toEqual(kinds);
  });

  it.each([
    "They asked about ASP.NET and Node.js internals",
    "Spring Boot, React.js, 2 rounds, 45 minutes each, CTC around 8 LPA",
    "Joined in 2024 and the drive had 120 candidates",
  ])("does not flag %s", (text) => {
    expect(detectPii(text)).toEqual([]);
  });
});

describe("detectSpam", () => {
  it("catches repeated characters and mashing", () => {
    expect(detectSpam("aaaaaaaaaaaaaaaaaaaaaaaa", 3)).toBeTruthy();
    expect(detectSpam("asdf asdf asdf asdf asdf asdf", 3)).toBeTruthy();
  });
  it("catches promotions", () => {
    expect(detectSpam("Join our telegram group for free referral code and jobs", 3)).toBeTruthy();
  });
  it("catches repetition and too-few-words", () => {
    expect(detectSpam("good good good good good good good good good", 3)).toBeTruthy();
    expect(detectSpam("ok fine", 3)).toBeTruthy();
  });
  it("accepts a concise but genuine answer", () => {
    expect(detectSpam("Two rounds: DSA on a whiteboard, then a system design chat.", 3)).toBeNull();
  });
});

describe("validateSubmission", () => {
  const today = new Date("2026-06-15");

  it("accepts a fully filled submission", () => {
    expect(validateSubmission(valid, today)).toEqual({});
  });

  it("accepts a submission with only the required fields", () => {
    expect(validateSubmission(minimal, today)).toEqual({});
  });

  it("requires the privacy acknowledgement", () => {
    expect(validateSubmission({ ...minimal, acknowledged: false }, today).acknowledged).toBeTruthy();
  });

  it("requires role, level, interview month and a question/topic", () => {
    const e = validateSubmission({ ...minimal, role: "", experience_level: "", interview_date: "", questions: "" }, today);
    expect(Object.keys(e).sort()).toEqual(["experience_level", "interview_date", "questions", "role"]);
  });

  it("enforces minimum length only on text that was provided", () => {
    expect(validateSubmission({ ...minimal, questions: "short" }, today).questions).toBeTruthy();
    expect(validateSubmission({ ...minimal, rounds: "brief" }, today).rounds).toBeTruthy();
    expect(validateSubmission({ ...minimal, rounds: "", culture_notes: "" }, today)).toEqual({});
  });

  it("requires a salary bucket only when a salary type is chosen", () => {
    expect(validateSubmission({ ...minimal, salary_type: "Offered CTC" }, today).salary_bucket).toBeTruthy();
    expect(validateSubmission({ ...minimal, salary_type: "Not disclosed" }, today)).toEqual({});
    expect(validateSubmission({ ...minimal, salary_type: "Offered CTC", salary_bucket: "₹5L–₹8L" }, today)).toEqual({});
  });

  it("requires a new company name and park when no company is selected", () => {
    const e = validateSubmission({ ...minimal, company_id: "" }, today);
    expect(e.new_company_name).toBeTruthy();
    expect(e.new_company_park).toBeTruthy();
  });

  it("rejects PII in any free text, including optional fields", () => {
    expect(validateSubmission({ ...valid, culture_notes: valid.culture_notes + " Email hr@corp.com for details." }, today).culture_notes).toMatch(/email/);
    expect(validateSubmission({ ...minimal, rounds: "Call 9876543210 for the schedule details" }, today).rounds).toMatch(/phone/);
  });

  it("rejects future or malformed interview months and bad enums", () => {
    expect(validateSubmission({ ...minimal, interview_date: "2026-07" }, today).interview_date).toMatch(/future/);
    expect(validateSubmission({ ...minimal, interview_date: "2026-06" }, today).interview_date).toBeUndefined();
    expect(validateSubmission({ ...minimal, interview_date: "2026-13" }, today).interview_date).toBeTruthy();
    const e = validateSubmission({ ...minimal, rating: "9", difficulty: "Impossible" }, today);
    expect(e.rating && e.difficulty).toBeTruthy();
  });
});

describe("monthToDate", () => {
  it("converts month input to a first-of-month date", () => {
    expect(monthToDate("2026-03")).toBe("2026-03-01");
    expect(monthToDate("")).toBeNull();
    expect(monthToDate("2026-3")).toBeNull();
  });
});
