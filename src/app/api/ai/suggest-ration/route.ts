import { NextResponse } from "next/server";
import { collectResponseWithFallback, LlmClientError, NVIDIA_MODEL, safeParseJson } from "@/services/llmClient";
import type { AnalyzeRationInput, RationAdvice } from "@/lib/ai/analysis-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ROUTE_MODEL = NVIDIA_MODEL;

type IncomingPayload = AnalyzeRationInput;

const SYSTEM_PROMPT = `Ты диет-ассистент.
Нужно предложить пользователю, что можно съесть сегодня, чтобы вписаться в оставшиеся КБЖУ.
Верни ТОЛЬКО JSON:
{
  "summary": "1-2 коротких предложения",
  "suggestions": [
    {
      "title": "название",
      "type": "food|recipe",
      "portionG": 120,
      "estimated": { "kcal": 240, "protein": 20, "fat": 8, "carbs": 22 },
      "reason": "почему подходит"
    }
  ],
  "notes": ["опционально 1-3 пункта"]
}
Ограничения: 3-5 предложений, realistic порции 60..350 г, русский язык.
Можно предлагать ЛЮБЫЕ продукты или блюда (не только из локальной базы), но учитывай оставшиеся КБЖУ.`;

function clampPortion(raw: number): number {
  if (!Number.isFinite(raw)) return 100;
  return Math.max(60, Math.min(350, Math.round(raw / 5) * 5));
}

function buildPrompt(payload: IncomingPayload): string {
  return `${SYSTEM_PROMPT}

Дата: ${payload.date}
Съедено: ${JSON.stringify(payload.consumed)}
Цель: ${JSON.stringify(payload.target)}
Осталось: ${JSON.stringify(payload.remaining)}
 Локальные продукты/блюда пользователя (если релевантно, можно использовать, но не ограничивайся только ими): ${JSON.stringify(payload.candidates)}
`;
}

export async function POST(request: Request) {
  let payload: IncomingPayload;
  try {
    payload = (await request.json()) as IncomingPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let llmText = "";
  let provider: string = "nvidia";
  let usedModel = ROUTE_MODEL;
  try {
    const response = await collectResponseWithFallback([{ role: "user", content: buildPrompt(payload) }], { maxTokens: 700, timeoutMs: 40000, temperature: 0.4 });
    llmText = response.mergedText;
    usedModel = response.model;
    provider = response.provider;
  } catch (error) {
    console.error("suggest-ration LLM error", error instanceof Error ? error.message : "unknown");
    const message = error instanceof LlmClientError ? error.message : "AI provider failed";
    return NextResponse.json(
      {
        ok: false,
        error: message,
        provider: "nvidia",
        model: ROUTE_MODEL,
        routeModel: ROUTE_MODEL,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = safeParseJson<RationAdvice>(llmText);
  if (!parsed || !Array.isArray(parsed.suggestions)) {
    return NextResponse.json(
      {
        ok: false,
        error: "AI response was not valid JSON",
        provider,
        model: usedModel,
        routeModel: ROUTE_MODEL,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  const normalized: RationAdvice = {
    summary: typeof parsed.summary === "string" && parsed.summary.trim().length > 0 ? parsed.summary.trim() : "Подбор вариантов выполнен.",
    suggestions: parsed.suggestions
      .filter((item) => item && typeof item.title === "string")
      .slice(0, 5)
      .map((item) => ({
        title: item.title,
        type: item.type === "recipe" ? "recipe" : "food",
        portionG: clampPortion(item.portionG),
        estimated:
          item.estimated && Number.isFinite(item.estimated.kcal)
            ? {
                kcal: Math.max(0, Math.round(item.estimated.kcal)),
                protein: Math.max(0, Math.round((item.estimated.protein ?? 0) * 10) / 10),
                fat: Math.max(0, Math.round((item.estimated.fat ?? 0) * 10) / 10),
                carbs: Math.max(0, Math.round((item.estimated.carbs ?? 0) * 10) / 10),
              }
            : { kcal: 0, protein: 0, fat: 0, carbs: 0 },
        reason: typeof item.reason === "string" && item.reason.trim().length > 0 ? item.reason.trim() : "Подходит по оставшимся КБЖУ.",
      })),
    notes: Array.isArray(parsed.notes) ? parsed.notes.filter((item) => typeof item === "string" && item.trim().length > 0) : undefined,
  };

  return NextResponse.json(
    {
      ok: true,
      analysis: normalized,
      provider,
      model: usedModel,
      routeModel: ROUTE_MODEL,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
