import type { ChatMessage } from "./prompt";

// Provider-neutral: any OpenAI-compatible chat-completions endpoint works
// (OpenRouter, a direct OpenAI-compatible host, a self-hosted one, ...).
// AI_BASE_URL is the API root (e.g. "https://openrouter.ai/api/v1"); this
// module appends "/chat/completions" itself. All three env vars are
// required — there is no hardcoded default provider or model.

/** Missing/misconfigured env vars — distinct from a provider-side failure, so the route can respond differently. */
export class InterviewConfigError extends Error {}
/** Provider reachable but returned an error, timed out, or sent something unusable. */
export class InterviewProviderError extends Error {}

/** Kept under the route's `maxDuration` so a timeout returns a clean JSON error instead of the platform killing the function mid-response. */
export const REQUEST_TIMEOUT_MS = 25_000;
export const MAX_REPLY_TOKENS = 400;
/** Exactly one retry, so a single failing call never becomes two silent attempts stacked with the caller's own retry logic (there isn't any) — see docs/manual-test-checklist-interview.md. */
export const MAX_RETRIES = 1;

export interface AiEnv {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Fails clearly and immediately if any required env var is unset — no silent fallback to a guessed provider or model. */
export function requireAiEnv(): AiEnv {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  const missing = [!apiKey && "AI_API_KEY", !baseUrl && "AI_BASE_URL", !model && "AI_MODEL"].filter(Boolean) as string[];
  if (missing.length > 0) {
    throw new InterviewConfigError(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
  return { apiKey: apiKey!, baseUrl: baseUrl!.replace(/\/+$/, ""), model: model! };
}

export interface ChatCompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

interface CallOptions {
  jsonMode?: boolean;
  maxTokens?: number;
}

async function callOnce(messages: ChatMessage[], env: AiEnv, opts: CallOptions): Promise<ChatCompletionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter-specific informational headers; harmless no-ops on other
        // OpenAI-compatible providers, which simply ignore unknown headers.
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://parkpulse.vercel.app",
        "X-Title": "ParkPulse AI Interview",
      },
      body: JSON.stringify({
        model: env.model,
        messages,
        max_tokens: opts.maxTokens ?? MAX_REPLY_TOKENS,
        temperature: 0.7,
        ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new InterviewProviderError(`Provider responded ${res.status}: ${body.slice(0, 500)}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new InterviewProviderError("Provider returned an empty response");
    }
    return {
      content,
      inputTokens: Number(json?.usage?.prompt_tokens) || 0,
      outputTokens: Number(json?.usage?.completion_tokens) || 0,
      model: typeof json?.model === "string" ? json.model : env.model,
    };
  } catch (err) {
    if (err instanceof InterviewProviderError) throw err;
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new InterviewProviderError(aborted ? "Provider request timed out" : `Provider request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * At most MAX_RETRIES (1) retry on any failure — exactly one silent retry,
 * two attempts total, full stop. Nothing above this calls it twice: both
 * call sites in the respond route (question generation, feedback
 * generation) invoke this once per request and handle a thrown
 * InterviewProviderError themselves rather than retrying again.
 */
export async function callOpenRouter(messages: ChatMessage[], opts: CallOptions = {}): Promise<ChatCompletionResult> {
  const env = requireAiEnv();
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callOnce(messages, env, opts);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
