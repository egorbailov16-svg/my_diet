import { NextResponse } from "next/server";
import { collectResponseWithFallback, LlmClientError, NVIDIA_MODEL, safeParseJson } from "@/services/llmClient";
import { buildFallbackDayAnalysisExtended } from "@/lib/ai/structured-analysis";
import type { DayLog, DayTarget } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ROUTE_MODEL = NVIDIA_MODEL;

type IncomingPayload = {
  date: string;
  dayType: string;
  consumed: { kcal: number; protein: number; fat: number; carbs: number };
  activeKcal: number;
  netKcal: number;
  heightCm?: number;
  currentWeightKg?: number | null;
  goalWeightKg?: number | null;
  plannedActivityKcal?: number | null;
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

const SYSTEM_INSTRUCTIONS = `Ты — персональный нутрициолог. Анализируй день СТРОГО по данным пользователя.
Отвечай ТОЛЬКО валидным JSON по этой схеме (ничего кроме JSON):
{
  "summary": "Оценка: X/10. <1 фраза главный вывод дня>",
  "good": ["2-3 пункта: что сделано хорошо с цифрами"],
  "issues": ["0-3 пункта: что скорректировать (цифры + что именно поменять). Далее обязательно 4 строки МАКРО и 1 строка МИКРОНУТРИЕНТЫ (см. ниже)."],
  "nextDayActions": ["ровно 1 действие максимум на завтра (1 пункт)"],
  "predictions": ["1-2 пункта прогноз: форма/вес (направление + ориентировочный диапазон, если возможно)"],
  "recommendations": [],
  "limitations": []
}

ЖЁСТКИЕ ОГРАНИЧЕНИЯ:
- Без медицинских диагнозов.
- Никаких общих фраз без цифр.
- Только реальные отклонения от плана.
- Длина ответа не более ~250 слов.

КАК ОПРЕДЕЛЯТЬ ЦЕЛЬ (goalType):
- Если goalWeightKg и currentWeightKg доступны:
  - goalWeightKg < currentWeightKg => "сушка/похудение"
  - goalWeightKg > currentWeightKg => "набор массы"
  - равны (с точностью ±0.4 кг) => "поддержание"
- Если веса недоступны: определяй goalType по целевым калориям target.kcalMin/target.kcalMax и netKcal относительно consumed.kcal (без выдумок).

ЛОГИКА ОЦЕНКИ МАКРО (по плану target этого dayType):
- СУШКА:
  - дефицит: consumed.kcal не более чем на 200 ккал ниже планового центра (center=(kcalMin+kcalMax)/2) => ✅, иначе ❌
  - белок: protein >= 0.9*proteinTarget => ✅ иначе ⚠️
  - жиры: если fat < 0.8*centerFat (centerFat=(fatMin+fatMax)/2) => ❌ (предупредить крупно); если ниже 0.9 => ⚠️; не хвали за низкие жиры.
  - углеводы: не пугай низкими углеводами, если carbs в пределах [carbsMin, carbsMax] => ✅.
  - НЕ рекомендуй “есть больше”, если дефицит в пределах нормы.
- НАБОР:
  - профицит не более чем на 200 ккал выше планового центра => ✅ иначе ❌
  - белок: protein >= 0.9*proteinTarget => ✅ иначе ⚠️
  - (углеводы/жиры: отмечай только реальные выходы за диапазоны min-max).
- ПОДДЕРЖАНИЕ:
  - отклонение калорий center в пределах ±150 ккал => ✅ иначе ❌
  - баланс макросов важнее калорий: оцени соответствие по диапазонам fat/carbs и белок по proteinTarget.

ФОРМАТ МАКРОСОВЫХ СТРОК (обязательно, 4 строки, вставь в конец массива issues, 1 строка = 1 элемент массива):
1) "Белки: <fact>г / план <proteinTarget>г <✅|⚠️|❌>"
2) "Жиры: <fact>г / план <fatMin>-<fatMax>г <✅|⚠️|❌>"
3) "Углеводы: <fact>г / план <carbsMin>-<carbsMax>г <✅|⚠️|❌>"
4) "Калории: <fact> / план <kcalMin>-<kcalMax> <✅|⚠️|❌>"

МИКРОНУТРИЕНТЫ (обязательно 1 строка, в конец issues после макро):
- Считай критичный дефицит как значение < 70% от нормы из micronutrientNorms.
- Приоритет: витамин_d, железо, магний.
- Выведи ТОЛЬКО критичные дефициты из приоритетного набора.
- Если критичных дефицитов нет => "Без критичных дефицитов".

ПРОГНОЗ (predictions):
- Обязательно учитывай netKcal и калорийное отклонение от target center.
- Дай прогноз веса с направлением: при sustained deficit => ожидание снижения, при surplus => рост.
- Форма/самочувствие: с учетом dayType (normal vs strength) и того, попали ли в макро диапазоны.
`;

function buildPrompt(payload: IncomingPayload): string {
  return `${SYSTEM_INSTRUCTIONS}

Данные дня (${payload.date}, тип: ${payload.dayType}):
- Съедено: ${payload.consumed.kcal} ккал, Б ${payload.consumed.protein} г, Ж ${payload.consumed.fat} г, У ${payload.consumed.carbs} г
- Активные ккал: ${payload.activeKcal}
- Net (съедено − активность): ${payload.netKcal} ккал
- Профиль: рост ${payload.heightCm ?? "не указан"} см, currentWeight ${payload.currentWeightKg ?? payload.weightKg ?? "не указан"} кг, goalWeight ${payload.goalWeightKg ?? "не указан"} кг, plannedActivity ${payload.plannedActivityKcal ?? "не указано"} ккал
- Вес сегодня (если есть): ${payload.weightKg ?? "не указан"} кг

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
  let provider: string = "nvidia";
  let usedModel = ROUTE_MODEL;
  try {
    const response = await collectResponseWithFallback([
      { role: "user", content: buildPrompt(payload) },
    ], { maxTokens: 900, timeoutMs: 45000, temperature: 0.3 });
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
