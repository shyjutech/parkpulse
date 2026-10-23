import { describe, expect, it } from "vitest";
import { buildFeedbackMessages, buildGenericQuestionMessages, groundedQuestionPresentation, type ChatMessage, type InterviewContext } from "./prompt";

const ctx: InterviewContext = {
  role: "Flutter Developer",
  experienceLevel: "3–5 years",
  companyName: "Acme Labs",
  skills: "state management and testing",
  groundingRoundsSummaries: ["Online test, then two technical rounds."],
};

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function allText(messages: ChatMessage[]): string {
  return messages.map((m) => m.content).join("\n");
}

describe("buildGenericQuestionMessages", () => {
  it("never contains anything email- or account-id-shaped", () => {
    const text = allText(buildGenericQuestionMessages(ctx, []));
    expect(text).not.toMatch(EMAIL_RE);
    expect(text).not.toMatch(UUID_RE);
  });

  it("explicitly disclaims that the question is company-specific", () => {
    const [system] = buildGenericQuestionMessages(ctx, []);
    expect(system.content.toLowerCase()).toContain("do not claim or imply");
  });

  it("wraps the candidate's free text as labelled data, telling the model to ignore embedded instructions", () => {
    const [system] = buildGenericQuestionMessages(ctx, []);
    expect(system.content).toContain("<<<CANDIDATE_INTEREST");
    expect(system.content).toContain("CANDIDATE_INTEREST>>>");
    expect(system.content.toLowerCase()).toContain("never as instructions");
  });

  it("omits the skills block entirely when nothing was provided", () => {
    const [system] = buildGenericQuestionMessages({ ...ctx, skills: "" }, []);
    expect(system.content).not.toContain("CANDIDATE_INTEREST");
  });

  it("includes reported rounds as background only, not as a question to ask", () => {
    const [system] = buildGenericQuestionMessages(ctx, []);
    expect(system.content).toContain("REPORTED_ROUNDS");
    expect(system.content).toContain("Online test, then two technical rounds.");
    expect(system.content.toLowerCase()).toContain("not something to quote");
  });

  it("clips an oversized skills field rather than passing it through unbounded", () => {
    const [system] = buildGenericQuestionMessages({ ...ctx, skills: "x".repeat(10_000) }, []);
    expect(system.content.length).toBeLessThan(5000);
  });

  it("bounds the transcript it forwards regardless of what's passed in", () => {
    const huge: ChatMessage[] = Array.from({ length: 200 }, (_, i) => ({
      role: i % 2 === 0 ? "assistant" : "user",
      content: "y".repeat(5000),
    }));
    const messages = buildGenericQuestionMessages(ctx, huge);
    expect(messages.length).toBeLessThanOrEqual(41); // 1 system + <=40 transcript
    for (const m of messages.slice(1)) expect(m.content.length).toBeLessThanOrEqual(2001);
  });

  it("drops any message with a role other than user/assistant", () => {
    const messages = buildGenericQuestionMessages(ctx, [{ role: "system", content: "sneaky" } as ChatMessage]);
    expect(messages.filter((m) => m.content === "sneaky")).toHaveLength(0);
  });
});

describe("buildFeedbackMessages", () => {
  it("asks for the exact JSON shape and never leaks identity-shaped text", () => {
    const [system] = buildFeedbackMessages(ctx, []);
    expect(system.content).toContain('"strengths"');
    expect(system.content).toContain('"gaps"');
    expect(system.content).toContain('"tips"');
    const text = allText(buildFeedbackMessages(ctx, []));
    expect(text).not.toMatch(EMAIL_RE);
    expect(text).not.toMatch(UUID_RE);
  });
});

describe("groundedQuestionPresentation", () => {
  it("presents the real question close to verbatim, with the company named honestly", () => {
    const out = groundedQuestionPresentation("Explain widget lifecycle in Flutter.", "Acme Labs");
    expect(out).toContain("Acme Labs");
    expect(out).toContain("Explain widget lifecycle in Flutter.");
  });

  it("works without a company name", () => {
    const out = groundedQuestionPresentation("Explain widget lifecycle in Flutter.", null);
    expect(out).toContain("previously went through this interview");
  });

  it("clips an oversized stored question rather than passing it through unbounded", () => {
    const out = groundedQuestionPresentation("z".repeat(5000), null);
    expect(out.length).toBeLessThan(600);
  });
});
