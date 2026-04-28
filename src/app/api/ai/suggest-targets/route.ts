import { NextResponse } from "next/server";
import { collectResponseWithFallback, LlmClientError, NVIDIA_MODEL, safeParseJson } from "@/services/llmClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE_MODEL = NVIDIA_MODEL;

type IncomingPayload = {
  heightCm: number;
  currentWeightKg: number;
  goalWeightKg: number;
  activityKcal: number;
};

type SuggestedTargets = {
  goalType: "loss" | "gain" | "maintenance";
  normal: {
    kcalMin: number;
    kcalMax: number;
    proteinTarget: number;
    fatMin: number;
    fatMax: number;
    carbsMin: number;
    carbsMax: number;
  };
  strength: {
    kcalMin: number;
    kcalMax: number;
    proteinTarget: number;
    fatMin: number;
    fatMax: number;
    carbsMin: number;
    carbsMax: number;
  };
  summary: string;
};

function round(value: number): number {
  return Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeFallback(payload: IncomingPayload): SuggestedTargets {
  const goalDelta = payload.goalWeightKg - payload.currentWeightKg;
  const goalType: SuggestedTargets["goalType"] = goalDelta < -0.4 ? "loss" : goalDelta > 0.4 ? "gain" : "maintenance";

  const maintenance = payload.currentWeightKg * 30 + payload.activityKcal;
  const adjustment = goalType === "loss" ? -350 : goalType === "gain" ? 300 : 0;
  const normalCenter = Math.max(1200, maintenance + adjustment);
  const strengthCenter = normalCenter + 180;
  const protein = round(payload.currentWeightKg * (goalType === "gain" ? 2.0 : 2.2));
  const fatMin = round(clamp(payload.currentWeightKg * 0.7, 45, 120));
  const fatMax = fatMin + 12;

  function build(center: number, extraCarbs = 0) {
    const kcalMin = round(center - 120);
    const kcalMax = round(center + 120);
    const carbsMin = round(Math.max(40, (kcalMin - protein * 4 - fatMax * 9) / 4 + extraCarbs));
    const carbsMax = round(Math.max(carbsMin + 20, (kcalMax - protein * 4 - fatMin * 9) / 4 + extraCarbs));
    return {
      kcalMin,
      kcalMax,
      proteinTarget: protein,
      fatMin,
      fatMax,
      carbsMin,
      carbsMax,
    };
  }

  return {
    goalType,
    normal: build(normalCenter),
    strength: build(strengthCenter, 20),
    summary:
      goalType === "loss"
        ? "Сформирован умеренный дефицит для снижения веса с акцентом на белок."
        : goalType === "gain"
          ? "Сформирован профицит для набора с повышенными углеводами в силовой день."
          : "Сформированы поддерживающие цели с умеренной периодизацией по углеводам.",
  };
}

function buildPrompt(payload: IncomingPayload): string {
  return `Ты спортивный нутрициолог. Рассчитай цели КБЖУ для обычного и силового дня.
Верни ТОЛЬКО JSON:
{
  "goalType": "loss|gain|maintenance",
  "normal": { "kcalMin": 0, "kcalMax": 0, "proteinTarget": 0, "fatMin": 0, "fatMax": 0, "carbsMin": 0, "carbsMax": 0 },
  "strength": { "kcalMin": 0, "kcalMax": 0, "proteinTarget": 0, "fatMin": 0, "fatMax": 0, "carbsMin": 0, "carbsMax": 0 },
  "summary": "1-2 предложения на русском"
}

Данные:
- Рост: ${payload.heightCm} см
- Текущий вес: ${payload.currentWeightKg} кг
- Целевой вес: ${payload.goalWeightKg} кг
- Средняя дневная активность: ${payload.activityKcal} ккал

Требования:
- Реалистичные числа для долгосрочного режима.
- Белок не занижай.
- Для силового дня калории и углеводы обычно выше.
- Только JSON без markdown и комментариев.`;
}

function normalize(parsed: SuggestedTargets | null, fallback: SuggestedTargets): SuggestedTargets {
  if (!parsed) return fallback;
  const goalType = parsed.goalType === "gain" || parsed.goalType === "maintenance" ? parsed.goalType : "loss";
  const take = (src: SuggestedTargets["normal"], fb: SuggestedTargets["normal"]) => ({
    kcalMin: Number.isFinite(src?.kcalMin) ? round(src.kcalMin) : fb.kcalMin,
    kcalMax: Number.isFinite(src?.kcalMax) ? round(src.kcalMax) : fb.kcalMax,
    proteinTarget: Number.isFinite(src?.proteinTarget) ? round(src.proteinTarget) : fb.proteinTarget,
    fatMin: Number.isFinite(src?.fatMin) ? round(src.fatMin) : fb.fatMin,
    fatMax: Number.isFinite(src?.fatMax) ? round(src.fatMax) : fb.fatMax,
    carbsMin: Number.isFinite(src?.carbsMin) ? round(src.carbsMin) : fb.carbsMin,
    carbsMax: Number.isFinite(src?.carbsMax) ? round(src.carbsMax) : fb.carbsMax,
  });
  return {
    goalType,
    normal: take(parsed.normal, fallback.normal),
    strength: take(parsed.strength, fallback.strength),
    summary: typeof parsed.summary === "string" && parsed.summary.trim().length > 0 ? parsed.summary.trim() : fallback.summary,
  };
}

export async function POST(request: Request) {
  let payload: IncomingPayload;
  try {
    payload = (await request.json()) as IncomingPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const fallback = makeFallback(payload);

  try {
    const response = await collectResponseWithFallback([{ role: "user", content: buildPrompt(payload) }], {
      maxTokens: 700,
      timeoutMs: 45000,
      temperature: 0.2,
    });
    const parsed = safeParseJson<SuggestedTargets>(response.mergedText);
    return NextResponse.json(
      {
        ok: true,
        targets: normalize(parsed, fallback),
        provider: response.provider,
        model: response.model,
        routeModel: ROUTE_MODEL,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof LlmClientError ? error.message : "AI provider failed";
    console.error("suggest-targets LLM error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      {
        ok: true,
        targets: fallback,
        provider: "rule-based-fallback",
        model: "local-targets-v1",
        routeModel: ROUTE_MODEL,
        fallbackReason: message,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}

