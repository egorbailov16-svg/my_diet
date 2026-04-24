import { collectResponse, NVIDIA_MODEL } from "@/services/llmClient";

const DEFAULT_MODEL = NVIDIA_MODEL;
const FALLBACK_MODELS: readonly string[] = [];

export type GeminiCallOptions = {
  prompt: string;
};

export type GeminiCallResult = {
  ok: boolean;
  text?: string;
  errorMessage?: string;
  usedModel: string;
  providerId: "nvidia";
};

export async function callGemini(options: GeminiCallOptions): Promise<GeminiCallResult> {
  try {
    const response = await collectResponse([{ role: "user", content: options.prompt }]);
    return {
      ok: true,
      text: response.mergedText,
      usedModel: response.model,
      providerId: "nvidia",
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : "LLM request failed",
      usedModel: DEFAULT_MODEL,
      providerId: "nvidia",
    };
  }
}

export { DEFAULT_MODEL, FALLBACK_MODELS };

export function safeParseJson<T>(text: string): T | null {
  if (!text) return null;
  const trimmed = text.trim();
  const candidate = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
    : trimmed;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
