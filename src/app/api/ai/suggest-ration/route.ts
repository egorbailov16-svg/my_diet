import { NextResponse } from "next/server";
import { callGemini, safeParseJson } from "@/lib/ai/gemini-client";
import type { AnalyzeRationInput, RationAdvice, RationSuggestion } from "@/lib/ai/analysis-types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type Candidate = AnalyzeRationInput["candidates"][number];

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
Ограничения: 3-5 предложений, realistic порции 60..350 г, русский язык.`;

function clampPortion(raw: number): number {
  if (!Number.isFinite(raw)) return 100;
  return Math.max(60, Math.min(350, Math.round(raw / 5) * 5));
}

function forPortion(nutrientsPer100g: Candidate["nutrientsPer100g"], portionG: number) {
  const factor = portionG / 100;
  return {
    kcal: Math.round(nutrientsPer100g.kcal * factor),
    protein: Math.round(nutrientsPer100g.protein * factor * 10) / 10,
    fat: Math.round(nutrientsPer100g.fat * factor * 10) / 10,
    carbs: Math.round(nutrientsPer100g.carbs * factor * 10) / 10,
  };
}

function scoreSuggestion(estimated: { kcal: number; protein: number; fat: number; carbs: number }, remaining: IncomingPayload["remaining"]): number {
  const kcalScore = Math.abs(remaining.kcal - estimated.kcal);
  const pScore = Math.abs(remaining.protein - estimated.protein) * 8;
  const fScore = Math.abs(remaining.fat - estimated.fat) * 6;
  const cScore = Math.abs(remaining.carbs - estimated.carbs) * 4;
  return kcalScore + pScore + fScore + cScore;
}

function buildLocalFallback(payload: IncomingPayload): RationAdvice {
  const picks: Array<{ item: Candidate; portionG: number; estimated: { kcal: number; protein: number; fat: number; carbs: number }; score: number }> = [];
  for (const item of payload.candidates) {
    const basePortion =
      payload.remaining.kcal > 0 && item.nutrientsPer100g.kcal > 0
        ? clampPortion((payload.remaining.kcal / item.nutrientsPer100g.kcal) * 100)
        : 120;
    const estimated = forPortion(item.nutrientsPer100g, basePortion);
    picks.push({
      item,
      portionG: basePortion,
      estimated,
      score: scoreSuggestion(estimated, payload.remaining),
    });
  }
  picks.sort((a, b) => a.score - b.score);
  const top = picks.slice(0, 4);
  const suggestions: RationSuggestion[] = top.map((pick) => ({
    title: pick.item.title,
    type: pick.item.type,
    portionG: pick.portionG,
    estimated: pick.estimated,
    reason: `Порция близка к остатку по КБЖУ: ~${pick.estimated.kcal} ккал, Б ${pick.estimated.protein} / Ж ${pick.estimated.fat} / У ${pick.estimated.carbs}.`,
  }));

  return {
    summary:
      suggestions.length > 0
        ? "Подобрал варианты из твоих продуктов и блюд, которые лучше всего закрывают остаток по КБЖУ."
        : "Нет подходящих продуктов или блюд для подсказки.",
    suggestions,
    notes: ["Локальный fallback: предложения рассчитаны по макросам и калориям."],
  };
}

function buildPrompt(payload: IncomingPayload): string {
  return `${SYSTEM_PROMPT}

Дата: ${payload.date}
Съедено: ${JSON.stringify(payload.consumed)}
Цель: ${JSON.stringify(payload.target)}
Осталось: ${JSON.stringify(payload.remaining)}
Кандидаты (используй только их): ${JSON.stringify(payload.candidates)}
`;
}

export async function POST(request: Request) {
  let payload: IncomingPayload;
  try {
    payload = (await request.json()) as IncomingPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const fallback = buildLocalFallback(payload);

  const result = await callGemini({
    prompt: buildPrompt(payload),
    responseMimeType: "application/json",
    temperature: 0.35,
    maxOutputTokens: 900,
  });

  if (!result.ok || !result.text) {
    return NextResponse.json(
      {
        ok: true,
        analysis: fallback,
        provider: "rule-based-fallback",
        model: "local-ration-v1",
        fallbackReason: result.errorMessage ?? "AI provider failed",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = safeParseJson<RationAdvice>(result.text);
  if (!parsed || !Array.isArray(parsed.suggestions)) {
    return NextResponse.json(
      {
        ok: true,
        analysis: fallback,
        provider: "rule-based-fallback",
        model: "local-ration-v1",
        fallbackReason: "AI response was not valid JSON",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const normalized: RationAdvice = {
    summary: typeof parsed.summary === "string" && parsed.summary.trim().length > 0 ? parsed.summary.trim() : fallback.summary,
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
      provider: result.providerId,
      model: result.usedModel,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
