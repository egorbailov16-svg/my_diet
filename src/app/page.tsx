"use client";

import {
  calculateFoodNutrientsForWeight,
  calculateDayTotals,
  calculateRecipeNutrientDetails,
  calculateRecipePortionNutrients,
  calculateRemainingToDayTarget,
  dayLogRepo,
  dayTargetRepo,
  foodRepo,
  mealEntryRepo,
  type DayStatus,
  resolveFoodNutrientDetails,
  recipeIngredientRepo,
  recipeRepo,
} from "@/lib/data";
import type { DayLog, DayTarget, Food, MealEntry, NutrientsTotal, Recipe, RecipeIngredient } from "@/lib/data";
import { buildDayAnalysis } from "@/lib/ai";
import { Pencil, Trash2 } from "lucide-react";
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

function hasAnyNutrients(map?: Record<string, number>): boolean {
  return !!map && Object.keys(map).length > 0;
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
    let cancelled = false;

    async function loadTodayData(isInitial: boolean) {
      const currentTime = nowISO();

      const fallbackLog: DayLog = {
        id: todayDate,
        date: todayDate,
        dayType: "normal",
        status: "active",
        activeKcal: 0,
        activitySource: "manual",
        healthSyncStatus: "idle",
        manualActivityOverride: false,
        healthPermissionsState: "unknown",
        createdAt: currentTime,
        updatedAt: currentTime,
      };

      const [dayLog, dayTargets, foodsList, recipesList, recipeIngredients, mealEntries] = await Promise.all([
        dayLogRepo.getByDate(todayDate),
        dayTargetRepo.list(),
        foodRepo.list(),
        recipeRepo.list(),
        recipeIngredientRepo.list(),
        mealEntryRepo.listByDayLogId(todayDate),
      ]);

      if (cancelled) return;

      const safeDayLog: DayLog = dayLog ?? fallbackLog;

      if (!dayLog && isInitial) {
        await dayLogRepo.upsert(safeDayLog);
      }

      setTodayLog(safeDayLog);
      setTargets(dayTargets);
      setFoods(foodsList);
      setRecipes(recipesList);
      setIngredients(recipeIngredients);
      setEntries(mealEntries);
      if (isInitial) setIsLoading(false);
    }

    loadTodayData(true).catch((error: unknown) => {
      console.error("Failed to load today data", error);
      setIsLoading(false);
    });

    const intervalId = window.setInterval(() => {
      loadTodayData(false).catch((error: unknown) => console.error("Background today sync failed", error));
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
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
            title: "Неизвестный продукт",
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
          title: "Неизвестный рецепт",
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
    const updated: DayLog = {
      ...todayLog,
      activeKcal: safeValue,
      activitySource: "manual",
      updatedAt: nowISO(),
    };
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
    if (todayLog?.status === "completed") {
      const logUpdated = {
        ...todayLog,
        status: "active" as DayStatus,
        dayAnalysis: undefined,
        dayAnalysisAt: undefined,
        updatedAt: nowISO(),
      };
      setTodayLog(logUpdated);
      await dayLogRepo.upsert(logUpdated);
    }
    await refreshDayEntries(entry.dayLogId);
    cancelEditingEntry();
  }

  async function deleteEntry(entry: MealEntry) {
    await mealEntryRepo.remove(entry.id);
    if (todayLog?.status === "completed") {
      const logUpdated = {
        ...todayLog,
        status: "active" as DayStatus,
        dayAnalysis: undefined,
        dayAnalysisAt: undefined,
        updatedAt: nowISO(),
      };
      setTodayLog(logUpdated);
      await dayLogRepo.upsert(logUpdated);
    }
    await refreshDayEntries(entry.dayLogId);
    if (editingEntryId === entry.id) {
      cancelEditingEntry();
    }
  }

  async function finishDay() {
    if (!todayLog || !dayTotals) return;
    const totalEntries = entries.length;
    const entriesWithDetails = entries.reduce((acc, entry) => {
      if (entry.sourceType === "food") {
        const food = foodsById.get(entry.sourceId);
        if (!food) return acc;
        const details = resolveFoodNutrientDetails(food);
        return hasAnyNutrients(details.micronutrientsPer100g) || hasAnyNutrients(details.vitaminsPer100g) ? acc + 1 : acc;
      }
      const recipe = recipesById.get(entry.sourceId);
      if (!recipe) return acc;
      const recipeIngredients = ingredientsByRecipeId.get(recipe.id) ?? [];
      const details = calculateRecipeNutrientDetails(recipe, recipeIngredients, foodsById);
      return hasAnyNutrients(details.micronutrientsPer100g) || hasAnyNutrients(details.vitaminsPer100g) ? acc + 1 : acc;
    }, 0);
    const micronutrientCoverage = totalEntries > 0 ? (entriesWithDetails / totalEntries) * 100 : 0;
    const nextAnalysis = buildDayAnalysis({
      dayLog: todayLog,
      target: currentTarget,
      consumed: dayTotals.consumed,
      netKcal: dayTotals.netKcal,
      micronutrientCoverage,
    });
    const updated: DayLog = {
      ...todayLog,
      status: "completed",
      dayAnalysis: nextAnalysis,
      dayAnalysisAt: nowISO(),
      updatedAt: nowISO(),
    };
    setTodayLog(updated);
    await dayLogRepo.upsert(updated);
  }

  async function reopenDay() {
    if (!todayLog) return;
    const updated: DayLog = {
      ...todayLog,
      status: "active",
      updatedAt: nowISO(),
    };
    setTodayLog(updated);
    await dayLogRepo.upsert(updated);
  }

  if (isLoading || !todayLog) {
    return <section className="py-4 text-sm text-[#9db0c8]">Загрузка...</section>;
  }

  return (
    <section className="space-y-4 pb-2 text-neutral-100">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="screen-subtitle capitalize">{todayLabel}</p>
            <h1 className="screen-title">Сегодня</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/settings" className="glass-icon-btn" aria-label="Настройки">
              ⚙
            </Link>
            <button type="button" className="glass-icon-btn" aria-label="Дополнительно">
              ⋯
            </button>
          </div>
        </div>
      </header>

      <div className="app-card p-3">
        <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Тип дня</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => updateDayType("normal")}
            className={`h-12 rounded-lg text-sm font-semibold ${
              todayLog.dayType === "normal" ? "accent-btn" : "pill-segment text-[#c7d4e5]"
            }`}
          >
            Обычный
          </button>
          <button
            type="button"
            onClick={() => updateDayType("strength")}
            className={`h-12 rounded-lg text-sm font-semibold ${
              todayLog.dayType === "strength" ? "accent-btn" : "pill-segment text-[#c7d4e5]"
            }`}
          >
            Силовой
          </button>
        </div>
      </div>

      <div className="app-card p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Итоги за день</p>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Калории" value={dayTotals?.consumed.kcal ?? 0} unit="ккал" />
          <Stat label="Белки" value={dayTotals?.consumed.protein ?? 0} unit="г" />
          <Stat label="Жиры" value={dayTotals?.consumed.fat ?? 0} unit="г" />
          <Stat label="Углеводы" value={dayTotals?.consumed.carbs ?? 0} unit="г" />
          <Stat label="Активные ккал" value={todayLog.activeKcal} unit="ккал" />
        </div>
      </div>

      <div className="app-card p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Прогресс по цели</p>
        {currentTarget && dayTotals ? (
          <div className="mt-3 space-y-2">
            <ProgressRow
              label="Калории"
              value={dayTotals.consumed.kcal}
              target={(currentTarget.kcalMin + currentTarget.kcalMax) / 2}
              unit="ккал"
            />
            <ProgressRow label="Белки" value={dayTotals.consumed.protein} target={currentTarget.proteinTarget} unit="г" />
            <ProgressRow
              label="Жиры"
              value={dayTotals.consumed.fat}
              target={(currentTarget.fatMin + currentTarget.fatMax) / 2}
              unit="г"
            />
            <ProgressRow
              label="Углеводы"
              value={dayTotals.consumed.carbs}
              target={(currentTarget.carbsMin + currentTarget.carbsMax) / 2}
              unit="г"
            />
          </div>
        ) : null}
        {!currentTarget ? <p className="text-sm text-[#9db0c8]">Цели дня не найдены.</p> : null}
      </div>

      <div className="app-card p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Осталось до цели</p>
        {remaining ? (
          <div className="space-y-2 text-sm">
            <Row label="Калории" value={`${formatNumber(remaining.kcalMin)}..${formatNumber(remaining.kcalMax)} ккал`} />
            <Row label="Белки" value={`${formatNumber(remaining.protein)} г`} />
            <Row label="Жиры" value={`${formatNumber(remaining.fatMin)}..${formatNumber(remaining.fatMax)} г`} />
            <Row label="Углеводы" value={`${formatNumber(remaining.carbsMin)}..${formatNumber(remaining.carbsMax)} г`} />
          </div>
        ) : (
          <p className="text-sm text-[#9db0c8]">Цели дня не найдены.</p>
        )}
      </div>

      <div className="app-card p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Записи за день</p>
        {entriesWithNutrients.length === 0 ? (
          <p className="text-sm text-[#9db0c8]">Пока нет записей. Добавь первый прием пищи.</p>
        ) : (
          <ul className="space-y-2">
            {entriesWithNutrients.map(({ entry, title, nutrients }) => (
              <li key={entry.id} className="rounded-lg bg-[#0b1320] p-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-[#8da1bb]">{entry.amountG} г</p>
                </div>
                <p className="text-xs text-[#b8c7da]">
                  {formatNumber(nutrients.kcal)} ккал · Б {formatNumber(nutrients.protein)} · Ж {formatNumber(nutrients.fat)} · У{" "}
                  {formatNumber(nutrients.carbs)}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => startEditingEntry(entry)}
                    className="icon-action-btn secondary-btn"
                    aria-label={`Редактировать ${title}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteEntry(entry)}
                    className="icon-action-btn danger-btn"
                    aria-label={`Удалить ${title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {editingEntryId === entry.id ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-[#233247] bg-[#0a111b] p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSourceType("food");
                          setEditingSourceId("");
                        }}
                        className={`h-10 rounded-lg text-xs font-semibold ${
                          editingSourceType === "food" ? "accent-btn" : "bg-[#0d1520] text-[#c7d4e5]"
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
                          editingSourceType === "recipe" ? "accent-btn" : "bg-[#0d1520] text-[#c7d4e5]"
                        }`}
                      >
                        Блюдо
                      </button>
                    </div>

                    <select
                      value={editingSourceId}
                      onChange={(event) => setEditingSourceId(event.target.value)}
                      className="h-10 w-full rounded-lg  px-2 text-sm outline-none "
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
                      className="h-10 w-full rounded-lg  px-3 text-sm outline-none "
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => saveEntryEdit(entry)}
                        disabled={!editingSourceId || parseWeight(editingWeightInput) <= 0}
                        className="h-10 rounded-lg accent-btn text-xs font-semibold disabled:opacity-40"
                      >
                        Сохранить
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditingEntry}
                        className="h-10 rounded-lg bg-[#0d1520] text-xs font-semibold text-[#c7d4e5]"
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

      <div className="app-card p-4">
        <label htmlFor="active-kcal" className="mb-2 block text-xs font-medium uppercase tracking-wide text-[#9db0c8]">
          Активные ккал (ручной ввод)
        </label>
        <input
          id="active-kcal"
          type="number"
          min={0}
          value={todayLog.activeKcal}
          onChange={(event) => updateActiveKcal(Number(event.target.value))}
          className="h-12 w-full rounded-lg  px-3 text-base outline-none "
        />
      </div>

      <div className="app-card p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Завершение дня</p>
        <p className="mb-3 text-sm text-[#b8c7da]">Статус: {todayLog.status === "completed" ? "завершен" : "активный"}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={finishDay} className="h-11 rounded-lg accent-btn text-sm font-semibold">
            Закончить день
          </button>
          <button type="button" onClick={reopenDay} className="h-11 rounded-lg bg-[#0d1520] text-sm font-semibold text-[#c7d4e5]">
            Открыть снова
          </button>
        </div>
      </div>

      {todayLog.dayAnalysis ? (
      <div className="app-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Итог дня</p>
          <p className="text-sm text-[#e8f0fc]">{todayLog.dayAnalysis.summary}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#9db0c8]">Что хорошо</p>
          <ul className="mt-1 space-y-1 text-sm text-[#b8c7da]">
            {todayLog.dayAnalysis.good.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#9db0c8]">Что плохо</p>
          <ul className="mt-1 space-y-1 text-sm text-[#b8c7da]">
            {todayLog.dayAnalysis.issues.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#9db0c8]">Что исправить завтра</p>
          <ul className="mt-1 space-y-1 text-sm text-[#b8c7da]">
            {todayLog.dayAnalysis.nextDayActions.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link
        href="/add-entry"
        className="flex h-12 w-full items-center justify-center rounded-2xl accent-btn text-sm font-semibold"
      >
        Быстро добавить еду
      </Link>
    </section>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="app-subcard p-3">
      <p className="text-xs text-[#8da1bb]">{label}</p>
      <p className="mt-1 text-[1.35rem] font-semibold leading-none tracking-[-0.01em]">
        {formatNumber(value)} {unit}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[#b8c7da]">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function ProgressRow({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const safeTarget = target > 0 ? target : 1;
  const ratio = Math.max(0, Math.min(1, value / safeTarget));
  const progressColor =
    label === "Белки"
      ? "linear-gradient(90deg,#73df3f,#84e14b)"
      : label === "Жиры"
        ? "linear-gradient(90deg,#ff4d5e,#ff6a79)"
        : label === "Углеводы"
          ? "linear-gradient(90deg,#3e82ff,#5ca1ff)"
          : "linear-gradient(90deg,#84e14b,#a2ff72)";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-[#b8c7da]">
        <span>{label}</span>
        <span>
          {formatNumber(value)} / {formatNumber(target)} {unit}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-[#1b2a3f]">
        <div
          className="h-full rounded-full shadow-[0_0_14px_rgba(132,225,75,0.35)]"
          style={{ width: `${ratio * 100}%`, background: progressColor }}
        />
      </div>
    </div>
  );
}
