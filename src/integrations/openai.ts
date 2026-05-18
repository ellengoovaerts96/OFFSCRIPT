import OpenAI from "openai";

export const openaiModel = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}
