"use client";

import {
  calculateFoodNutrientsForWeight,
  calculateDayTotals,
  calculateRecipePortionNutrients,
  calculateRemainingToDayTarget,
  dayLogRepo,
  dayTargetRepo,
  foodRepo,
  mealEntryRepo,
  recipeIngredientRepo,
  recipeRepo,
} from "@/lib/data";
import type { DayLog, DayTarget, Food, MealEntry, NutrientsTotal, Recipe, RecipeIngredient } from "@/lib/data";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowISO(): string {
  return new Date().toISOString();
}

function formatTodayDateLabel(dateIso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateIso}T00:00:00`));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function parseWeight(value: string): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100) / 100;
}

type EntryWithNutrients = {
  entry: MealEntry;
  title: string;
  nutrients: NutrientsTotal;
};

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [todayLog, setTodayLog] = useState<DayLog | null>(null);
  const [targets, setTargets] = useState<DayTarget[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingSourceType, setEditingSourceType] = useState<MealEntry["sourceType"]>("food");
  const [editingSourceId, setEditingSourceId] = useState("");
  const [editingWeightInput, setEditingWeightInput] = useState("");

  const todayDate = useMemo(() => todayISODate(), []);
  const todayLabel = useMemo(() => formatTodayDateLabel(todayDate), [todayDate]);

  async function refreshDayEntries(dayLogId: string) {
    const mealEntries = await mealEntryRepo.listByDayLogId(dayLogId);
    setEntries(mealEntries);
  }

  useEffect(() => {
    async function loadTodayData() {
      const [dayLog, dayTargets, foodsList, recipesList, recipeIngredients, mealEntries] = await Promise.all([
        dayLogRepo.getByDate(todayDate),
        dayTargetRepo.list(),
        foodRepo.list(),
        recipeRepo.list(),
        recipeIngredientRepo.list(),
        mealEntryRepo.listByDayLogId(todayDate),
      ]);

      const currentTime = nowISO();
      const safeDayLog: DayLog =
        dayLog ??
        ({
          id: todayDate,
          date: todayDate,
          dayType: "normal",
          activeKcal: 0,
          createdAt: currentTime,
          updatedAt: currentTime,
        } satisfies DayLog);

      if (!dayLog) {
        await dayLogRepo.upsert(safeDayLog);
      }

      setTodayLog(safeDayLog);
      setTargets(dayTargets);
      setFoods(foodsList);
      setRecipes(recipesList);
      setIngredients(recipeIngredients);
      setEntries(mealEntries);
      setIsLoading(false);
    }

    loadTodayData().catch((error: unknown) => {
      console.error("Failed to load today data", error);
      setIsLoading(false);
    });
  }, [todayDate]);

  const foodsById = useMemo(() => new Map(foods.map((food) => [food.id, food])), [foods]);
  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);

  const ingredientsByRecipeId = useMemo(() => {
    const map = new Map<string, RecipeIngredient[]>();
    for (const ingredient of ingredients) {
      const current = map.get(ingredient.recipeId) ?? [];
      current.push(ingredient);
      map.set(ingredient.recipeId, current);
    }
    return map;
  }, [ingredients]);

  const currentTarget = useMemo(() => {
    if (!todayLog) return null;
    return targets.find((target) => target.dayType === todayLog.dayType) ?? null;
  }, [targets, todayLog]);

  const dayTotals = useMemo(() => {
    if (!todayLog) {
      return null;
    }

    return calculateDayTotals({
      dayLog: todayLog,
      mealEntries: entries,
      foodsById,
      recipesById,
      recipeIngredientsByRecipeId: ingredientsByRecipeId,
    });
  }, [todayLog, entries, foodsById, recipesById, ingredientsByRecipeId]);

  const remaining = useMemo(() => {
    if (!dayTotals || !currentTarget) {
      return null;
    }

    return calculateRemainingToDayTarget(dayTotals.consumed, currentTarget);
  }, [dayTotals, currentTarget]);

  const entriesWithNutrients = useMemo<EntryWithNutrients[]>(() => {
    return entries.map((entry) => {
      if (entry.sourceType === "food") {
        const food = foodsById.get(entry.sourceId);
        if (!food) {
          return {
            entry,
            title: "Unknown food",
            nutrients: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
          };
        }

        return {
          entry,
          title: food.name,
          nutrients: calculateFoodNutrientsForWeight(food.nutrientsPer100g, entry.amountG),
        };
      }

      const recipe = recipesById.get(entry.sourceId);
      if (!recipe) {
        return {
          entry,
          title: "Unknown recipe",
          nutrients: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
        };
      }

      const recipeIngredients = ingredientsByRecipeId.get(recipe.id) ?? [];
      return {
        entry,
        title: recipe.name,
        nutrients: calculateRecipePortionNutrients(recipe, recipeIngredients, foodsById, entry.amountG),
      };
    });
  }, [entries, foodsById, recipesById, ingredientsByRecipeId]);

  async function updateDayType(dayType: DayLog["dayType"]) {
    if (!todayLog) return;
    const updated: DayLog = { ...todayLog, dayType, updatedAt: nowISO() };
    setTodayLog(updated);
    await dayLogRepo.upsert(updated);
  }

  async function updateActiveKcal(value: number) {
    if (!todayLog) return;
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    const updated: DayLog = { ...todayLog, activeKcal: safeValue, updatedAt: nowISO() };
    setTodayLog(updated);
    await dayLogRepo.upsert(updated);
  }

  function startEditingEntry(entry: MealEntry) {
    setEditingEntryId(entry.id);
    setEditingSourceType(entry.sourceType);
    setEditingSourceId(entry.sourceId);
    setEditingWeightInput(String(entry.amountG));
  }

  function cancelEditingEntry() {
    setEditingEntryId(null);
    setEditingSourceType("food");
    setEditingSourceId("");
    setEditingWeightInput("");
  }

  async function saveEntryEdit(entry: MealEntry) {
    const weightG = parseWeight(editingWeightInput);
    if (!editingSourceId || weightG <= 0) return;

    const updatedEntry: MealEntry = {
      ...entry,
      sourceType: editingSourceType,
      sourceId: editingSourceId,
      amountG: weightG,
      updatedAt: nowISO(),
    };

    await mealEntryRepo.upsert(updatedEntry);
    await refreshDayEntries(entry.dayLogId);
    cancelEditingEntry();
  }

  async function deleteEntry(entry: MealEntry) {
    await mealEntryRepo.remove(entry.id);
    await refreshDayEntries(entry.dayLogId);
    if (editingEntryId === entry.id) {
      cancelEditingEntry();
    }
  }

  if (isLoading || !todayLog) {
    return <section className="py-4 text-sm text-neutral-500">Loading...</section>;
  }

  return (
    <section className="space-y-4 pb-2">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Today</p>
        <h1 className="text-xl font-semibold capitalize">{todayLabel}</h1>
      </header>

      <div className="rounded-xl border border-neutral-200 p-3">
        <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Тип дня</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => updateDayType("normal")}
            className={`h-12 rounded-lg text-sm font-semibold ${
              todayLog.dayType === "normal" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
            }`}
          >
            Обычный
          </button>
          <button
            type="button"
            onClick={() => updateDayType("strength")}
            className={`h-12 rounded-lg text-sm font-semibold ${
              todayLog.dayType === "strength" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
            }`}
          >
            Силовой
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
        <label htmlFor="active-kcal" className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
          Активные ккал
        </label>
        <input
          id="active-kcal"
          type="number"
          min={0}
          value={todayLog.activeKcal}
          onChange={(event) => updateActiveKcal(Number(event.target.value))}
          className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-700"
        />
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">Съедено</p>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Калории" value={dayTotals?.consumed.kcal ?? 0} unit="ккал" />
          <Stat label="Белки" value={dayTotals?.consumed.protein ?? 0} unit="г" />
          <Stat label="Жиры" value={dayTotals?.consumed.fat ?? 0} unit="г" />
          <Stat label="Углеводы" value={dayTotals?.consumed.carbs ?? 0} unit="г" />
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 p-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">Осталось до цели</p>
        {remaining ? (
          <div className="space-y-2 text-sm">
            <Row label="Калории" value={`${formatNumber(remaining.kcalMin)}..${formatNumber(remaining.kcalMax)} ккал`} />
            <Row label="Белки" value={`${formatNumber(remaining.protein)} г`} />
            <Row label="Жиры" value={`${formatNumber(remaining.fatMin)}..${formatNumber(remaining.fatMax)} г`} />
            <Row label="Углеводы" value={`${formatNumber(remaining.carbsMin)}..${formatNumber(remaining.carbsMax)} г`} />
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Цели дня не найдены.</p>
        )}
      </div>

      <div className="rounded-xl border border-neutral-200 p-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">Записи за день</p>
        {entriesWithNutrients.length === 0 ? (
          <p className="text-sm text-neutral-500">Пока нет записей. Добавь первый прием пищи.</p>
        ) : (
          <ul className="space-y-2">
            {entriesWithNutrients.map(({ entry, title, nutrients }) => (
              <li key={entry.id} className="rounded-lg bg-neutral-50 p-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-neutral-500">{entry.amountG} г</p>
                </div>
                <p className="text-xs text-neutral-600">
                  {formatNumber(nutrients.kcal)} ккал · Б {formatNumber(nutrients.protein)} · Ж {formatNumber(nutrients.fat)} · У{" "}
                  {formatNumber(nutrients.carbs)}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => startEditingEntry(entry)}
                    className="h-10 rounded-lg bg-neutral-200 px-3 text-xs font-semibold text-neutral-800"
                  >
                    Изм.
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteEntry(entry)}
                    className="h-10 rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-700"
                  >
                    Удал.
                  </button>
                </div>

                {editingEntryId === entry.id ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 bg-white p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSourceType("food");
                          setEditingSourceId("");
                        }}
                        className={`h-10 rounded-lg text-xs font-semibold ${
                          editingSourceType === "food" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
                        }`}
                      >
                        Продукт
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSourceType("recipe");
                          setEditingSourceId("");
                        }}
                        className={`h-10 rounded-lg text-xs font-semibold ${
                          editingSourceType === "recipe" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
                        }`}
                      >
                        Блюдо
                      </button>
                    </div>

                    <select
                      value={editingSourceId}
                      onChange={(event) => setEditingSourceId(event.target.value)}
                      className="h-10 w-full rounded-lg border border-neutral-300 px-2 text-sm outline-none focus:border-neutral-700"
                    >
                      <option value="">Выбери {editingSourceType === "food" ? "продукт" : "блюдо"}</option>
                      {(editingSourceType === "food" ? foods : recipes).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      inputMode="decimal"
                      value={editingWeightInput}
                      onChange={(event) => setEditingWeightInput(event.target.value)}
                      placeholder="Вес, г"
                      className="h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-700"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => saveEntryEdit(entry)}
                        disabled={!editingSourceId || parseWeight(editingWeightInput) <= 0}
                        className="h-10 rounded-lg bg-neutral-900 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditingEntry}
                        className="h-10 rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-800"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href="/add-entry"
        className="flex h-12 w-full items-center justify-center rounded-lg bg-neutral-900 text-sm font-semibold text-white"
      >
        Быстро добавить еду
      </Link>
    </section>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">
        {formatNumber(value)} {unit}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-neutral-600">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
