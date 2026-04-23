"use client";

import {
  calculateDayTotals,
  dayLogRepo,
  dayTargetRepo,
  foodRepo,
  getWeightForDate,
  mealEntryRepo,
  periodAnalysisRepo,
  recipeIngredientRepo,
  recipeRepo,
  weightLogRepo,
  type DayTarget,
  type PeriodAnalysis,
  type PeriodRangeDays,
} from "@/lib/data";
import type { DayLog, Food, MealEntry, Recipe, RecipeIngredient, WeightLog } from "@/lib/data";
import { buildPeriodAnalysis } from "@/lib/ai";
import { useEffect, useMemo, useState } from "react";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowISO(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}`;
}

function parseWeight(value: string): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export default function ProgressPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState<PeriodRangeDays>(7);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [dayLogs, setDayLogs] = useState<DayLog[]>([]);
  const [dayTargets, setDayTargets] = useState<DayTarget[]>([]);
  const [mealEntries, setMealEntries] = useState<MealEntry[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [analysisCache, setAnalysisCache] = useState<PeriodAnalysis | null>(null);
  const [dateInput, setDateInput] = useState(todayISODate());
  const [weightInput, setWeightInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const today = useMemo(() => todayISODate(), []);

  useEffect(() => {
    loadData()
      .catch((error: unknown) => console.error("Failed to load weight logs", error))
      .finally(() => setIsLoading(false));
  }, []);

  async function loadData() {
    const [weightLogsList, dayLogsList, dayTargetsList, mealEntriesList, foodsList, recipesList, recipeIngredientsList] = await Promise.all([
      weightLogRepo.list(),
      dayLogRepo.list(),
      dayTargetRepo.list(),
      mealEntryRepo.list(),
      foodRepo.list(),
      recipeRepo.list(),
      recipeIngredientRepo.list(),
    ]);

    setWeightLogs([...weightLogsList].sort((a, b) => b.date.localeCompare(a.date)));
    setDayLogs(dayLogsList);
    setDayTargets(dayTargetsList);
    setMealEntries(mealEntriesList);
    setFoods(foodsList);
    setRecipes(recipesList);
    setRecipeIngredients(recipeIngredientsList);
  }

  const todayWeight = useMemo(() => getWeightForDate(weightLogs, today), [weightLogs, today]);

  const foodsById = useMemo(() => new Map(foods.map((food) => [food.id, food])), [foods]);
  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const ingredientsByRecipeId = useMemo(() => {
    const map = new Map<string, RecipeIngredient[]>();
    for (const item of recipeIngredients) {
      const current = map.get(item.recipeId) ?? [];
      current.push(item);
      map.set(item.recipeId, current);
    }
    return map;
  }, [recipeIngredients]);

  const periodDates = useMemo(() => {
    const end = new Date(`${today}T00:00:00`).getTime();
    const start = end - (rangeDays - 1) * 24 * 60 * 60 * 1000;
    return { start, end };
  }, [today, rangeDays]);

  const periodDayLogs = useMemo(() => {
    return dayLogs.filter((log) => {
      const value = new Date(`${log.date}T00:00:00`).getTime();
      return value >= periodDates.start && value <= periodDates.end;
    });
  }, [dayLogs, periodDates]);

  const periodTotals = useMemo(() => {
    return periodDayLogs.map((dayLog) => ({
      dayLog,
      totals: calculateDayTotals({
        dayLog,
        mealEntries: mealEntries.filter((entry) => entry.dayLogId === dayLog.id),
        foodsById,
        recipesById,
        recipeIngredientsByRecipeId: ingredientsByRecipeId,
      }),
    }));
  }, [periodDayLogs, mealEntries, foodsById, recipesById, ingredientsByRecipeId]);

  const periodNutrition = useMemo(() => {
    if (periodTotals.length === 0) {
      return { kcal: 0, protein: 0, fat: 0, carbs: 0, activity: 0 };
    }

    const sums = periodTotals.reduce(
      (acc, item) => ({
        kcal: acc.kcal + item.totals.consumed.kcal,
        protein: acc.protein + item.totals.consumed.protein,
        fat: acc.fat + item.totals.consumed.fat,
        carbs: acc.carbs + item.totals.consumed.carbs,
        activity: acc.activity + item.totals.activeKcal,
      }),
      { kcal: 0, protein: 0, fat: 0, carbs: 0, activity: 0 },
    );

    return {
      kcal: sums.kcal / periodTotals.length,
      protein: sums.protein / periodTotals.length,
      fat: sums.fat / periodTotals.length,
      carbs: sums.carbs / periodTotals.length,
      activity: sums.activity / periodTotals.length,
    };
  }, [periodTotals]);

  const periodWeightPoints = useMemo(() => {
    return [...weightLogs]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((item) => {
        const value = new Date(`${item.date}T00:00:00`).getTime();
        return value >= periodDates.start && value <= periodDates.end;
      })
      .map((item) => ({ date: item.date.slice(5), value: item.weightKg }));
  }, [weightLogs, periodDates]);

  const periodKcalPoints = useMemo(() => {
    return periodTotals
      .map((item) => ({ label: item.dayLog.date.slice(5), value: item.totals.consumed.kcal }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [periodTotals]);

  const periodMacroPoints = useMemo(() => {
    return periodTotals
      .map((item) => ({
        label: item.dayLog.date.slice(5),
        protein: item.totals.consumed.protein,
        fat: item.totals.consumed.fat,
        carbs: item.totals.consumed.carbs,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [periodTotals]);

  const avgWeight = useMemo(() => {
    if (periodWeightPoints.length === 0) return 0;
    return periodWeightPoints.reduce((acc, item) => acc + item.value, 0) / periodWeightPoints.length;
  }, [periodWeightPoints]);

  const weightDelta = useMemo(() => {
    if (periodWeightPoints.length < 2) return 0;
    return periodWeightPoints[periodWeightPoints.length - 1].value - periodWeightPoints[0].value;
  }, [periodWeightPoints]);

  const completedDays = useMemo(() => periodDayLogs.filter((d) => d.status === "completed").length, [periodDayLogs]);

  const planHitRate = useMemo(() => {
    if (periodTotals.length === 0) return 0;
    let hits = 0;
    for (const total of periodTotals) {
      const target = dayTargets.find((item) => item.dayType === total.dayLog.dayType);
      if (!target) continue;
      const inRange =
        total.totals.consumed.kcal >= target.kcalMin &&
        total.totals.consumed.kcal <= target.kcalMax &&
        total.totals.consumed.protein >= target.proteinTarget - 10 &&
        total.totals.consumed.fat >= target.fatMin &&
        total.totals.consumed.fat <= target.fatMax &&
        total.totals.consumed.carbs >= target.carbsMin &&
        total.totals.consumed.carbs <= target.carbsMax;
      if (inRange) hits += 1;
    }
    return (hits / periodTotals.length) * 100;
  }, [periodTotals, dayTargets]);

  const microCoverage = useMemo(() => {
    if (foods.length === 0) return 0;
    const withMicro = foods.filter((food) => food.micronutrientsPer100g || food.vitaminsPer100g).length;
    return (withMicro / foods.length) * 100;
  }, [foods]);

  useEffect(() => {
    const startDate = new Date(periodDates.start).toISOString().slice(0, 10);
    const endDate = new Date(periodDates.end).toISOString().slice(0, 10);
    const analysisId = `period_${rangeDays}_${startDate}_${endDate}`;
    const next = buildPeriodAnalysis({
      rangeDays,
      startDate,
      endDate,
      avgWeight,
      deltaWeight: weightDelta,
      avgKcal: periodNutrition.kcal,
      avgProtein: periodNutrition.protein,
      avgFat: periodNutrition.fat,
      avgCarbs: periodNutrition.carbs,
      avgActivity: periodNutrition.activity,
      completedDays,
      planHitRate,
      micronutrientCoverage: microCoverage,
    });

    const cached: PeriodAnalysis = {
      id: analysisId,
      generatedAt: nowISO(),
      ...next,
    };

    periodAnalysisRepo
      .upsert(cached)
      .then(() => setAnalysisCache(cached))
      .catch((error: unknown) => console.error("Failed to cache period analysis", error));
  }, [rangeDays, periodDates, avgWeight, weightDelta, periodNutrition, completedDays, planHitRate, microCoverage]);

  async function saveWeight(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = parseWeight(weightInput);
    if (!dateInput || value <= 0) return;

    const timestamp = nowISO();
    const existingForDate = await weightLogRepo.getByDate(dateInput);
    const editingEntry = editingId ? weightLogs.find((item) => item.id === editingId) : null;

    const id = editingEntry?.id ?? existingForDate?.id ?? makeId("weight");
    const createdAt = editingEntry?.createdAt ?? existingForDate?.createdAt ?? timestamp;

    const next: WeightLog = {
      id,
      date: dateInput,
      weightKg: value,
      createdAt,
      updatedAt: timestamp,
    };

    await weightLogRepo.upsert(next);
    await loadData();
    resetForm();
  }

  function startEdit(entry: WeightLog) {
    setEditingId(entry.id);
    setDateInput(entry.date);
    setWeightInput(String(entry.weightKg));
  }

  function resetForm() {
    setEditingId(null);
    setDateInput(todayISODate());
    setWeightInput("");
  }

  async function removeEntry(entry: WeightLog) {
    await weightLogRepo.remove(entry.id);
    await loadData();

    if (editingId === entry.id) {
      resetForm();
    }
  }

  return (
    <section className="space-y-4 pb-2 text-neutral-100">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-[#9db0c8]">Отчет</p>
        <h1 className="text-xl font-semibold">Отчет</h1>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {[7, 14, 30].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRangeDays(value as PeriodRangeDays)}
            className={`h-11 rounded-lg text-sm font-semibold ${rangeDays === value ? "accent-btn" : "bg-[#0d1520] text-[#c7d4e5]"}`}
          >
            {value} дней
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <KpiCard label="Вес сегодня" value={todayWeight ? `${formatNumber(todayWeight.weightKg)} кг` : "нет"} />
        <KpiCard label="Средний вес" value={`${formatNumber(avgWeight)} кг`} />
        <KpiCard label="Изменение веса" value={`${weightDelta > 0 ? "+" : ""}${formatNumber(weightDelta)} кг`} />
        <KpiCard label="Средние ккал" value={`${formatNumber(periodNutrition.kcal)} ккал`} />
        <KpiCard
          label="Средние Б/Ж/У"
          value={`${formatNumber(periodNutrition.protein)}/${formatNumber(periodNutrition.fat)}/${formatNumber(periodNutrition.carbs)}`}
        />
        <KpiCard label="Средняя активность" value={`${formatNumber(periodNutrition.activity)} ккал`} />
        <KpiCard label="Завершенных дней" value={`${completedDays}`} />
        <KpiCard label="Попадание в план" value={`${formatNumber(planHitRate)}%`} />
      </div>

      <div className="app-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Вес по дням</p>
        <LineChart points={periodWeightPoints} />
      </div>

      <div className="app-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Калории по дням</p>
        <BarChart points={periodKcalPoints} />
      </div>

      <div className="app-card p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Б/Ж/У по дням</p>
        <MacroTrendChart points={periodMacroPoints} />
      </div>

      {analysisCache ? (
        <div className="app-card p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">AI-анализ периода</p>
          <p className="text-sm text-[#e8f0fc]">{analysisCache.summary}</p>
          <SectionList title="Общий вывод" items={analysisCache.good} />
          <SectionList title="Основные проблемы" items={analysisCache.issues} />
          <SectionList title="Анализ веса и прогресса" items={analysisCache.weightAndProgress} />
          <SectionList title="Анализ питания" items={analysisCache.nutrition} />
          <SectionList title="Анализ активности" items={analysisCache.activity} />
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9db0c8]">Анализ микронутриентов</p>
            <p className="mt-1 text-sm text-[#b8c7da]">{analysisCache.micronutrients.text}</p>
          </div>
          <SectionList title="Что улучшить" items={analysisCache.improve} />
          <SectionList title="Что сократить / убрать" items={analysisCache.reduce} />
        </div>
      ) : null}

      <div className="app-card p-3">
        <p className="text-xs text-[#9db0c8]">
          Микронутриенты: {microCoverage >= 50 ? "данные частично доступны, вывод предварительный" : "Недостаточно данных для точного анализа микронутриентов"}
        </p>
      </div>

      <form onSubmit={saveWeight} className="app-card space-y-3 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-[#9db0c8]">{editingId ? "Редактировать вес" : "Добавить вес"}</p>
        <label className="space-y-1">
          <span className="text-xs text-[#9db0c8]">Дата</span>
          <input
            type="date"
            value={dateInput}
            onChange={(event) => setDateInput(event.target.value)}
            className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-700"
            required
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-[#9db0c8]">Вес, кг</span>
          <input
            type="text"
            inputMode="decimal"
            value={weightInput}
            onChange={(event) => setWeightInput(event.target.value)}
            className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-700"
            placeholder="Например 81.7"
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <button type="submit" className="h-12 rounded-lg accent-btn text-sm font-semibold">
            {editingId ? "Сохранить" : "Добавить"}
          </button>
          <button type="button" onClick={resetForm} className="h-12 rounded-lg bg-[#0d1520] text-sm font-semibold text-[#c7d4e5]">
            Очистить
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-[#9db0c8]">Загрузка...</p>
        ) : weightLogs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#2a3a52] p-4 text-sm text-[#9db0c8]">Записей веса пока нет.</p>
        ) : (
          weightLogs.map((entry) => (
            <article key={entry.id} className="app-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">{entry.date}</p>
                <p className="text-sm">{formatNumber(entry.weightKg)} кг</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(entry)}
                  className="h-10 rounded-lg bg-[#0d1520] px-3 text-xs font-semibold text-[#c7d4e5]"
                >
                  Изм.
                </button>
                <button
                  type="button"
                  onClick={() => removeEntry(entry)}
                  className="h-10 rounded-lg bg-[#2f1220] px-3 text-xs font-semibold text-[#ff7ca4]"
                >
                  Удал.
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-[#9db0c8]">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

function LineChart({ points }: { points: { date: string; value: number }[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-[#9db0c8]">Недостаточно данных.</p>;
  }

  const width = 320;
  const height = 140;
  const padding = 16;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coordinates = points.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return { x, y };
  });

  const polylinePoints = coordinates.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full">
        <polyline fill="none" stroke="#8ff65b" strokeWidth="2" points={polylinePoints} />
        {coordinates.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r="2.5" fill="#8ff65b" />
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-[#8da1bb]">
        <span>{points[0]?.date}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function BarChart({ points }: { points: { label: string; value: number }[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-[#9db0c8]">Недостаточно данных.</p>;
  }

  const max = Math.max(...points.map((point) => point.value)) || 1;

  return (
    <div className="space-y-2">
      <div className="flex h-36 items-end gap-2">
        {points.map((point) => (
          <div key={point.label} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-[#8ff65b]"
              style={{ height: `${Math.max(8, (point.value / max) * 100)}%` }}
              title={`${point.label}: ${formatNumber(point.value)} кг`}
            />
            <p className="text-[10px] text-[#8da1bb]">{point.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MacroTrendChart({
  points,
}: {
  points: Array<{ label: string; protein: number; fat: number; carbs: number }>;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-[#9db0c8]">Недостаточно данных.</p>;
  }

  return (
    <div className="space-y-2">
      {points.map((point) => (
        <div key={point.label} className="rounded-lg bg-[#0b1320] p-2 text-xs">
          <p className="mb-1 text-[#8da1bb]">{point.label}</p>
          <p>
            Б {formatNumber(point.protein)} · Ж {formatNumber(point.fat)} · У {formatNumber(point.carbs)}
          </p>
        </div>
      ))}
    </div>
  );
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#9db0c8]">{title}</p>
      <ul className="mt-1 space-y-1 text-sm text-[#b8c7da]">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}