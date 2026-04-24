import OpenAI from "openai";

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
export const NVIDIA_FAST_MODEL = "meta/llama-3.1-8b-instruct";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmStreamChunk = {
  content: string;
  reasoningContent: string;
};

export type LlmGenerateOptions = {
  maxTokens?: number;
  timeoutMs?: number;
  thinking?: boolean;
  model?: string;
  temperature?: number;
  topP?: number;
};

export class LlmClientError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "LlmClientError";
    this.statusCode = statusCode;
  }
}

function getApiKey(): string {
  const key = process.env.NVIDIA_API_KEY?.trim();
  if (!key) {
    throw new LlmClientError("NVIDIA_API_KEY is not configured");
  }
  return key;
}

function createClient(timeout: number): OpenAI {
  return new OpenAI({
    apiKey: getApiKey(),
    baseURL: NVIDIA_BASE_URL,
    timeout,
    maxRetries: 0,
  });
}

function normalizeError(error: unknown): LlmClientError {
  if (error instanceof LlmClientError) return error;
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : undefined;
  if (status === 401) {
    return new LlmClientError("Неверный ключ NVIDIA API (401).", status);
  }
  if (status === 403) {
    return new LlmClientError("Нет доступа к модели NVIDIA (403). Проверь ключ.", status);
  }
  if (status === 404) {
    return new LlmClientError("Модель NVIDIA не найдена (404).", status);
  }
  if (status === 429) {
    return new LlmClientError("Превышен лимит NVIDIA API (429). Подожди немного и повтори.", status);
  }
  if (status === 408) {
    return new LlmClientError("Таймаут запроса к NVIDIA API. Повтори позже.", status);
  }
  if (status && status >= 500) {
    return new LlmClientError("NVIDIA API временно недоступен. Попробуй позже.", status);
  }
  const message = error instanceof Error ? error.message : "LLM request failed";
  if (/abort/i.test(message) || /timeout/i.test(message)) {
    return new LlmClientError("Таймаут LLM-запроса. Попробуй еще раз.", status);
  }
  return new LlmClientError(message, status);
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part === "object" && part && "text" in part
            ? String((part as { text?: unknown }).text ?? "")
            : "",
      )
      .join("");
  }
  return "";
}

function supportsThinking(model: string): boolean {
  return /deepseek-v3\.2|nemotron.*think/i.test(model);
}

export async function* generateResponse(messages: LlmMessage[], options?: LlmGenerateOptions): AsyncGenerator<LlmStreamChunk> {
  const timeoutMs = Math.max(5000, options?.timeoutMs ?? 50000);
  const maxTokens = Math.max(64, options?.maxTokens ?? 1024);
  const model = options?.model ?? NVIDIA_MODEL;
  const temperature = options?.temperature ?? 0.3;
  const topP = options?.topP ?? 0.95;
  const client = createClient(timeoutMs);
  const startedAt = Date.now();

  try {
    const requestBody: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
    };
    if (options?.thinking && supportsThinking(model)) {
      requestBody.extra_body = { chat_template_kwargs: { thinking: true } };
    }

    const stream = (await (client.chat.completions.create as unknown as (body: unknown) => Promise<AsyncIterable<unknown>>)(
      requestBody,
    )) as AsyncIterable<unknown>;

    for await (const part of stream as AsyncIterable<{ choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }> }>) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new LlmClientError("Таймаут LLM-запроса. Попробуй еще раз.");
      }
      const delta = (part.choices?.[0]?.delta ?? {}) as { content?: unknown; reasoning_content?: unknown };
      yield {
        content: asText(delta.content),
        reasoningContent: asText(delta.reasoning_content),
      };
    }
  } catch (error) {
    throw normalizeError(error);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LlmClientError("Таймаут LLM-запроса. Попробуй еще раз.")), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => clearTimeout(timer));
  });
}

export async function collectResponse(messages: LlmMessage[], options?: LlmGenerateOptions): Promise<{
  contentText: string;
  reasoningText: string;
  mergedText: string;
  model: string;
  provider: "nvidia";
}> {
  let contentText = "";
  let reasoningText = "";
  const consume = async () => {
    for await (const chunk of generateResponse(messages, options)) {
      if (chunk.content) contentText += chunk.content;
      if (chunk.reasoningContent) reasoningText += chunk.reasoningContent;
    }
  };
  await withTimeout(consume(), Math.max(5000, options?.timeoutMs ?? 50000));
  const mergedText = contentText.trim().length > 0 ? contentText : reasoningText;
  return {
    contentText,
    reasoningText,
    mergedText,
    model: options?.model ?? NVIDIA_MODEL,
    provider: "nvidia",
  };
}

export async function collectResponseWithFallback(
  messages: LlmMessage[],
  options?: LlmGenerateOptions,
): Promise<{
  contentText: string;
  reasoningText: string;
  mergedText: string;
  model: string;
  provider: "nvidia";
}> {
  try {
    return await collectResponse(messages, options);
  } catch (primaryError) {
    const primaryModel = options?.model ?? NVIDIA_MODEL;
    if (primaryModel === NVIDIA_FAST_MODEL) throw primaryError;
    console.warn(
      `LLM primary model failed (${primaryModel}): ${primaryError instanceof Error ? primaryError.message : "unknown"}. Retrying with ${NVIDIA_FAST_MODEL}.`,
    );
    return await collectResponse(messages, {
      ...options,
      model: NVIDIA_FAST_MODEL,
      timeoutMs: Math.min(options?.timeoutMs ?? 50000, 25000),
    });
  }
}

export function safeParseJson<T>(text: string): T | null {
  const trimmed = text.trim();
  const candidate = trimmed.startsWith("```") ? trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim() : trimmed;
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
