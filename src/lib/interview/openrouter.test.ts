import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  callOpenRouter,
  InterviewConfigError,
  InterviewProviderError,
  MAX_REPLY_TOKENS,
  MAX_RETRIES,
  requireAiEnv,
} from "./openrouter";

const ORIGINAL_ENV = { ...process.env };

function okResponse(content: string, overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 42, completion_tokens: 17 },
      model: "test/model-actually-used",
      ...overrides,
    }),
  };
}

function unauthorizedResponse() {
  return { ok: false, status: 401, text: async () => "Invalid API key" };
}

describe("requireAiEnv", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("fails clearly, naming exactly what's missing, when all three are unset", () => {
    process.env.AI_API_KEY = "";
    process.env.AI_BASE_URL = "";
    process.env.AI_MODEL = "";
    try {
      requireAiEnv();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InterviewConfigError);
      expect((e as Error).message).toContain("AI_API_KEY");
      expect((e as Error).message).toContain("AI_BASE_URL");
      expect((e as Error).message).toContain("AI_MODEL");
    }
  });

  it("fails clearly when only one is missing, naming just that one", () => {
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_BASE_URL = "https://example.com/v1";
    process.env.AI_MODEL = "";
    try {
      requireAiEnv();
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain("AI_MODEL");
      expect((e as Error).message).not.toContain("AI_API_KEY");
      expect((e as Error).message).not.toContain("AI_BASE_URL");
    }
  });

  it("does not hardcode a fallback provider or model when unset", () => {
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_BASE_URL = "";
    process.env.AI_MODEL = "";
    expect(() => requireAiEnv()).toThrow(InterviewConfigError);
  });

  it("succeeds when all three are set, and strips a trailing slash from the base URL", () => {
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_BASE_URL = "https://openrouter.ai/api/v1/";
    process.env.AI_MODEL = "openai/gpt-4o-mini";
    expect(requireAiEnv()).toEqual({ apiKey: "sk-test", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" });
  });
});

describe("callOpenRouter", () => {
  beforeEach(() => {
    process.env.AI_API_KEY = "sk-test";
    process.env.AI_BASE_URL = "https://example.com/v1";
    process.env.AI_MODEL = "openai/gpt-4o-mini";
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("throws InterviewConfigError immediately, without calling fetch, when env is missing", async () => {
    process.env.AI_MODEL = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(callOpenRouter([{ role: "user", content: "hi" }])).rejects.toThrow(InterviewConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns content and usage on a successful first call, with no retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("What is a widget?"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await callOpenRouter([{ role: "user", content: "hi" }]);
    expect(result).toEqual({ content: "What is a widget?", inputTokens: 42, outputTokens: 17, model: "test/model-actually-used" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("calls the configured base URL's /chat/completions, with the configured model, a bounded max_tokens, and the message list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await callOpenRouter([{ role: "user", content: "hi" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("openai/gpt-4o-mini");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(body.max_tokens).toBe(MAX_REPLY_TOKENS);
    expect(body.response_format).toBeUndefined();
  });

  it("requests json mode when asked", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await callOpenRouter([{ role: "user", content: "hi" }], { jsonMode: true, maxTokens: 900 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBe(900);
  });

  it("MAX_RETRIES is exactly 1 (one silent retry, two attempts total, never more)", () => {
    expect(MAX_RETRIES).toBe(1);
  });

  it("retries exactly once on a failed first attempt, then succeeds — two attempts total, not three", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network blip")).mockResolvedValueOnce(okResponse("second try worked"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await callOpenRouter([{ role: "user", content: "hi" }]);
    expect(result.content).toBe("second try worked");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws InterviewProviderError after both attempts fail, having called fetch exactly twice", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callOpenRouter([{ role: "user", content: "hi" }])).rejects.toThrow(InterviewProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a wrong/invalid API key (401) is treated as a failure, retried once, then reported cleanly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthorizedResponse());
    vi.stubGlobal("fetch", fetchMock);
    await expect(callOpenRouter([{ role: "user", content: "hi" }])).rejects.toThrow(InterviewProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a non-2xx response as a failure (and retries once)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(callOpenRouter([{ role: "user", content: "hi" }])).rejects.toThrow(InterviewProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats an empty/missing content field as a failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("   "));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callOpenRouter([{ role: "user", content: "hi" }])).rejects.toThrow(InterviewProviderError);
  });

  it("never throws a raw, unwrapped error type to the caller", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(callOpenRouter([{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(InterviewProviderError);
  });
});
