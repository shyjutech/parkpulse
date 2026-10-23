import { describe, expect, it } from "vitest";
import { FALLBACK_FEEDBACK, parseFeedback } from "./feedback";

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

  it("falls back on unparseable output instead of throwing", () => {
    expect(parseFeedback("not json at all")).toEqual(FALLBACK_FEEDBACK);
    expect(parseFeedback("")).toEqual(FALLBACK_FEEDBACK);
  });

  it("falls back when the JSON is valid but doesn't match the schema", () => {
    expect(parseFeedback(JSON.stringify({ strengths: "not an array", gaps: [], tips: [] }))).toEqual(FALLBACK_FEEDBACK);
    expect(parseFeedback(JSON.stringify({ strengths: ["ok"] }))).toEqual(FALLBACK_FEEDBACK); // missing keys
    expect(parseFeedback(JSON.stringify({ ...valid, tips: ["only one"] }))).toEqual(FALLBACK_FEEDBACK); // tips needs >= 2
  });

  it("never throws regardless of input", () => {
    expect(() => parseFeedback("{{{")).not.toThrow();
    expect(() => parseFeedback(JSON.stringify({ strengths: [1, 2], gaps: [], tips: [] }))).not.toThrow();
  });
});
