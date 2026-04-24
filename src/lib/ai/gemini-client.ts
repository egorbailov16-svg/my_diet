const DEFAULT_MODEL = "gemini-2.0-flash";
const FALLBACK_MODELS = ["gemini-2.0-flash-lite", "gemini-1.5-flash-latest"] as const;

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

function normalizeGeminiError(status: number, detail: string): string {
  const compact = detail.replace(/\s+/g, " ").trim();
  if (status === 429) {
    return "Квота Gemini временно исчерпана. Подожди немного или проверь лимиты API-ключа в Google AI Studio.";
  }
  if (status === 401 || status === 403) {
    return "Нет доступа к Gemini API. Проверь корректность и права API-ключа.";
  }
  if (status >= 500) {
    return "Gemini временно недоступен (ошибка сервера). Попробуй снова чуть позже.";
  }
  return `Gemini ${status}: ${compact.slice(0, 180)}`;
}

function dedupeModels(primary: string): string[] {
  const all = [primary, ...FALLBACK_MODELS];
  return [...new Set(all)];
}

export async function callGemini(options: GeminiCallOptions): Promise<GeminiCallResult> {
  const apiKey = pickApiKey(options.apiKey);
  const primaryModel = options.model?.trim() || DEFAULT_MODEL;
  if (!apiKey) {
    return {
      ok: false,
      errorMessage: "GEMINI_API_KEY is not configured",
      usedModel: primaryModel,
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

  let lastErrorMessage = "Gemini request failed";
  let lastModel = primaryModel;

  for (const model of dedupeModels(primaryModel)) {
    lastModel = model;
    try {
      const response = await fetch(buildEndpoint(model, apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        lastErrorMessage = normalizeGeminiError(response.status, detail);
        continue;
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
        lastErrorMessage = "Gemini вернул пустой ответ.";
        continue;
      }

      return {
        ok: true,
        text,
        usedModel: model,
        providerId: "google-gemini",
      };
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : "Gemini request failed";
    }
  }

  return {
    ok: false,
    errorMessage: lastErrorMessage,
    usedModel: lastModel,
    providerId: "google-gemini",
  };
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
