import { describe, expect, it } from "vitest";
import { parseFeedback } from "./feedback";

const valid = {
  strengths: ["Clear explanations"],
  gaps: ["Could go deeper on edge cases"],
  tips: ["Practice out loud", "Time yourself"],
};

describe("parseFeedback", () => {
  it("parses valid JSON", () => {
    expect(parseFeedback(JSON.stringify(valid))).toEqual(valid);
  });

  it("strips a markdown fence the model added anyway", () => {
    expect(parseFeedback("```json\n" + JSON.stringify(valid) + "\n```")).toEqual(valid);
    expect(parseFeedback("```\n" + JSON.stringify(valid) + "\n```")).toEqual(valid);
  });

  it("returns null (never a watered-down Feedback object) on unparseable output", () => {
    expect(parseFeedback("not json at all")).toBeNull();
    expect(parseFeedback("")).toBeNull();
  });

  it("returns null when the JSON is valid but doesn't match the schema", () => {
    expect(parseFeedback(JSON.stringify({ strengths: "not an array", gaps: [], tips: ["a", "b"] }))).toBeNull();
    expect(parseFeedback(JSON.stringify({ strengths: ["ok"] }))).toBeNull(); // missing keys
    expect(parseFeedback(JSON.stringify({ ...valid, tips: ["only one"] }))).toBeNull(); // tips needs >= 2
  });

  it("accepts empty strengths/gaps arrays -- a weak or flawless session may genuinely have none", () => {
    const noStrengths = { strengths: [], gaps: valid.gaps, tips: valid.tips };
    expect(parseFeedback(JSON.stringify(noStrengths))).toEqual(noStrengths);
    const noGaps = { strengths: valid.strengths, gaps: [], tips: valid.tips };
    expect(parseFeedback(JSON.stringify(noGaps))).toEqual(noGaps);
  });

  it("never throws regardless of input", () => {
    expect(() => parseFeedback("{{{")).not.toThrow();
    expect(() => parseFeedback(JSON.stringify({ strengths: [1, 2], gaps: [], tips: [] }))).not.toThrow();
  });
});
