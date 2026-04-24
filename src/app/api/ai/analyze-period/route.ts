import { NextResponse } from "next/server";
import { callGemini, DEFAULT_MODEL, safeParseJson } from "@/lib/ai/gemini-client";
import { buildFallbackPeriodAnalysisExtended } from "@/lib/ai/structured-analysis";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const ROUTE_MODEL = DEFAULT_MODEL;

type DayPoint = {
  date: string;
  dayType: string;
  status: string;
  consumed: { kcal: number; protein: number; fat: number; carbs: number };
  activeKcal: number;
  netKcal: number;
};

type IncomingPayload = {
  rangeDays: number;
  startDate: string;
  endDate: string;
  avgConsumed: { kcal: number; protein: number; fat: number; carbs: number };
  avgActivity: number;
  avgNetKcal: number;
  weightStartKg?: number | null;
  weightEndKg?: number | null;
  weightDeltaKg: number;
  completedDays: number;
  totalDays: number;
  planHitRate: number;
  micronutrientCoverage: number;
  microTotals?: Record<string, number>;
  vitaminTotals?: Record<string, number>;
  microNorms?: Record<string, number>;
  daily: DayPoint[];
  notes?: string;
};

type PeriodAnalysisResponse = {
  summary: string;
  whatWentWell: string[];
  whatWentWrong: string[];
  weightAndProgress: string[];
  nutrition: string[];
  activity: string[];
  micronutrients: string[];
  expectedVsActual: string[];
  recommendations: string[];
  cutDown: string[];
  limitations?: string[];
};

const SYSTEM_INSTRUCTIONS = `Ты — нутрициолог-аналитик и тренер. Анализируешь период (от 7 до 60 дней) питания и активности.
Сделай подробный, опирающийся ТОЛЬКО на данные пользователя анализ.
Отвечай ТОЛЬКО валидным JSON по схеме:
{
  "summary": "2-3 предложения с общим выводом по периоду",
  "whatWentWell": ["конкретные сильные моменты, 3-6 пунктов"],
  "whatWentWrong": ["конкретные проблемы, 3-6 пунктов"],
  "weightAndProgress": ["анализ веса и динамики, 2-4 пункта"],
  "nutrition": ["анализ КБЖУ и состава рациона, 3-6 пунктов"],
  "activity": ["анализ активности, 2-4 пункта"],
  "micronutrients": ["анализ микронутриентов и витаминов, 2-4 пункта"],
  "expectedVsActual": ["что должно было происходить vs что произошло, 2-4 пункта"],
  "recommendations": ["конкретные рекомендации на следующий период, 4-7 пунктов"],
  "cutDown": ["что стоит сократить или убрать из рациона, 2-4 пункта"],
  "limitations": ["оговорки про данные, 1-2 пункта"]
}
Стиль: предметно, опирайся на цифры. На русском. Без диагнозов и без воды.`;

function buildPrompt(payload: IncomingPayload): string {
  return `${SYSTEM_INSTRUCTIONS}

Период: ${payload.startDate} – ${payload.endDate} (${payload.rangeDays} дней)

Среднее за день:
- Калории: ${payload.avgConsumed.kcal}
- Белки: ${payload.avgConsumed.protein} г
- Жиры: ${payload.avgConsumed.fat} г
- Углеводы: ${payload.avgConsumed.carbs} г
- Активные ккал: ${payload.avgActivity}
- Net (съедено − активность): ${payload.avgNetKcal} ккал

Вес: с ${payload.weightStartKg ?? "?"} кг до ${payload.weightEndKg ?? "?"} кг (Δ ${payload.weightDeltaKg.toFixed(2)} кг)
Завершённых дней: ${payload.completedDays} из ${payload.totalDays}
Попадание в план КБЖУ: ${payload.planHitRate.toFixed(1)}%
Покрытие микронутриентами: ${payload.micronutrientCoverage.toFixed(1)}%

Микронутриенты за период (суммарно): ${JSON.stringify(payload.microTotals ?? {})}
Витамины за период (суммарно): ${JSON.stringify(payload.vitaminTotals ?? {})}
Дневные нормы (для сравнения, надо умножать на количество дней): ${JSON.stringify(payload.microNorms ?? {})}

Дни:
${JSON.stringify(payload.daily)}

Дополнительно: ${payload.notes ?? "—"}

Верни JSON по схеме выше.`;
}

export async function POST(request: Request) {
  let payload: IncomingPayload;
  try {
    payload = (await request.json()) as IncomingPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await callGemini({
    prompt: buildPrompt(payload),
    model: ROUTE_MODEL,
    responseMimeType: "application/json",
    temperature: 0.5,
    maxOutputTokens: 1800,
  });

  const fallbackAnalysis = buildFallbackPeriodAnalysisExtended({
    rangeDays: [7, 14, 21, 30, 60].includes(payload.rangeDays) ? (payload.rangeDays as 7 | 14 | 21 | 30 | 60) : 7,
    startDate: payload.startDate,
    endDate: payload.endDate,
    avgWeight: payload.weightEndKg ?? payload.weightStartKg ?? 0,
    deltaWeight: payload.weightDeltaKg,
    avgKcal: payload.avgConsumed.kcal,
    avgProtein: payload.avgConsumed.protein,
    avgFat: payload.avgConsumed.fat,
    avgCarbs: payload.avgConsumed.carbs,
    avgActivity: payload.avgActivity,
    avgNetKcal: payload.avgNetKcal,
    completedDays: payload.completedDays,
    totalDays: payload.totalDays,
    planHitRate: payload.planHitRate,
    micronutrientCoverage: payload.micronutrientCoverage,
  });

  if (!result.ok || !result.text) {
    return NextResponse.json(
      {
        ok: true,
        analysis: fallbackAnalysis,
        provider: "rule-based-fallback",
        model: "local-structured-v1",
        routeModel: ROUTE_MODEL,
        fallbackReason: result.errorMessage ?? "AI provider failed",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = safeParseJson<PeriodAnalysisResponse>(result.text);
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

  const analysis: PeriodAnalysisResponse = {
    summary: parsed.summary?.trim() ?? "",
    whatWentWell: arr(parsed.whatWentWell),
    whatWentWrong: arr(parsed.whatWentWrong),
    weightAndProgress: arr(parsed.weightAndProgress),
    nutrition: arr(parsed.nutrition),
    activity: arr(parsed.activity),
    micronutrients: arr(parsed.micronutrients),
    expectedVsActual: arr(parsed.expectedVsActual),
    recommendations: arr(parsed.recommendations),
    cutDown: arr(parsed.cutDown),
    limitations: parsed.limitations ? arr(parsed.limitations) : undefined,
  };

  return NextResponse.json(
    {
      ok: true,
      analysis,
      provider: result.providerId,
      model: result.usedModel,
      routeModel: ROUTE_MODEL,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

function arr(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
