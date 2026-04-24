import { NextResponse } from "next/server";
import { collectResponse, LlmClientError, NVIDIA_MODEL, safeParseJson } from "@/services/llmClient";
import { buildFallbackDayAnalysisExtended } from "@/lib/ai/structured-analysis";
import type { DayLog, DayTarget } from "@/lib/data";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const ROUTE_MODEL = NVIDIA_MODEL;

type IncomingPayload = {
  date: string;
  dayType: string;
  consumed: { kcal: number; protein: number; fat: number; carbs: number };
  activeKcal: number;
  netKcal: number;
  target?: {
    kcalMin: number;
    kcalMax: number;
    proteinTarget: number;
    fatMin: number;
    fatMax: number;
    carbsMin: number;
    carbsMax: number;
  } | null;
  micronutrients?: Record<string, number>;
  vitamins?: Record<string, number>;
  micronutrientNorms?: Record<string, number>;
  micronutrientCoverage?: number;
  entries?: Array<{
    title: string;
    mealType?: string;
    amountG: number;
    nutrients: { kcal: number; protein: number; fat: number; carbs: number };
  }>;
  weightKg?: number | null;
};

type AnalysisResponse = {
  summary: string;
  good: string[];
  issues: string[];
  nextDayActions: string[];
  predictions: string[];
  recommendations: string[];
  limitations?: string[];
};

const SYSTEM_INSTRUCTIONS = `Ты — нутрициолог-аналитик. Анализируешь дневной рацион и активность пользователя.
Отвечай ТОЛЬКО валидным JSON по этой схеме:
{
  "summary": "1-2 предложения, общий итог дня",
  "good": ["конкретные положительные моменты, 2-5 пунктов"],
  "issues": ["конкретные проблемы или отклонения, 2-5 пунктов"],
  "nextDayActions": ["3-5 практичных действий на завтра"],
  "predictions": ["2-4 предположения о том, как такой день влияет на форму/вес/энергию"],
  "recommendations": ["3-5 рекомендаций по улучшению на ближайшие дни"],
  "limitations": ["1-2 пункта про ограничения анализа"]
}
Стиль: коротко, по делу, на русском. Без воды, без медицинских диагнозов. Используй фактические числа из данных.`;

function buildPrompt(payload: IncomingPayload): string {
  return `${SYSTEM_INSTRUCTIONS}

Данные дня (${payload.date}, тип: ${payload.dayType}):
- Съедено: ${payload.consumed.kcal} ккал, Б ${payload.consumed.protein} г, Ж ${payload.consumed.fat} г, У ${payload.consumed.carbs} г
- Активные ккал: ${payload.activeKcal}
- Net (съедено − активность): ${payload.netKcal} ккал
- Вес сегодня: ${payload.weightKg ?? "не указан"} кг

Цели дня: ${payload.target ? JSON.stringify(payload.target) : "не заданы"}

Микронутриенты (мг/мкг за день): ${JSON.stringify(payload.micronutrients ?? {})}
Витамины за день: ${JSON.stringify(payload.vitamins ?? {})}
Дневные нормы (для сравнения): ${JSON.stringify(payload.micronutrientNorms ?? {})}
Покрытие микронутриентами: ${payload.micronutrientCoverage ?? 0}%

Приёмы пищи: ${JSON.stringify(payload.entries ?? [])}

Верни JSON по схеме выше.`;
}

export async function POST(request: Request) {
  let payload: IncomingPayload;
  try {
    payload = (await request.json()) as IncomingPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const fallbackDayType = payload.dayType === "strength" ? "strength" : "normal";
  const fallbackAnalysis = buildFallbackDayAnalysisExtended({
    dayLog: {
      id: payload.date,
      date: payload.date,
      dayType: fallbackDayType,
      status: "completed",
      activeKcal: Number(payload.activeKcal) || 0,
      activitySource: "manual",
      healthSyncStatus: "idle",
      manualActivityOverride: true,
      healthPermissionsState: "unknown",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as DayLog,
    target: payload.target
      ? ({
          id: fallbackDayType,
          dayType: fallbackDayType,
          kcalMin: payload.target.kcalMin,
          kcalMax: payload.target.kcalMax,
          proteinTarget: payload.target.proteinTarget,
          fatMin: payload.target.fatMin,
          fatMax: payload.target.fatMax,
          carbsMin: payload.target.carbsMin,
          carbsMax: payload.target.carbsMax,
          updatedAt: new Date().toISOString(),
        } as DayTarget)
      : null,
    consumed: payload.consumed,
    netKcal: payload.netKcal,
    micronutrientCoverage: payload.micronutrientCoverage ?? 0,
  });

  let llmText = "";
  let provider: "nvidia-deepseek" = "nvidia-deepseek";
  let usedModel = ROUTE_MODEL;
  try {
    const response = await collectResponse([
      { role: "user", content: buildPrompt(payload) },
    ], { maxTokens: 900, timeoutMs: 9000, thinking: false });
    llmText = response.mergedText;
    usedModel = response.model;
    provider = response.provider;
  } catch (error) {
    console.error("analyze-day LLM error", error instanceof Error ? error.message : "unknown");
    const message = error instanceof LlmClientError ? error.message : "AI provider failed";
    return NextResponse.json(
      {
        ok: true,
        analysis: fallbackAnalysis,
        provider: "rule-based-fallback",
        model: "local-structured-v1",
        routeModel: ROUTE_MODEL,
        fallbackReason: message,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = safeParseJson<AnalysisResponse>(llmText);
  if (!parsed) {
    return NextResponse.json(
      {
        ok: true,
        analysis: fallbackAnalysis,
        provider: "rule-based-fallback",
        model: "local-structured-v1",
        routeModel: ROUTE_MODEL,
        fallbackReason: "AI response was not valid JSON",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const analysis: AnalysisResponse = {
    summary: parsed.summary?.trim() || "",
    good: Array.isArray(parsed.good) ? parsed.good.filter(Boolean) : [],
    issues: Array.isArray(parsed.issues) ? parsed.issues.filter(Boolean) : [],
    nextDayActions: Array.isArray(parsed.nextDayActions) ? parsed.nextDayActions.filter(Boolean) : [],
    predictions: Array.isArray(parsed.predictions) ? parsed.predictions.filter(Boolean) : [],
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.filter(Boolean) : [],
    limitations: Array.isArray(parsed.limitations) ? parsed.limitations.filter(Boolean) : undefined,
  };

  return NextResponse.json(
    {
      ok: true,
      analysis,
      provider,
      model: usedModel,
      routeModel: ROUTE_MODEL,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
