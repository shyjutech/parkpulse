import { describe, expect, it } from "vitest";
import { detectPii, detectSpam, validateSubmission, type SubmissionInput } from "./validation";

const valid: SubmissionInput = {
  company_id: "c1",
  new_company_name: "",
  new_company_park: "",
  role: "Flutter Developer",
  experience_level: "3–5 years",
  interview_date: "2026-01-10",
  rounds: "Three rounds: an online screening, a technical discussion and an HR round.",
  questions: "They asked about widget lifecycle, state management with Bloc, and Dart isolates.",
  difficulty: "Medium",
  outcome: "Offer",
  salary_type: "Offered CTC",
  salary_bucket: "₹8L–₹12L",
  rating: "4",
  culture_notes: "Friendly interviewers, quick feedback and clear communication of the timeline.",
  acknowledged: true,
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
  it("accepts a valid submission", () => {
    expect(validateSubmission(valid, new Date("2026-06-01"))).toEqual({});
  });

  it("requires the privacy acknowledgement", () => {
    expect(validateSubmission({ ...valid, acknowledged: false }).acknowledged).toBeTruthy();
  });

  it("enforces minimum lengths", () => {
    const e = validateSubmission({ ...valid, rounds: "short", questions: "short", culture_notes: "short" });
    expect(Object.keys(e).sort()).toEqual(["culture_notes", "questions", "rounds"]);
  });

  it("requires a salary bucket unless not disclosed", () => {
    expect(validateSubmission({ ...valid, salary_bucket: "" }).salary_bucket).toBeTruthy();
    expect(validateSubmission({ ...valid, salary_type: "Not disclosed", salary_bucket: "" })).toEqual({});
  });

  it("requires a new company name and park when no company is selected", () => {
    const e = validateSubmission({ ...valid, company_id: "" });
    expect(e.new_company_name).toBeTruthy();
    expect(e.new_company_park).toBeTruthy();
  });

  it("rejects PII in free text", () => {
    const e = validateSubmission({ ...valid, culture_notes: valid.culture_notes + " Email hr@corp.com for details." });
    expect(e.culture_notes).toMatch(/email/);
  });

  it("rejects out-of-range enums and future dates", () => {
    const e = validateSubmission({ ...valid, rating: "9", difficulty: "Impossible", interview_date: "2030-01-01" }, new Date("2026-06-01"));
    expect(e.rating && e.difficulty && e.interview_date).toBeTruthy();
  });
});
