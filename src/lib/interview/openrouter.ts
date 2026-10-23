import type { ChatMessage } from "./prompt";

/** Missing/misconfigured env vars — distinct from a provider-side failure, so the route can respond differently. */
export class InterviewConfigError extends Error {}
/** OpenRouter reachable but returned an error, timed out, or sent something unusable. */
export class InterviewProviderError extends Error {}

/** Kept under the route's `maxDuration` so a timeout returns a clean JSON error instead of the platform killing the function mid-response. */
export const REQUEST_TIMEOUT_MS = 25_000;
export const MAX_REPLY_TOKENS = 400;

/** Fails clearly and immediately if either required env var is unset — no silent fallback to a guessed model name. */
export function requireOpenRouterEnv(): { apiKey: string; model: string } {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  const missing = [!apiKey && "OPENROUTER_API_KEY", !model && "OPENROUTER_MODEL"].filter(Boolean) as string[];
  if (missing.length > 0) {
    throw new InterviewConfigError(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
  return { apiKey: apiKey!, model: model! };
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

async function callOnce(messages: ChatMessage[], env: { apiKey: string; model: string }, opts: CallOptions): Promise<ChatCompletionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json",
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
      throw new InterviewProviderError(`OpenRouter responded ${res.status}: ${body.slice(0, 500)}`);
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new InterviewProviderError("OpenRouter returned an empty response");
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
    throw new InterviewProviderError(aborted ? "OpenRouter request timed out" : `OpenRouter request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/** One retry at most, on any failure. Throws InterviewConfigError immediately (no retry — retrying a missing env var can't help) or InterviewProviderError after both attempts fail. */
export async function callOpenRouter(messages: ChatMessage[], opts: CallOptions = {}): Promise<ChatCompletionResult> {
  const env = requireOpenRouterEnv();
  try {
    return await callOnce(messages, env, opts);
  } catch {
    return await callOnce(messages, env, opts);
  }
}
