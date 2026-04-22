"use client";

import {
  calculateDayTotals,
  calculateWeeklyAverages,
  dayLogRepo,
  foodRepo,
  getWeightForDate,
  getWeeklyAverageWeight,
  mealEntryRepo,
  recipeIngredientRepo,
  recipeRepo,
  weightLogRepo,
} from "@/lib/data";
import type { DayLog, Food, MealEntry, Recipe, RecipeIngredient, WeightLog } from "@/lib/data";
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
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [dayLogs, setDayLogs] = useState<DayLog[]>([]);
  const [mealEntries, setMealEntries] = useState<MealEntry[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
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
    const [weightLogsList, dayLogsList, mealEntriesList, foodsList, recipesList, recipeIngredientsList] = await Promise.all([
      weightLogRepo.list(),
      dayLogRepo.list(),
      mealEntryRepo.list(),
      foodRepo.list(),
      recipeRepo.list(),
      recipeIngredientRepo.list(),
    ]);

    setWeightLogs([...weightLogsList].sort((a, b) => b.date.localeCompare(a.date)));
    setDayLogs(dayLogsList);
    setMealEntries(mealEntriesList);
    setFoods(foodsList);
    setRecipes(recipesList);
    setRecipeIngredients(recipeIngredientsList);
  }

  const todayWeight = useMemo(() => getWeightForDate(weightLogs, today), [weightLogs, today]);
  const weeklyAverageWeight = useMemo(() => getWeeklyAverageWeight(weightLogs, today), [weightLogs, today]);

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

  const weeklyNutrition = useMemo(() => {
    const weekStart = new Date(`${today}T00:00:00`).getTime() - 6 * 24 * 60 * 60 * 1000;
    const weekDayLogs = dayLogs.filter((log) => {
      const value = new Date(`${log.date}T00:00:00`).getTime();
      return value >= weekStart && value <= new Date(`${today}T00:00:00`).getTime();
    });

    const totals = weekDayLogs.map((dayLog) =>
      calculateDayTotals({
        dayLog,
        mealEntries: mealEntries.filter((entry) => entry.dayLogId === dayLog.id),
        foodsById,
        recipesById,
        recipeIngredientsByRecipeId: ingredientsByRecipeId,
      }),
    );

    return calculateWeeklyAverages(totals);
  }, [today, dayLogs, mealEntries, foodsById, recipesById, ingredientsByRecipeId]);

  const dailyWeightPoints = useMemo(() => {
    return [...weightLogs]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map((item) => ({ date: item.date.slice(5), value: item.weightKg }));
  }, [weightLogs]);

  const weeklyWeightPoints = useMemo(() => {
    const grouped = new Map<string, number[]>();

    for (const entry of weightLogs) {
      const key = getWeekKey(entry.date);
      const current = grouped.get(key) ?? [];
      current.push(entry.weightKg);
      grouped.set(key, current);
    }

    return [...grouped.entries()]
      .map(([week, values]) => ({
        label: week,
        value: values.reduce((acc, v) => acc + v, 0) / values.length,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-8);
  }, [weightLogs]);

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
    <section className="space-y-4 pb-2">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Прогресс</p>
        <h1 className="text-xl font-semibold">Прогресс</h1>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <KpiCard label="Вес сегодня" value={todayWeight ? `${formatNumber(todayWeight.weightKg)} кг` : "нет"} />
        <KpiCard label="Вес 7д ср." value={`${formatNumber(weeklyAverageWeight)} кг`} />
        <KpiCard label="Ккал 7д ср." value={`${formatNumber(weeklyNutrition.kcal)} ккал`} />
        <KpiCard
          label="Б/Ж/У 7д ср."
          value={`${formatNumber(weeklyNutrition.protein)}/${formatNumber(weeklyNutrition.fat)}/${formatNumber(weeklyNutrition.carbs)}`}
        />
      </div>

      <div className="rounded-xl border border-neutral-200 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Вес по дням</p>
        <LineChart points={dailyWeightPoints} />
      </div>

      <div className="rounded-xl border border-neutral-200 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Средний вес по неделям</p>
        <BarChart points={weeklyWeightPoints} />
      </div>

      <form onSubmit={saveWeight} className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{editingId ? "Редактировать вес" : "Добавить вес"}</p>
        <label className="space-y-1">
          <span className="text-xs text-neutral-500">Дата</span>
          <input
            type="date"
            value={dateInput}
            onChange={(event) => setDateInput(event.target.value)}
            className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-700"
            required
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs text-neutral-500">Вес, кг</span>
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
          <button type="submit" className="h-12 rounded-lg bg-neutral-900 text-sm font-semibold text-white">
            {editingId ? "Сохранить" : "Добавить"}
          </button>
          <button type="button" onClick={resetForm} className="h-12 rounded-lg bg-neutral-100 text-sm font-semibold text-neutral-800">
            Очистить
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-neutral-500">Загрузка...</p>
        ) : weightLogs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">Записей веса пока нет.</p>
        ) : (
          weightLogs.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-neutral-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">{entry.date}</p>
                <p className="text-sm">{formatNumber(entry.weightKg)} кг</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(entry)}
                  className="h-10 rounded-lg bg-neutral-100 px-3 text-xs font-semibold text-neutral-800"
                >
                  Изм.
                </button>
                <button
                  type="button"
                  onClick={() => removeEntry(entry)}
                  className="h-10 rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-700"
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

function getWeekKey(date: string): string {
  const current = new Date(`${date}T00:00:00`);
  const day = (current.getDay() + 6) % 7;
  current.setDate(current.getDate() - day);
  const year = current.getFullYear();
  const first = new Date(year, 0, 1);
  const week = Math.ceil(((current.getTime() - first.getTime()) / 86400000 + first.getDay() + 1) / 7);
  return `${String(year).slice(2)}-W${String(week).padStart(2, "0")}`;
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

function LineChart({ points }: { points: { date: string; value: number }[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-neutral-500">Недостаточно данных.</p>;
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
        <polyline fill="none" stroke="#171717" strokeWidth="2" points={polylinePoints} />
        {coordinates.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r="2.5" fill="#171717" />
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-neutral-500">
        <span>{points[0]?.date}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function BarChart({ points }: { points: { label: string; value: number }[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-neutral-500">Недостаточно данных.</p>;
  }

  const max = Math.max(...points.map((point) => point.value)) || 1;

  return (
    <div className="space-y-2">
      <div className="flex h-36 items-end gap-2">
        {points.map((point) => (
          <div key={point.label} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-neutral-900"
              style={{ height: `${Math.max(8, (point.value / max) * 100)}%` }}
              title={`${point.label}: ${formatNumber(point.value)} кг`}
            />
            <p className="text-[10px] text-neutral-500">{point.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}