const DEFAULT_MODEL = "llama-3.1-8b-instant";
const FALLBACK_MODELS = ["llama-3.3-70b-versatile"] as const;

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
  providerId: "groq";
};

function pickApiKey(explicit?: string): string | null {
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const env =
    process.env.GROQ_API_KEY ??
    "";
  return env.trim().length > 0 ? env.trim() : null;
}

function normalizeProviderError(status: number, detail: string): string {
  const compact = detail.replace(/\s+/g, " ").trim();
  if (status === 429) {
    return "Квота AI временно исчерпана (429). Подожди немного и попробуй снова.";
  }
  if (status === 404) {
    return "Выбранная модель недоступна у провайдера. Переключаюсь на запасную.";
  }
  if (status === 401 || status === 403) {
    return "Нет доступа к Groq API. Проверь корректность GROQ_API_KEY.";
  }
  if (status >= 500) {
    return "Провайдер AI временно недоступен (ошибка сервера). Попробуй снова чуть позже.";
  }
  return `AI ${status}: ${compact.slice(0, 180)}`;
}

function buildEndpoint(): string {
  return "https://api.groq.com/openai/v1/chat/completions";
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
      errorMessage: "GROQ_API_KEY is not configured",
      usedModel: primaryModel,
      providerId: "groq",
    };
  }

  let lastErrorMessage = "AI request failed";
  let lastModel = primaryModel;

  for (const model of dedupeModels(primaryModel)) {
    lastModel = model;
    try {
      const response = await fetch(buildEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: options.prompt }],
          temperature: options.temperature ?? 0.4,
          max_tokens: options.maxOutputTokens ?? 1200,
          ...(options.responseMimeType === "application/json" ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        lastErrorMessage = normalizeProviderError(response.status, detail);
        continue;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const text = data.choices?.[0]?.message?.content?.trim();

      if (!text) {
        lastErrorMessage = "AI вернул пустой ответ.";
        continue;
      }

      return {
        ok: true,
        text,
        usedModel: model,
        providerId: "groq",
      };
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : "AI request failed";
    }
  }

  return {
    ok: false,
    errorMessage: lastErrorMessage,
    usedModel: lastModel,
    providerId: "groq",
  };
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
