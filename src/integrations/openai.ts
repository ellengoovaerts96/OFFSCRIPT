import OpenAI from "openai";

export const openaiModel = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const OPENAI_REQUEST_TIMEOUT_MS = 20_000;

export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAIClient(options?: { timeoutMs?: number; maxRetries?: number }): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: options?.timeoutMs ?? OPENAI_REQUEST_TIMEOUT_MS,
    maxRetries: options?.maxRetries ?? 1
  });
}
