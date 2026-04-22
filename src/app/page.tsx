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
import { createHealthProvider } from "@/lib/health";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

type EntryWithNutrients = {
  entry: MealEntry;
  title: string;
  nutrients: NutrientsTotal;
};

export default function Home() {
  const healthProvider = useMemo(() => createHealthProvider(), []);
  const isHealthSupported = healthProvider.id !== "unavailable";
  const todayLogRef = useRef<DayLog | null>(null);
  const isHealthSyncingRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isHealthSyncing, setIsHealthSyncing] = useState(false);
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

  useEffect(() => {
    todayLogRef.current = todayLog;
  }, [todayLog]);

  async function refreshDayEntries(dayLogId: string) {
    const mealEntries = await mealEntryRepo.listByDayLogId(dayLogId);
    setEntries(mealEntries);
  }

  useEffect(() => {
    async function loadTodayData() {
      const currentTime = nowISO();

      const fallbackLog: DayLog = {
        id: todayDate,
        date: todayDate,
        dayType: "normal",
        activeKcal: 0,
        activitySource: "manual",
        healthSyncStatus: "idle",
        manualActivityOverride: false,
        healthPermissionsState: "unknown",
        createdAt: currentTime,
        updatedAt: currentTime,
      };

      try {
        const [dayLog, dayTargets, foodsList, recipesList, recipeIngredients, mealEntries] = await withTimeout(
          Promise.all([
            dayLogRepo.getByDate(todayDate),
            dayTargetRepo.list(),
            foodRepo.list(),
            recipeRepo.list(),
            recipeIngredientRepo.list(),
            mealEntryRepo.listByDayLogId(todayDate),
          ]),
          5000,
        );

        const safeDayLog: DayLog = dayLog ?? fallbackLog;

        if (!dayLog) {
          await dayLogRepo.upsert(safeDayLog);
        }

        setTodayLog(safeDayLog);
        setTargets(dayTargets);
        setFoods(foodsList);
        setRecipes(recipesList);
        setIngredients(recipeIngredients);
        setEntries(mealEntries);
      } catch (error) {
        console.error("Today data load fallback activated", error);
        // Fail-safe: render quickly even if IndexedDB is slow/unavailable.
        setTodayLog(fallbackLog);
        setTargets([]);
        setFoods([]);
        setRecipes([]);
        setIngredients([]);
        setEntries([]);
      } finally {
        setIsLoading(false);
      }
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

  const syncHealthActiveCalories = useCallback(async (log: DayLog, requestPermission: boolean) => {
    if (!isHealthSupported) {
      if (log.healthSyncStatus !== "unavailable" || log.healthPermissionsState !== "unavailable") {
        const updated: DayLog = {
          ...log,
          healthSyncStatus: "unavailable",
          healthPermissionsState: "unavailable",
          updatedAt: nowISO(),
        };
        setTodayLog(updated);
        await dayLogRepo.upsert(updated);
      }
      return;
    }

    if (isHealthSyncingRef.current) {
      return;
    }
    isHealthSyncingRef.current = true;

    setIsHealthSyncing(true);

    const available = await healthProvider.isAvailable();
    if (!available) {
      const updated: DayLog = {
        ...log,
        healthSyncStatus: "unavailable",
        healthPermissionsState: "unavailable",
        updatedAt: nowISO(),
      };
      setTodayLog(updated);
      await dayLogRepo.upsert(updated);
      setIsHealthSyncing(false);
      isHealthSyncingRef.current = false;
      return;
    }

    let permissionsState = await healthProvider.getPermissionsState();
    if (requestPermission && permissionsState !== "granted") {
      permissionsState = await healthProvider.requestPermissions();
    }

    if (permissionsState !== "granted") {
      const updated: DayLog = {
        ...log,
        healthSyncStatus: "error",
        healthPermissionsState: permissionsState,
        updatedAt: nowISO(),
      };
      setTodayLog(updated);
      await dayLogRepo.upsert(updated);
      setIsHealthSyncing(false);
      isHealthSyncingRef.current = false;
      return;
    }

    try {
      const healthData = await healthProvider.getTodayActiveCalories();
      const merged: DayLog = {
        ...log,
        activeKcal: log.manualActivityOverride ? log.activeKcal : healthData.activeKcal,
        healthSyncedActiveKcal: healthData.activeKcal,
        activitySource: log.manualActivityOverride ? "manual" : "apple_health",
        lastActivitySyncAt: healthData.syncedAt,
        healthPermissionsState: healthData.permissionsState,
        healthSyncStatus: "success",
        updatedAt: nowISO(),
      };

      setTodayLog(merged);
      await dayLogRepo.upsert(merged);
    } catch {
      const updated: DayLog = {
        ...log,
        healthSyncStatus: "error",
        updatedAt: nowISO(),
      };
      setTodayLog(updated);
      await dayLogRepo.upsert(updated);
    } finally {
      setIsHealthSyncing(false);
      isHealthSyncingRef.current = false;
    }
  }, [healthProvider, isHealthSupported]);

  useEffect(() => {
    if (!isHealthSupported) {
      return;
    }

    if (!todayLogRef.current) return;

    const initialSyncId = window.setTimeout(() => {
      const log = todayLogRef.current;
      if (!log) return;
      syncHealthActiveCalories(log, false).catch((error: unknown) => {
        console.error("Health sync init failed", error);
      });
    }, 0);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        const log = todayLogRef.current;
        if (!log) return;
        syncHealthActiveCalories(log, false).catch((error: unknown) => {
          console.error("Health sync on visibility failed", error);
        });
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    let removeCapacitorListener: (() => void) | null = null;
    import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("resume", () => {
          const log = todayLogRef.current;
          if (!log) return;
          syncHealthActiveCalories(log, false).catch((error: unknown) => {
            console.error("Health sync on resume failed", error);
          });
        }),
      )
      .then((listener) => {
        removeCapacitorListener = () => listener.remove();
      })
      .catch(() => {
        removeCapacitorListener = null;
      });

    return () => {
      window.clearTimeout(initialSyncId);
      document.removeEventListener("visibilitychange", onVisible);
      if (removeCapacitorListener) {
        removeCapacitorListener();
      }
    };
  }, [isHealthSupported, todayLog?.id, syncHealthActiveCalories]);

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
      manualActivityOverride: true,
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
    return <section className="py-4 text-sm text-neutral-500">Загрузка...</section>;
  }

  return (
    <section className="space-y-4 pb-2">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Сегодня</p>
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
        <div className="mt-2 space-y-1 text-xs text-neutral-600">
          <p>Источник: {todayLog.activitySource === "apple_health" ? "Apple Health" : "вручную"}</p>
          <p>Статус синка: {todayLog.healthSyncStatus ?? "idle"}</p>
          <p>Разрешение: {todayLog.healthPermissionsState ?? "unknown"}</p>
          <p>Синхронизировано: {todayLog.lastActivitySyncAt ? new Date(todayLog.lastActivitySyncAt).toLocaleString("ru-RU") : "—"}</p>
          {!isHealthSupported ? <p>Apple Health работает только в iOS-приложении через Capacitor.</p> : null}
          {todayLog.manualActivityOverride ? <p className="text-amber-700">Включен ручной override активных ккал.</p> : null}
        </div>
        <button
          type="button"
          onClick={() => syncHealthActiveCalories(todayLog, true)}
          disabled={isHealthSyncing || !isHealthSupported}
          className="mt-2 h-10 w-full rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-800 disabled:opacity-40"
        >
          {isHealthSyncing ? "Синхронизация..." : isHealthSupported ? "Обновить из Apple Health" : "Apple Health недоступен в вебе"}
        </button>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">Съедено</p>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Калории" value={dayTotals?.consumed.kcal ?? 0} unit="ккал" />
          <Stat label="Белки" value={dayTotals?.consumed.protein ?? 0} unit="г" />
          <Stat label="Жиры" value={dayTotals?.consumed.fat ?? 0} unit="г" />
          <Stat label="Углеводы" value={dayTotals?.consumed.carbs ?? 0} unit="г" />
        </div>
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

function ProgressRow({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const safeTarget = target > 0 ? target : 1;
  const ratio = Math.max(0, Math.min(1, value / safeTarget));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-neutral-600">
        <span>{label}</span>
        <span>
          {formatNumber(value)} / {formatNumber(target)} {unit}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-neutral-200">
        <div className="h-full rounded bg-neutral-900" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
