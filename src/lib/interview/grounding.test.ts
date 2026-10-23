import { describe, expect, it } from "vitest";
import { planNextTurn } from "./grounding";

describe("planNextTurn", () => {
  const grounding = [{ text: "Q1 real" }, { text: "Q2 real" }];

  it("serves grounding questions first, in order, verbatim", () => {
    expect(planNextTurn(0, grounding, 6)).toEqual({ kind: "grounded", question: "Q1 real", index: 0 });
    expect(planNextTurn(1, grounding, 6)).toEqual({ kind: "grounded", question: "Q2 real", index: 1 });
  });

  it("falls back to generic once grounding is exhausted", () => {
    expect(planNextTurn(2, grounding, 6)).toEqual({ kind: "generic" });
    expect(planNextTurn(5, grounding, 6)).toEqual({ kind: "generic" });
  });

  it("is entirely generic when there is no grounding data", () => {
    expect(planNextTurn(0, [], 6)).toEqual({ kind: "generic" });
  });

  it("is done once the question cap is reached, even with unused grounding left", () => {
    expect(planNextTurn(6, grounding, 6)).toEqual({ kind: "done" });
    expect(planNextTurn(1, [{ text: "a" }, { text: "b" }, { text: "c" }], 1)).toEqual({ kind: "done" });
  });
});
