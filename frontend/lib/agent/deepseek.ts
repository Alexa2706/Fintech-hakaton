import OpenAI from "openai";

// DeepSeek is OpenAI-compatible. This module is server-only (imported only by
// the API route) — the key never reaches the client. Model id is overridable
// via env in case the published id differs from the spec's "deepseek-v4-pro".
export const ds = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
});

export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";
