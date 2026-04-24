import OpenAI from "openai";

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_MODEL = "deepseek-ai/deepseek-v3.2";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmStreamChunk = {
  content: string;
  reasoningContent: string;
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

function createClient(): OpenAI {
  return new OpenAI({
    apiKey: getApiKey(),
    baseURL: NVIDIA_BASE_URL,
  });
}

function normalizeError(error: unknown): LlmClientError {
  if (error instanceof LlmClientError) return error;
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : undefined;
  if (status === 401) {
    return new LlmClientError("Неверный ключ NVIDIA API (401).", status);
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
  return new LlmClientError(error instanceof Error ? error.message : "LLM request failed", status);
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => (typeof part === "string" ? part : typeof part === "object" && part && "text" in part ? String((part as { text?: unknown }).text ?? "") : ""))
      .join("");
  }
  return "";
}

export async function* generateResponse(messages: LlmMessage[]): AsyncGenerator<LlmStreamChunk> {
  const client = createClient();
  try {
    const requestBody: Record<string, unknown> = {
      model: NVIDIA_MODEL,
      messages,
      stream: true,
      temperature: 1,
      top_p: 0.95,
      max_tokens: 8192,
      extra_body: {
        chat_template_kwargs: {
          thinking: true,
        },
      },
    };
    const stream = (await (client.chat.completions.create as unknown as (body: unknown) => Promise<AsyncIterable<unknown>>)(
      requestBody,
    )) as AsyncIterable<unknown>;

    for await (const part of stream as AsyncIterable<{ choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }> }>) {
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

export async function collectResponse(messages: LlmMessage[]): Promise<{
  contentText: string;
  reasoningText: string;
  mergedText: string;
  model: string;
  provider: "nvidia-deepseek";
}> {
  let contentText = "";
  let reasoningText = "";
  for await (const chunk of generateResponse(messages)) {
    if (chunk.content) contentText += chunk.content;
    if (chunk.reasoningContent) reasoningText += chunk.reasoningContent;
  }
  const mergedText = contentText.trim().length > 0 ? contentText : reasoningText;
  return {
    contentText,
    reasoningText,
    mergedText,
    model: NVIDIA_MODEL,
    provider: "nvidia-deepseek",
  };
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
