const DEFAULT_MODEL = "gemini-2.0-flash";

export type GeminiCallOptions = {
  prompt: string;
  apiKey?: string;
  model?: string;
  responseMimeType?: "application/json" | "text/plain";
  temperature?: number;
  maxOutputTokens?: number;
};

export type GeminiCallResult = {
  ok: boolean;
  text?: string;
  errorMessage?: string;
  usedModel: string;
  providerId: "google-gemini";
};

function pickApiKey(explicit?: string): string | null {
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const env =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_AI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    "";
  return env.trim().length > 0 ? env.trim() : null;
}

function buildEndpoint(model: string, key: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
}

export async function callGemini(options: GeminiCallOptions): Promise<GeminiCallResult> {
  const apiKey = pickApiKey(options.apiKey);
  const model = options.model?.trim() || DEFAULT_MODEL;
  if (!apiKey) {
    return {
      ok: false,
      errorMessage: "GEMINI_API_KEY is not configured",
      usedModel: model,
      providerId: "google-gemini",
    };
  }

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: options.prompt }],
      },
    ],
    generationConfig: {
      temperature: options.temperature ?? 0.4,
      maxOutputTokens: options.maxOutputTokens ?? 1200,
      responseMimeType: options.responseMimeType ?? "application/json",
    },
  };

  try {
    const response = await fetch(buildEndpoint(model, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        errorMessage: `Gemini ${response.status}: ${detail.slice(0, 200)}`,
        usedModel: model,
        providerId: "google-gemini",
      };
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text ?? "")
      .join("")
      .trim();

    if (!text) {
      return {
        ok: false,
        errorMessage: "Gemini returned empty response",
        usedModel: model,
        providerId: "google-gemini",
      };
    }

    return {
      ok: true,
      text,
      usedModel: model,
      providerId: "google-gemini",
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : "Gemini request failed",
      usedModel: model,
      providerId: "google-gemini",
    };
  }
}

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
