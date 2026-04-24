import type {
  ExtendedDayAnalysis,
  ExtendedPeriodAnalysis,
  AnalyzeDayInput,
  AnalyzePeriodInput,
  AnalyzeRationInput,
  RationAdvice,
} from "@/lib/ai/analysis-types";

const ANALYZE_DAY_ENDPOINT = "/api/ai/analyze-day";
const ANALYZE_PERIOD_ENDPOINT = "/api/ai/analyze-period";
const ANALYZE_RATION_ENDPOINT = "/api/ai/suggest-ration";
const REQUEST_TIMEOUT_MS = 65000;

type ApiOk<T> = { ok: true; analysis: T; provider: string; model: string };
type ApiErr = { ok: false; error: string };
const inFlightRequests = new Map<string, Promise<unknown>>();

async function postJson<T>(url: string, body: unknown): Promise<T | ApiErr> {
  const key = `${url}::${JSON.stringify(body)}`;
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing as Promise<T | ApiErr>;
  }

  const requestPromise = (async (): Promise<T | ApiErr> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await response.json().catch(() => null)) as T | ApiErr | null;
    if (!response.ok) {
      return {
        ok: false,
        error: (json && typeof json === "object" && "error" in json && typeof (json as ApiErr).error === "string"
          ? (json as ApiErr).error
          : `AI request failed: ${response.status}`),
      };
    }
    if (!json) {
      return { ok: false, error: "Empty AI response" };
    }
    return json as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "AI не ответил вовремя. Попробуй снова через минуту." };
    }
    return { ok: false, error: error instanceof Error ? error.message : "AI request failed" };
  } finally {
    clearTimeout(timer);
    inFlightRequests.delete(key);
  }
  })();
  inFlightRequests.set(key, requestPromise as Promise<unknown>);
  return requestPromise;
}

export async function requestDayAnalysis(payload: AnalyzeDayInput): Promise<{
  ok: boolean;
  analysis?: ExtendedDayAnalysis;
  provider?: string;
  model?: string;
  error?: string;
}> {
  const result = await postJson<ApiOk<ExtendedDayAnalysis>>(ANALYZE_DAY_ENDPOINT, payload);
  if ("ok" in result && result.ok) {
    return { ok: true, analysis: result.analysis, provider: result.provider, model: result.model };
  }
  return { ok: false, error: (result as ApiErr).error };
}

export async function requestPeriodAnalysis(payload: AnalyzePeriodInput): Promise<{
  ok: boolean;
  analysis?: ExtendedPeriodAnalysis;
  provider?: string;
  model?: string;
  error?: string;
}> {
  const result = await postJson<ApiOk<ExtendedPeriodAnalysis>>(ANALYZE_PERIOD_ENDPOINT, payload);
  if ("ok" in result && result.ok) {
    return { ok: true, analysis: result.analysis, provider: result.provider, model: result.model };
  }
  return { ok: false, error: (result as ApiErr).error };
}

export async function requestRationAdvice(payload: AnalyzeRationInput): Promise<{
  ok: boolean;
  advice?: RationAdvice;
  provider?: string;
  model?: string;
  error?: string;
}> {
  const result = await postJson<ApiOk<RationAdvice>>(ANALYZE_RATION_ENDPOINT, payload);
  if ("ok" in result && result.ok) {
    return { ok: true, advice: result.analysis, provider: result.provider, model: result.model };
  }
  return { ok: false, error: (result as ApiErr).error };
}
