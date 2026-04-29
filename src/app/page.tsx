"use client";

import {
  DAILY_MICRO_NORMS,
  buildDaySnapshot,
  calculateFoodNutrientsForWeight,
  calculateDayTotals,
  calculateRecipeNutrientDetails,
  calculateRecipePortionNutrients,
  calculateRemainingToDayTarget,
  closedDayArchiveRepo,
  dayLogRepo,
  dayTargetRepo,
  foodRepo,
  forceSync,
  mealEntryRepo,
  profileRepo,
  type ClosedDayArchive,
  type DayStatus,
  normalizeNutrientNormKey,
  resolveFoodNutrientDetails,
  recipeIngredientRepo,
  recipeRepo,
  weightLogRepo,
  type WeightLog,
} from "@/lib/data";
import type { DayLog, DayTarget, Food, MealEntry, NutrientsTotal, Recipe, RecipeIngredient } from "@/lib/data";
import { buildFallbackDayAnalysisExtended, requestDayAnalysis, requestRationAdvice } from "@/lib/ai";
import type { AnalyzeRationInput, ExtendedDayAnalysis, RationAdvice } from "@/lib/ai";
import { FoodThumbnail } from "@/components/food-thumbnail";
import { ArrowLeft, CalendarDays, ChevronRight, Flame, Pencil, Sparkles, Target, Trash2, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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

function formatTimeShort(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function parseWeight(value: string): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function getExternalImageUrl(food: Food | undefined): string | undefined {
  if (!food) return undefined;
  const rawSource = food.externalMeta?.rawSource;
  if (!rawSource || typeof rawSource !== "object") return undefined;
  const source = rawSource as Record<string, unknown>;
  const direct =
    source.image_front_small_url ??
    source.image_front_url ??
    source.image_url ??
    source.image_small_url ??
    source.image_thumb_url;
  return typeof direct === "string" && direct.trim().length > 0 ? direct : undefined;
}

function scaleMap(per100g: Record<string, number> | undefined, amountG: number): Record<string, number> {
  if (!per100g) return {};
  const factor = amountG / 100;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(per100g)) {
    out[key] = Math.round(value * factor * 100) / 100;
  }
  return out;
}

function addMaps(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = Math.round(((out[key] ?? 0) + value) * 100) / 100;
  }
  return out;
}

function mealTypeLabel(type: MealEntry["mealType"]): string {
  if (type === "breakfast") return "Завтрак";
  if (type === "lunch") return "Обед";
  if (type === "dinner") return "Ужин";
  return "Перекус";
}

type EntryWithNutrients = {
  entry: MealEntry;
  title: string;
  nutrients: NutrientsTotal;
};

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [focusedDate, setFocusedDate] = useState<string>(() => todayISODate());
  const [focusedLog, setFocusedLog] = useState<DayLog | null>(null);
  const [targets, setTargets] = useState<DayTarget[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [entries, setEntries] = useState<MealEntry[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingSourceType, setEditingSourceType] = useState<MealEntry["sourceType"]>("food");
  const [editingSourceId, setEditingSourceId] = useState("");
  const [editingWeightInput, setEditingWeightInput] = useState("");
  const [activeKcalInput, setActiveKcalInput] = useState("0");
  const [syncUi, setSyncUi] = useState<{ status: "idle" | "syncing" | "error"; lastAt?: string; error?: string }>({
    status: "idle",
  });
  const [archives, setArchives] = useState<ClosedDayArchive[]>([]);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [weightInput, setWeightInput] = useState("");
  const [closeState, setCloseState] = useState<{
    status: "idle" | "saving" | "ai-loading" | "ai-success" | "ai-fallback" | "error";
    message?: string;
    provider?: string;
    model?: string;
  }>({ status: "idle" });
  const [rationAdviceState, setRationAdviceState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    data?: RationAdvice;
    provider?: string;
    model?: string;
    message?: string;
  }>({ status: "idle" });
  const closeRequestInFlightRef = useRef(false);
  const rationRequestInFlightRef = useRef(false);

  const todayDate = useMemo(() => todayISODate(), []);
  const focusedLabel = useMemo(() => formatTodayDateLabel(focusedDate), [focusedDate]);
  const isViewingToday = focusedDate === todayDate;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const requestedDate = params.get("date");
    if (requestedDate && isIsoDate(requestedDate) && requestedDate !== focusedDate) {
      setFocusedDate(requestedDate);
      setIsArchiveOpen(true);
    }
  }, [focusedDate]);

  async function refreshDayEntries(dayLogId: string) {
    const mealEntries = await mealEntryRepo.listByDayLogId(dayLogId);
    setEntries(mealEntries);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadDayData(isInitial: boolean) {
      const currentTime = nowISO();
      const isToday = focusedDate === todayISODate();

      const fallbackLog: DayLog = {
        id: focusedDate,
        date: focusedDate,
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

      const [dayLog, dayTargets, foodsList, recipesList, recipeIngredients, mealEntries, archivesList, weightLogs] = await Promise.all([
        dayLogRepo.getByDate(focusedDate),
        dayTargetRepo.list(),
        foodRepo.list(),
        recipeRepo.list(),
        recipeIngredientRepo.list(),
        mealEntryRepo.listByDayLogId(focusedDate),
        closedDayArchiveRepo.list(),
        weightLogRepo.list(),
      ]);

      if (cancelled) return;

      const safeDayLog: DayLog = dayLog ?? fallbackLog;

      if (!dayLog && isInitial && isToday) {
        await dayLogRepo.upsert(safeDayLog);
      }

      setFocusedLog(safeDayLog);
      setTargets(dayTargets);
      setFoods(foodsList);
      setRecipes(recipesList);
      setIngredients(recipeIngredients);
      setEntries(mealEntries);
      setArchives([...archivesList].sort((a, b) => b.date.localeCompare(a.date)));
      setWeights(weightLogs);
      const todaysWeight = weightLogs.find((item) => item.date === focusedDate);
      setWeightInput(todaysWeight ? String(todaysWeight.weightKg) : "");
      setActiveKcalInput(String(Math.max(0, Math.round(safeDayLog.activeKcal ?? 0))));
      if (!isViewingToday && archivesList.some((item) => item.date === focusedDate)) {
        setIsArchiveOpen(true);
      }
      if (isInitial) setIsLoading(false);
    }

    async function syncAndLoad(isInitial: boolean) {
      setSyncUi({ status: "syncing" });
      try {
        await forceSync();
        setSyncUi({ status: "idle", lastAt: new Date().toISOString() });
      } catch (error) {
        console.error("Sync before day load failed", error);
        setSyncUi({ status: "error", error: error instanceof Error ? error.message : "sync failed" });
      }
      await loadDayData(isInitial);
    }

    syncAndLoad(true).catch((error: unknown) => {
      console.error("Failed to sync+load day data", error);
      setIsLoading(false);
      setSyncUi({ status: "error", error: error instanceof Error ? error.message : "unknown error" });
    });

    const intervalId = window.setInterval(() => {
      void syncAndLoad(false).catch((error: unknown) => console.error("Background sync+load failed", error));
    }, 15000);

    const refreshOnFocus = () => {
      void syncAndLoad(false).catch((error: unknown) => console.error("Focus sync+load failed", error));
    };
    const onVisibility = () => {
      if (!document.hidden) refreshOnFocus();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [focusedDate]);

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
    if (!focusedLog) return null;
    return targets.find((target) => target.dayType === focusedLog.dayType) ?? null;
  }, [targets, focusedLog]);

  const dayTotals = useMemo(() => {
    if (!focusedLog) {
      return null;
    }

    return calculateDayTotals({
      dayLog: focusedLog,
      mealEntries: entries,
      foodsById,
      recipesById,
      recipeIngredientsByRecipeId: ingredientsByRecipeId,
    });
  }, [focusedLog, entries, foodsById, recipesById, ingredientsByRecipeId]);

  const remaining = useMemo(() => {
    if (!dayTotals || !currentTarget) {
      return null;
    }

    return calculateRemainingToDayTarget(dayTotals.consumed, currentTarget);
  }, [dayTotals, currentTarget]);

  const dayMicronutrients = useMemo(() => {
    let microTotals: Record<string, number> = {};
    let vitaminTotals: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.sourceType === "food") {
        const food = foodsById.get(entry.sourceId);
        if (!food) continue;
        const details = resolveFoodNutrientDetails(food);
        microTotals = addMaps(microTotals, scaleMap(details.micronutrientsPer100g, entry.amountG));
        vitaminTotals = addMaps(vitaminTotals, scaleMap(details.vitaminsPer100g, entry.amountG));
        continue;
      }
      const recipe = recipesById.get(entry.sourceId);
      if (!recipe) continue;
      const recipeIngredients = ingredientsByRecipeId.get(recipe.id) ?? [];
      const details = calculateRecipeNutrientDetails(recipe, recipeIngredients, foodsById);
      microTotals = addMaps(microTotals, scaleMap(details.micronutrientsPer100g, entry.amountG));
      vitaminTotals = addMaps(vitaminTotals, scaleMap(details.vitaminsPer100g, entry.amountG));
    }

    const merged = addMaps(microTotals, vitaminTotals);
    return Object.entries(merged)
      .map(([label, consumed]) => {
        const normalized = normalizeNutrientNormKey(label);
        const target = DAILY_MICRO_NORMS[normalized];
        const ratio = target && target > 0 ? consumed / target : 0;
        return { label, consumed, target, ratio };
      })
      .filter((item) => item.consumed > 0)
      .sort((a, b) => b.ratio - a.ratio);
  }, [entries, foodsById, recipesById, ingredientsByRecipeId]);

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

  const calorieTarget = useMemo(() => {
    if (!currentTarget) return 2200;
    return Math.max(1, currentTarget.kcalMax);
  }, [currentTarget]);

  const calorieProgressRatio = useMemo(() => {
    if (!dayTotals) return 0;
    return Math.max(0, Math.min(1, dayTotals.consumed.kcal / calorieTarget));
  }, [dayTotals, calorieTarget]);

  const macroStats = useMemo(() => {
    if (!dayTotals || !currentTarget) {
      return [
        { key: "protein", label: "Белки", consumed: 0, target: 1, color: "#84e14b" },
        { key: "carbs", label: "Углеводы", consumed: 0, target: 1, color: "#4d8dff" },
        { key: "fat", label: "Жиры", consumed: 0, target: 1, color: "#ff5a6b" },
      ];
    }
    return [
      { key: "protein", label: "Белки", consumed: dayTotals.consumed.protein, target: Math.max(1, currentTarget.proteinTarget), color: "#84e14b" },
      { key: "carbs", label: "Углеводы", consumed: dayTotals.consumed.carbs, target: Math.max(1, (currentTarget.carbsMin + currentTarget.carbsMax) / 2), color: "#4d8dff" },
      { key: "fat", label: "Жиры", consumed: dayTotals.consumed.fat, target: Math.max(1, (currentTarget.fatMin + currentTarget.fatMax) / 2), color: "#ff5a6b" },
    ];
  }, [dayTotals, currentTarget]);

  const remainingKcal = useMemo(() => {
    if (!remaining) return 0;
    return Math.max(0, remaining.kcalMax);
  }, [remaining]);

  const remainingForAdvice = useMemo(() => {
    if (!currentTarget || !dayTotals) return null;
    return {
      kcal: Math.max(0, currentTarget.kcalMax - dayTotals.consumed.kcal),
      protein: Math.max(0, currentTarget.proteinTarget - dayTotals.consumed.protein),
      fat: Math.max(0, currentTarget.fatMax - dayTotals.consumed.fat),
      carbs: Math.max(0, currentTarget.carbsMax - dayTotals.consumed.carbs),
    };
  }, [currentTarget, dayTotals]);

  useEffect(() => {
    setRationAdviceState({ status: "idle" });
  }, [focusedDate, currentTarget?.dayType]);

  async function updateDayType(dayType: DayLog["dayType"]) {
    if (!focusedLog) return;
    const updated: DayLog = { ...focusedLog, dayType, updatedAt: nowISO() };
    setFocusedLog(updated);
    await dayLogRepo.upsert(updated);
  }

  async function updateActiveKcal(value: number) {
    if (!focusedLog) return;
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    const updated: DayLog = {
      ...focusedLog,
      activeKcal: safeValue,
      activitySource: "manual",
      updatedAt: nowISO(),
    };
    setFocusedLog(updated);
    setActiveKcalInput(String(safeValue));
    await dayLogRepo.upsert(updated);
  }

  async function commitActiveKcalInput() {
    const parsed = Number(activeKcalInput.replace(",", "."));
    await updateActiveKcal(Number.isFinite(parsed) ? parsed : 0);
  }

  async function saveWeightForFocusedDay() {
    const parsed = parseWeight(weightInput);
    if (parsed <= 0) return;
    const existing = weights.find((item) => item.date === focusedDate);
    const now = nowISO();
    const record: WeightLog = existing
      ? { ...existing, weightKg: parsed, updatedAt: now }
      : {
          id: `${focusedDate}-weight`,
          date: focusedDate,
          weightKg: parsed,
          createdAt: now,
          updatedAt: now,
        };
    await weightLogRepo.upsert(record);
    setWeights((prev) => {
      const others = prev.filter((item) => item.id !== record.id);
      return [...others, record].sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  async function deleteWeightForFocusedDay() {
    const existing = weights.find((item) => item.date === focusedDate);
    if (!existing) return;
    await weightLogRepo.remove(existing.id);
    setWeights((prev) => prev.filter((item) => item.id !== existing.id));
    setWeightInput("");
  }

  async function editPastDay(archive: ClosedDayArchive) {
    const dayLogForArchive = await dayLogRepo.getByDate(archive.date);
    const nowTs = nowISO();
    const reopenedLog: DayLog = dayLogForArchive
      ? { ...dayLogForArchive, status: "active", updatedAt: nowTs }
      : {
          id: archive.date,
          date: archive.date,
          dayType: archive.dayType,
          status: "active",
          activeKcal: archive.activeKcal,
          activitySource: "manual",
          healthSyncStatus: "idle",
          manualActivityOverride: true,
          healthPermissionsState: "unknown",
          createdAt: nowTs,
          updatedAt: nowTs,
        };
    await dayLogRepo.upsert(reopenedLog);

    const updatedArchive: ClosedDayArchive = {
      ...archive,
      reopenedAt: nowTs,
      updatedAt: nowTs,
    };
    await closedDayArchiveRepo.upsert(updatedArchive);
    setArchives((prev) => prev.map((item) => (item.id === updatedArchive.id ? updatedArchive : item)));

    setFocusedDate(archive.date);
    setCloseState({ status: "idle" });

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
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
    if (focusedLog?.status === "completed") {
      const logUpdated = {
        ...focusedLog,
        status: "active" as DayStatus,
        dayAnalysis: undefined,
        dayAnalysisAt: undefined,
        updatedAt: nowISO(),
      };
      setFocusedLog(logUpdated);
      await dayLogRepo.upsert(logUpdated);
    }
    await refreshDayEntries(entry.dayLogId);
    cancelEditingEntry();
  }

  async function deleteEntry(entry: MealEntry) {
    await mealEntryRepo.remove(entry.id);
    if (focusedLog?.status === "completed") {
      const logUpdated = {
        ...focusedLog,
        status: "active" as DayStatus,
        dayAnalysis: undefined,
        dayAnalysisAt: undefined,
        updatedAt: nowISO(),
      };
      setFocusedLog(logUpdated);
      await dayLogRepo.upsert(logUpdated);
    }
    await refreshDayEntries(entry.dayLogId);
    if (editingEntryId === entry.id) {
      cancelEditingEntry();
    }
  }

  async function finishDay() {
    if (!focusedLog || !dayTotals || closeRequestInFlightRef.current) return;
    await commitActiveKcalInput();
    closeRequestInFlightRef.current = true;
    setCloseState({ status: "saving", message: "Сохраняю snapshot дня..." });
    try {
      const snapshot = buildDaySnapshot({
        dayLog: focusedLog,
        mealEntries: entries,
        foodsById,
        recipesById,
        ingredientsByRecipeId,
        target: currentTarget,
        weightKg: weights.find((item) => item.date === focusedLog.date)?.weightKg,
      });

      const baseAnalysis: ExtendedDayAnalysis = buildFallbackDayAnalysisExtended({
      dayLog: focusedLog,
      target: currentTarget,
      consumed: snapshot.consumed,
      netKcal: snapshot.netKcal,
      micronutrientCoverage: snapshot.micronutrientCoverage,
    });

      const closedAt = nowISO();
      const archive: ClosedDayArchive = {
      id: focusedLog.id,
      date: focusedLog.date,
      dayType: focusedLog.dayType,
      closedAt,
      consumed: snapshot.consumed,
      netKcal: snapshot.netKcal,
      activeKcal: snapshot.activeKcal,
      micronutrientsTotal: snapshot.micronutrientsTotal,
      vitaminsTotal: snapshot.vitaminsTotal,
      micronutrientCoverage: snapshot.micronutrientCoverage,
      weightKg: weights.find((item) => item.date === focusedLog.date)?.weightKg,
      target: currentTarget
        ? {
            kcalMin: currentTarget.kcalMin,
            kcalMax: currentTarget.kcalMax,
            proteinTarget: currentTarget.proteinTarget,
            fatMin: currentTarget.fatMin,
            fatMax: currentTarget.fatMax,
            carbsMin: currentTarget.carbsMin,
            carbsMax: currentTarget.carbsMax,
          }
        : undefined,
      entriesSnapshot: snapshot.entriesSnapshot,
      analysis: {
        ...baseAnalysis,
        source: "rule-based",
      },
      analysisAt: closedAt,
      createdAt: closedAt,
      updatedAt: closedAt,
    };

      await closedDayArchiveRepo.upsert(archive);

      const updated: DayLog = {
      ...focusedLog,
      status: "completed",
      dayAnalysis: {
        ...baseAnalysis,
        source: "rule-based",
      },
      dayAnalysisAt: closedAt,
      updatedAt: closedAt,
    };
      setFocusedLog(updated);
      await dayLogRepo.upsert(updated);
      setArchives((prev) => [archive, ...prev.filter((item) => item.id !== archive.id)]);
      setCloseState({ status: "ai-loading", message: "Запрашиваю AI-анализ..." });

      try {
      const profile = await profileRepo.get().catch(() => null);
      const microNorms: Record<string, number> = {};
      for (const key of Object.keys({ ...snapshot.micronutrientsTotal, ...snapshot.vitaminsTotal })) {
        const norm = DAILY_MICRO_NORMS[normalizeNutrientNormKey(key)];
        if (norm) microNorms[key] = norm;
      }

        const aiResult = await requestDayAnalysis({
        date: focusedLog.date,
        dayType: focusedLog.dayType,
        consumed: snapshot.consumed,
        activeKcal: snapshot.activeKcal,
        netKcal: snapshot.netKcal,
        target: currentTarget
          ? {
              kcalMin: currentTarget.kcalMin,
              kcalMax: currentTarget.kcalMax,
              proteinTarget: currentTarget.proteinTarget,
              fatMin: currentTarget.fatMin,
              fatMax: currentTarget.fatMax,
              carbsMin: currentTarget.carbsMin,
              carbsMax: currentTarget.carbsMax,
            }
          : null,
        micronutrients: snapshot.micronutrientsTotal,
        vitamins: snapshot.vitaminsTotal,
        micronutrientNorms: microNorms,
        micronutrientCoverage: snapshot.micronutrientCoverage,
        entries: snapshot.entriesSnapshot.map((item) => ({
          title: item.title,
          mealType: item.mealType,
          amountG: item.amountG,
          nutrients: item.nutrients,
        })),
        heightCm: profile?.heightCm,
        currentWeightKg: profile?.currentWeightKg ?? archive.weightKg ?? null,
        goalWeightKg: profile?.goalWeightKg,
        plannedActivityKcal: profile?.dailyActivityKcal,
        weightKg: archive.weightKg ?? null,
      });

        if (aiResult.ok && aiResult.analysis) {
        const aiAt = nowISO();
        const updatedArchive: ClosedDayArchive = {
          ...archive,
          analysis: {
            ...aiResult.analysis,
            source: "ai",
            provider: aiResult.provider,
            model: aiResult.model,
          },
          analysisAt: aiAt,
          updatedAt: aiAt,
        };
        await closedDayArchiveRepo.upsert(updatedArchive);
        setArchives((prev) => [updatedArchive, ...prev.filter((item) => item.id !== updatedArchive.id)]);

        const updatedLog: DayLog = {
          ...updated,
          dayAnalysis: {
            ...aiResult.analysis,
            source: "ai",
            provider: aiResult.provider,
            model: aiResult.model,
          },
          dayAnalysisAt: aiAt,
          updatedAt: aiAt,
        };
        setFocusedLog(updatedLog);
        await dayLogRepo.upsert(updatedLog);
        setCloseState({
          status: "ai-success",
          message: "AI-анализ готов",
          provider: aiResult.provider,
          model: aiResult.model,
        });
        } else {
          setCloseState({
            status: "ai-fallback",
            message: aiResult.error
              ? `AI недоступен (${aiResult.error}). Используется локальный анализ.`
              : "AI недоступен. Используется локальный анализ.",
          });
        }
      } catch (error) {
        setCloseState({
          status: "ai-fallback",
          message: `AI недоступен (${error instanceof Error ? error.message : "ошибка сети"}). Используется локальный анализ.`,
        });
      }
    } finally {
      closeRequestInFlightRef.current = false;
    }
  }

  async function reopenDay() {
    if (!focusedLog) return;
    const updated: DayLog = {
      ...focusedLog,
      status: "active",
      updatedAt: nowISO(),
    };
    setFocusedLog(updated);
    await dayLogRepo.upsert(updated);

    const existingArchive = archives.find((item) => item.id === focusedLog.id);
    if (existingArchive) {
      const reopenedAt = nowISO();
      const next: ClosedDayArchive = {
        ...existingArchive,
        reopenedAt,
        updatedAt: reopenedAt,
      };
      await closedDayArchiveRepo.upsert(next);
      setArchives((prev) => prev.map((item) => (item.id === next.id ? next : item)));
    }

    setCloseState({ status: "idle" });
  }

  async function deleteArchive(id: string) {
    await closedDayArchiveRepo.remove(id);
    setArchives((prev) => prev.filter((item) => item.id !== id));
  }

  async function rerunAiAnalysisForArchive(archive: ClosedDayArchive) {
    setCloseState({ status: "ai-loading", message: `Перезапускаю AI-анализ за ${archive.date}...` });
    try {
      const profile = await profileRepo.get().catch(() => null);
      const microNorms: Record<string, number> = {};
      for (const key of Object.keys({ ...archive.micronutrientsTotal, ...archive.vitaminsTotal })) {
        const norm = DAILY_MICRO_NORMS[normalizeNutrientNormKey(key)];
        if (norm) microNorms[key] = norm;
      }
      const aiResult = await requestDayAnalysis({
        date: archive.date,
        dayType: archive.dayType,
        consumed: archive.consumed,
        activeKcal: archive.activeKcal,
        netKcal: archive.netKcal,
        target: archive.target ?? null,
        micronutrients: archive.micronutrientsTotal,
        vitamins: archive.vitaminsTotal,
        micronutrientNorms: microNorms,
        micronutrientCoverage: archive.micronutrientCoverage,
        entries: archive.entriesSnapshot.map((item) => ({
          title: item.title,
          mealType: item.mealType,
          amountG: item.amountG,
          nutrients: item.nutrients,
        })),
        heightCm: profile?.heightCm,
        currentWeightKg: profile?.currentWeightKg ?? archive.weightKg ?? null,
        goalWeightKg: profile?.goalWeightKg,
        plannedActivityKcal: profile?.dailyActivityKcal,
        weightKg: archive.weightKg ?? null,
      });
      if (aiResult.ok && aiResult.analysis) {
        const aiAt = nowISO();
        const next: ClosedDayArchive = {
          ...archive,
          analysis: {
            ...aiResult.analysis,
            source: "ai",
            provider: aiResult.provider,
            model: aiResult.model,
          },
          analysisAt: aiAt,
          updatedAt: aiAt,
        };
        await closedDayArchiveRepo.upsert(next);
        setArchives((prev) => prev.map((item) => (item.id === next.id ? next : item)));
        setCloseState({ status: "ai-success", message: "AI-анализ обновлен", provider: aiResult.provider, model: aiResult.model });
      } else {
        setCloseState({ status: "ai-fallback", message: aiResult.error ?? "AI недоступен" });
      }
    } catch (error) {
      setCloseState({ status: "ai-fallback", message: error instanceof Error ? error.message : "Ошибка сети" });
    }
  }

  async function suggestRation() {
    if (!dayTotals || !currentTarget || !remainingForAdvice || rationRequestInFlightRef.current) return;
    rationRequestInFlightRef.current = true;
    setRationAdviceState({ status: "loading", message: "AI подбирает, что лучше съесть сегодня..." });
    try {
      const candidateFoods: AnalyzeRationInput["candidates"] = foods.slice(0, 40).map((food) => ({
        id: food.id,
        type: "food",
        title: food.name,
        nutrientsPer100g: food.nutrientsPer100g,
      }));
      const candidateRecipes: AnalyzeRationInput["candidates"] = recipes.slice(0, 20).map((recipe) => {
        const recipeIngredients = ingredientsByRecipeId.get(recipe.id) ?? [];
        const details = calculateRecipePortionNutrients(recipe, recipeIngredients, foodsById, 100);
        return {
          id: recipe.id,
          type: "recipe" as const,
          title: recipe.name,
          nutrientsPer100g: details,
        };
      });
      const candidates = [...candidateFoods, ...candidateRecipes].filter((item) => item.nutrientsPer100g.kcal > 0);
      if (candidates.length === 0) {
        setRationAdviceState({ status: "error", message: "Нет продуктов/блюд с КБЖУ для подбора." });
        return;
      }

      const result = await requestRationAdvice({
        date: focusedDate,
        consumed: dayTotals.consumed,
        target: {
          kcalMin: currentTarget.kcalMin,
          kcalMax: currentTarget.kcalMax,
          proteinTarget: currentTarget.proteinTarget,
          fatMin: currentTarget.fatMin,
          fatMax: currentTarget.fatMax,
          carbsMin: currentTarget.carbsMin,
          carbsMax: currentTarget.carbsMax,
        },
        remaining: remainingForAdvice,
        candidates: candidates.slice(0, 60),
      });

      if (result.ok && result.advice) {
        setRationAdviceState({
          status: "ready",
          data: result.advice,
          provider: result.provider,
          model: result.model,
        });
      } else {
        setRationAdviceState({ status: "error", message: result.error ?? "Не удалось подобрать рекомендации." });
      }
    } catch (error) {
      setRationAdviceState({
        status: "error",
        message: error instanceof Error ? error.message : "Ошибка подбора рациона",
      });
    } finally {
      rationRequestInFlightRef.current = false;
    }
  }

  if (isLoading || !focusedLog) {
    return <section className="py-4 text-sm text-[#9db0c8]">Загрузка...</section>;
  }

  return (
    <section className="space-y-3.5 pb-2 text-neutral-100">
      <header className="px-0.5 pt-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            {!isViewingToday ? (
              <button
                type="button"
                onClick={() => setFocusedDate(todayDate)}
                className="glass-icon-btn mt-0.5"
                aria-label="Вернуться к сегодняшнему дню"
              >
                <ArrowLeft size={16} />
              </button>
            ) : null}
            <div>
              <p className="screen-subtitle capitalize">{focusedLabel}</p>
              <h1 className="screen-title mt-1">{isViewingToday ? "Сегодня" : "Редактирование дня"}</h1>
            </div>
          </div>
          <div className="mt-0.5 flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <Link href="/settings" className="glass-icon-btn" aria-label="Настройки">
                <CalendarDays size={16} />
              </Link>
              <Link href="/account" className="glass-icon-btn" aria-label="Аккаунт">
                <User size={16} />
              </Link>
            </div>
            <div className="text-[10px] leading-none text-[#9db0c8]">
              {syncUi.status === "syncing"
                ? "Синхронизирую..."
                : syncUi.status === "error"
                  ? "Синк: ошибка"
                  : syncUi.lastAt
                    ? `Синк: ${formatTimeShort(syncUi.lastAt)}`
                    : "Синк: —"}
            </div>
          </div>
        </div>
        {!isViewingToday ? (
          <div className="mt-2 rounded-2xl border border-[rgba(132,225,75,0.22)] bg-[rgba(132,225,75,0.06)] px-3 py-2 text-[11px] text-[#a8f070]">
            Ты редактируешь прошлый день. Изменения перезапишут архив после повторного закрытия.
          </div>
        ) : null}
      </header>

      <div className="rounded-[28px] border border-[rgba(255,255,255,0.06)] bg-[rgba(8,13,20,0.88)] p-1">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => updateDayType("normal")}
            className={`h-11 rounded-full text-sm font-semibold tracking-[0.01em] ${
              focusedLog.dayType === "normal" ? "accent-btn" : "pill-segment text-[#c7d4e5]"
            }`}
          >
            Обычный
          </button>
          <button
            type="button"
            onClick={() => updateDayType("strength")}
            className={`h-11 rounded-full text-sm font-semibold tracking-[0.01em] ${
              focusedLog.dayType === "strength" ? "accent-btn" : "pill-segment text-[#c7d4e5]"
            }`}
          >
            Силовой
          </button>
        </div>
      </div>

      <div className="hero-card px-3 pb-3 pt-3.5">
        <div className="relative min-h-[270px]">
          <div className="absolute left-0 top-[96px] w-[68px]">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(255,95,117,0.45)] bg-[rgba(255,62,87,0.12)] text-[#ff6a7c] shadow-[0_0_18px_rgba(255,68,96,0.22)]">
              <Flame size={14} />
            </div>
            <p className="mt-1.5 text-[9px] uppercase leading-tight tracking-[0.07em] text-[#95a8bf]">Activity calories</p>
            <p className="mt-1 text-[1.45rem] font-bold leading-none text-[#ff5e74]">{formatNumber(focusedLog.activeKcal)}</p>
            <p className="text-[10px] text-[#8c9eb5]">kcal</p>
          </div>

          <div className="mx-auto w-fit">
            <HeroCaloriesRing consumed={dayTotals?.consumed.kcal ?? 0} target={calorieTarget} ratio={calorieProgressRatio} />
          </div>

          <div className="absolute right-0 top-[110px] flex w-[68px] flex-col items-center text-center">
            <GoalMiniRing ratio={calorieProgressRatio} />
            <p className="mt-1.5 text-[9px] uppercase leading-tight tracking-[0.07em] text-[#8da1bb]">Goal Progress</p>
          </div>
        </div>

        <div className="mt-[-6px] grid grid-cols-3 gap-1.5">
          {macroStats.map((item) => (
            <MacroMiniRing key={item.key} label={item.label} consumed={item.consumed} target={item.target} color={item.color} />
          ))}
        </div>
      </div>

      <div className="app-card p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-[#f6fbff]">Сегодняшняя еда</p>
          <Link href="/add-entry" className="text-xs font-semibold text-[#8fff70]">Изменить</Link>
        </div>
        {entriesWithNutrients.length === 0 ? (
          <p className="text-sm text-[#9db0c8]">Пока нет записей. Добавь первый прием пищи.</p>
        ) : (
          <ul className="space-y-1.5">
            {entriesWithNutrients.map(({ entry, title, nutrients }) => (
              <li key={entry.id} className="food-row-card px-2.5 py-2">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <FoodThumbnail
                      name={title}
                      preferredUrl={
                        entry.sourceType === "food"
                          ? getExternalImageUrl(foodsById.get(entry.sourceId)) ?? `https://source.unsplash.com/featured/?food,${encodeURIComponent(title)}`
                          : `https://source.unsplash.com/featured/?food,${encodeURIComponent(title)}`
                      }
                      size={42}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold leading-tight">{title}</p>
                      <p className="mt-0.5 text-[10px] text-[#8da1bb]">{mealTypeLabel(entry.mealType)} · {entry.amountG} г</p>
                      <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                        <span className="macro-chip macro-chip-protein">P {formatNumber(nutrients.protein)}г</span>
                        <span className="macro-chip macro-chip-carbs">C {formatNumber(nutrients.carbs)}г</span>
                        <span className="macro-chip macro-chip-fat">F {formatNumber(nutrients.fat)}г</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <div className="pt-0.5 text-right">
                      <p className="text-[0.98rem] font-bold leading-none text-[#f3f8ff]">{formatNumber(nutrients.kcal)}</p>
                      <p className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-[#8da1bb]">kcal</p>
                    </div>
                    <ChevronRight size={14} className="mt-1 text-[#7f91a8]" />
                  </div>
                </div>

                <div className="mt-1.5 flex justify-end gap-1 opacity-70">
                  <button type="button" onClick={() => startEditingEntry(entry)} className="icon-action-btn secondary-btn" aria-label={`Редактировать ${title}`}>
                    <Pencil size={12} />
                  </button>
                  <button type="button" onClick={() => deleteEntry(entry)} className="icon-action-btn danger-btn" aria-label={`Удалить ${title}`}>
                    <Trash2 size={12} />
                  </button>
                </div>

                {editingEntryId === entry.id ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-[#233247] bg-[#0a111b] p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setEditingSourceType("food"); setEditingSourceId(""); }} className={`h-10 rounded-lg text-xs font-semibold ${editingSourceType === "food" ? "accent-btn" : "bg-[#0d1520] text-[#c7d4e5]"}`}>Продукт</button>
                      <button type="button" onClick={() => { setEditingSourceType("recipe"); setEditingSourceId(""); }} className={`h-10 rounded-lg text-xs font-semibold ${editingSourceType === "recipe" ? "accent-btn" : "bg-[#0d1520] text-[#c7d4e5]"}`}>Блюдо</button>
                    </div>
                    <select value={editingSourceId} onChange={(event) => setEditingSourceId(event.target.value)} className="h-10 w-full rounded-lg px-2 text-sm outline-none">
                      <option value="">Выбери {editingSourceType === "food" ? "продукт" : "блюдо"}</option>
                      {(editingSourceType === "food" ? foods : recipes).map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    <input type="text" inputMode="decimal" value={editingWeightInput} onChange={(event) => setEditingWeightInput(event.target.value)} placeholder="Вес, г" className="h-10 w-full rounded-lg px-3 text-sm outline-none" />
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => saveEntryEdit(entry)} disabled={!editingSourceId || parseWeight(editingWeightInput) <= 0} className="h-10 rounded-lg accent-btn text-xs font-semibold disabled:opacity-40">Сохранить</button>
                      <button type="button" onClick={cancelEditingEntry} className="h-10 rounded-lg bg-[#0d1520] text-xs font-semibold text-[#c7d4e5]">Отмена</button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="summary-track-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(132,225,75,0.28)] bg-[rgba(132,225,75,0.08)] text-[#8fff70]">
              <Target size={16} />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-[0.1em] text-[#8da1bb]">Осталось калорий</p>
              <p className="text-[1.65rem] font-bold leading-none tracking-[-0.02em] text-[#f7fcff]">{formatNumber(remainingKcal)} kcal</p>
            </div>
          </div>
          <p className="max-w-[128px] text-right text-xs leading-tight text-[#97ed7e]">Отлично! Ты на правильном пути.</p>
        </div>
      </div>

      <div className="app-card space-y-3 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.11em] text-[#9db0c8]">Помощь с рационом</p>
            <p className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-[#f6fbff]">Что можно еще съесть сегодня</p>
          </div>
          <Sparkles size={18} className="text-[#8fff70]" />
        </div>
        {remainingForAdvice ? (
          <p className="text-xs text-[#a7b7cd]">
            Остаток: {formatNumber(remainingForAdvice.kcal)} ккал · Б {formatNumber(remainingForAdvice.protein)} · Ж {formatNumber(remainingForAdvice.fat)} · У {formatNumber(remainingForAdvice.carbs)}
          </p>
        ) : (
          <p className="text-xs text-[#a7b7cd]">Нет целей дня, чтобы сделать точный подбор.</p>
        )}
        <button
          type="button"
          onClick={suggestRation}
          disabled={!remainingForAdvice || rationAdviceState.status === "loading"}
          className="h-11 w-full rounded-lg accent-btn text-sm font-semibold disabled:opacity-40"
        >
          {rationAdviceState.status === "loading" ? "Подбираю..." : "Помочь с рационом"}
        </button>
        {rationAdviceState.message ? (
          <p className={`text-xs ${rationAdviceState.status === "error" ? "text-[#ff8095]" : "text-[#9db0c8]"}`}>
            {rationAdviceState.message}
          </p>
        ) : null}
        {rationAdviceState.status === "ready" && rationAdviceState.data ? (
          <div className="space-y-2">
            <p className="text-sm text-[#dce7f5]">{rationAdviceState.data.summary}</p>
            {rationAdviceState.provider ? (
              <p className="text-[10px] text-[#7f91a8]">{rationAdviceState.provider}/{rationAdviceState.model}</p>
            ) : null}
            {rationAdviceState.data.suggestions.map((item, index) => (
              <div key={`${item.title}-${index}`} className="app-subcard p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#f4f9ff]">
                      {item.title} · {item.portionG} г
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#8da1bb]">{item.type === "recipe" ? "Блюдо" : "Продукт"}</p>
                  </div>
                  <p className="text-xs text-[#9db0c8]">{item.estimated.kcal} ккал</p>
                </div>
                <p className="mt-1 text-[11px] text-[#a9b9cd]">
                  Б {formatNumber(item.estimated.protein)} · Ж {formatNumber(item.estimated.fat)} · У {formatNumber(item.estimated.carbs)}
                </p>
                <p className="mt-1 text-xs text-[#cfd9e9]">{item.reason}</p>
              </div>
            ))}
            {rationAdviceState.data.notes && rationAdviceState.data.notes.length > 0 ? (
              <ul className="space-y-0.5 text-xs text-[#8da1bb]">
                {rationAdviceState.data.notes.map((note, idx) => (
                  <li key={idx}>· {note}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <details className="app-card px-4 py-3">
        <summary className="cursor-pointer text-xs uppercase tracking-[0.11em] text-[#9db0c8]">Подробная статистика дня</summary>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="active-kcal" className="mb-1.5 block text-xs uppercase tracking-[0.11em] text-[#9db0c8]">Active calories</label>
            <input
              id="active-kcal"
              type="text"
              inputMode="numeric"
              value={activeKcalInput}
              onChange={(event) => setActiveKcalInput(event.target.value.replace(/[^\d]/g, ""))}
              onBlur={() => {
                commitActiveKcalInput().catch((error: unknown) => console.error("Failed to save active kcal", error));
              }}
              placeholder="0"
              className="h-12 w-full rounded-lg px-3 text-base outline-none"
            />
          </div>
          <div>
            <label htmlFor="day-weight" className="mb-1.5 block text-xs uppercase tracking-[0.11em] text-[#9db0c8]">Вес утром, кг</label>
            <div className="flex gap-2">
              <input
                id="day-weight"
                type="text"
                inputMode="decimal"
                value={weightInput}
                onChange={(event) => setWeightInput(event.target.value)}
                placeholder="напр. 82.4"
                className="h-12 w-full rounded-lg px-3 text-base outline-none"
              />
              <button type="button" onClick={saveWeightForFocusedDay} className="h-12 rounded-lg accent-btn px-3 text-xs font-semibold">
                Сохранить
              </button>
              {weights.some((item) => item.date === focusedDate) ? (
                <button type="button" onClick={deleteWeightForFocusedDay} className="icon-action-btn danger-btn" aria-label="Удалить вес за день">
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Микро и витамины</p>
            <MicroNormChart items={dayMicronutrients} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Прогресс по цели</p>
            {currentTarget && dayTotals ? (
              <div className="space-y-2">
                <ProgressRow label="Калории" value={dayTotals.consumed.kcal} target={(currentTarget.kcalMin + currentTarget.kcalMax) / 2} unit="ккал" />
                <ProgressRow label="Белки" value={dayTotals.consumed.protein} target={currentTarget.proteinTarget} unit="г" />
                <ProgressRow label="Жиры" value={dayTotals.consumed.fat} target={(currentTarget.fatMin + currentTarget.fatMax) / 2} unit="г" />
                <ProgressRow label="Углеводы" value={dayTotals.consumed.carbs} target={(currentTarget.carbsMin + currentTarget.carbsMax) / 2} unit="г" />
              </div>
            ) : <p className="text-sm text-[#9db0c8]">Цели дня не найдены.</p>}
          </div>
        </div>
      </details>

      <div className="app-card space-y-3 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.11em] text-[#9db0c8]">
              {isViewingToday ? "Завершение дня" : `Редактирование · ${focusedDate}`}
            </p>
            <p className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-[#f6fbff]">
              {focusedLog.status === "completed" ? "День закрыт" : isViewingToday ? "День открыт" : "Редактируется"}
            </p>
          </div>
          <Sparkles size={18} className="text-[#8fff70]" />
        </div>
        {closeState.status !== "idle" ? (
          <p className={`text-xs ${closeState.status === "ai-success" ? "text-[#8fff70]" : closeState.status === "error" ? "text-[#ff8095]" : "text-[#a7b7cd]"}`}>
            {closeState.status === "saving" || closeState.status === "ai-loading" ? "⏳ " : ""}{closeState.message ?? ""}
            {closeState.provider ? ` · ${closeState.provider}/${closeState.model}` : ""}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={finishDay}
            disabled={closeState.status === "saving" || closeState.status === "ai-loading"}
            className="h-11 rounded-lg accent-btn text-sm font-semibold disabled:opacity-40"
          >
            {closeState.status === "ai-loading"
              ? "AI думает..."
              : closeState.status === "saving"
                ? "Сохраняю..."
                : focusedLog.status === "completed"
                  ? "Пересохранить день"
                  : isViewingToday
                    ? "Закончить день"
                    : "Сохранить и закрыть"}
          </button>
          <button type="button" onClick={reopenDay} className="h-11 rounded-lg bg-[#0d1520] text-sm font-semibold text-[#c7d4e5]">
            Открыть снова
          </button>
        </div>
      </div>

      {focusedLog.status === "completed" && focusedLog.dayAnalysis ? (
        <DayAnalysisCard
          analysis={focusedLog.dayAnalysis}
          dateLabel={isViewingToday ? "Сегодня" : focusedDate}
          generatedAt={focusedLog.dayAnalysisAt}
        />
      ) : null}

      {archives.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setIsArchiveOpen((prev) => !prev)}
            className="app-subcard flex w-full items-center justify-between px-3 py-2.5 text-left"
          >
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#9db0c8]">
              <CalendarDays size={14} />
              Просмотр прошлых дней
            </span>
            <span className="text-[11px] font-semibold text-[#8fff70]">
              {isArchiveOpen ? "Скрыть" : `Открыть (${archives.length})`}
            </span>
          </button>
          <details className="app-card px-4 py-3" open={isArchiveOpen} onToggle={(event) => setIsArchiveOpen((event.currentTarget as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-xs uppercase tracking-[0.11em] text-[#9db0c8]">
            Архив закрытых дней ({archives.length})
          </summary>
          <div className="mt-3 space-y-2.5">
            {archives.slice(0, 30).map((archive) => (
              <ArchiveDayCard
                key={archive.id}
                archive={archive}
                isActive={archive.date === focusedDate && !isViewingToday}
                onDelete={() => deleteArchive(archive.id)}
                onRerunAi={() => rerunAiAnalysisForArchive(archive)}
                onEdit={() => editPastDay(archive)}
              />
            ))}
          </div>
        </details>
        </div>
      ) : null}
    </section>
  );
}

function DayAnalysisCard({
  analysis,
  dateLabel,
  generatedAt,
}: {
  analysis: NonNullable<DayLog["dayAnalysis"]>;
  dateLabel: string;
  generatedAt?: string;
}) {
  return (
    <div className="app-card space-y-2.5 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.11em] text-[#9db0c8]">AI-анализ дня</p>
          <p className="mt-0.5 text-[15px] font-semibold tracking-[-0.01em] text-[#f6fbff]">{dateLabel}</p>
        </div>
        <span className="rounded-full bg-[rgba(132,225,75,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8fff70]">
          {analysis.source === "ai" ? `AI · ${analysis.model ?? "gemini"}` : "Локально"}
        </span>
      </div>
      <p className="text-sm leading-snug text-[#e5edf8]">{analysis.summary}</p>
      <BulletList title="Что хорошо" items={analysis.good} tone="good" />
      <BulletList title="Что отклонилось" items={analysis.issues} tone="issue" />
      <BulletList title="Действия на завтра" items={analysis.nextDayActions} />
      {analysis.predictions && analysis.predictions.length > 0 ? (
        <BulletList title="Прогноз по форме и весу" items={analysis.predictions} />
      ) : null}
      {analysis.recommendations && analysis.recommendations.length > 0 ? (
        <BulletList title="Рекомендации" items={analysis.recommendations} />
      ) : null}
      {analysis.limitations && analysis.limitations.length > 0 ? (
        <p className="text-[10px] text-[#7f91a8]">⓵ {analysis.limitations.join(" ")}</p>
      ) : null}
      {generatedAt ? (
        <p className="text-[10px] text-[#7f91a8]">Готово: {new Date(generatedAt).toLocaleString("ru-RU")}</p>
      ) : null}
    </div>
  );
}

function BulletList({ title, items, tone }: { title: string; items: string[]; tone?: "good" | "issue" }) {
  if (!items || items.length === 0) return null;
  const color =
    tone === "good" ? "text-[#a8f070]" : tone === "issue" ? "text-[#ff8095]" : "text-[#9db0c8]";
  return (
    <div>
      <p className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${color}`}>{title}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-[#cfd9e9]">
        {items.map((item, idx) => (
          <li key={idx}>· {item}</li>
        ))}
      </ul>
    </div>
  );
}

function ArchiveDayCard({
  archive,
  isActive,
  onDelete,
  onRerunAi,
  onEdit,
}: {
  archive: ClosedDayArchive;
  isActive?: boolean;
  onDelete: () => void;
  onRerunAi: () => void;
  onEdit: () => void;
}) {
  return (
    <div className={`rounded-2xl border ${isActive ? "border-[rgba(132,225,75,0.45)] bg-[rgba(132,225,75,0.06)]" : "border-[rgba(255,255,255,0.06)] bg-[rgba(11,17,28,0.85)]"} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-[#f5f9ff]">{archive.date}</p>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[#8da1bb]">
            {archive.dayType === "strength" ? "Силовой день" : "Обычный день"} · закрыт {new Date(archive.closedAt).toLocaleString("ru-RU")}
          </p>
        </div>
        <span className="rounded-full bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a7b7cd]">
          {archive.analysis?.source === "ai" ? "AI" : "rule-based"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[#b8c7da] sm:grid-cols-4">
        <span>K {formatNumber(archive.consumed.kcal)} ккал</span>
        <span>Б {formatNumber(archive.consumed.protein)} г</span>
        <span>Ж {formatNumber(archive.consumed.fat)} г</span>
        <span>У {formatNumber(archive.consumed.carbs)} г</span>
        <span>Активность {formatNumber(archive.activeKcal)} ккал</span>
        <span>Net {formatNumber(archive.netKcal)} ккал</span>
        <span>Микро покрытие {formatNumber(archive.micronutrientCoverage)}%</span>
        <span>{archive.weightKg ? `${formatNumber(archive.weightKg)} кг` : "вес не указан"}</span>
      </div>
      {archive.analysis ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9db0c8]">
            Показать анализ
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-xs text-[#e5edf8]">{archive.analysis.summary}</p>
            <BulletList title="Хорошо" items={archive.analysis.good} tone="good" />
            <BulletList title="Отклонения" items={archive.analysis.issues} tone="issue" />
            <BulletList title="На следующий день" items={archive.analysis.nextDayActions} />
            {archive.analysis.predictions && archive.analysis.predictions.length > 0 ? (
              <BulletList title="Прогноз" items={archive.analysis.predictions} />
            ) : null}
            {archive.analysis.recommendations && archive.analysis.recommendations.length > 0 ? (
              <BulletList title="Рекомендации" items={archive.analysis.recommendations} />
            ) : null}
          </div>
        </details>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className={`h-8 flex-1 rounded-lg text-[11px] font-semibold ${isActive ? "accent-btn" : "bg-[#0d1520] text-[#8fff70]"}`}
        >
          {isActive ? "Редактируется" : "Редактировать"}
        </button>
        <button type="button" onClick={onRerunAi} className="h-8 flex-1 rounded-lg secondary-btn text-[11px] font-semibold">
          Перезапросить AI
        </button>
        <button type="button" onClick={onDelete} className="icon-action-btn danger-btn" aria-label="Удалить запись из архива">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function MicroNormChart({
  items,
}: {
  items: Array<{ label: string; consumed: number; target?: number; ratio: number }>;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-[#9db0c8]">Нет данных о микронутриентах за день.</p>;
  }

  const visible = items.slice(0, 10);
  return (
    <div className="space-y-3">
      {visible.map((item) => {
        const pct = item.target ? Math.max(0, Math.min(1, item.ratio)) : 0;
        return (
          <div key={item.label} className="app-subcard p-2.5">
            <div className="mb-1.5 flex items-center justify-between text-xs text-[#b8c7da]">
              <span className="capitalize">{item.label}</span>
              <span>
                {formatNumber(item.consumed)}
                {item.target ? ` / ${formatNumber(item.target)}` : " (нет нормы)"}
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${pct * 100}%`,
                  background: pct >= 1 ? "linear-gradient(90deg,#84e14b,#9cf067)" : "linear-gradient(90deg,#3e82ff,#5ca1ff)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HeroCaloriesRing({ consumed, target, ratio }: { consumed: number; target: number; ratio: number }) {
  const size = 224;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.max(0, Math.min(1, ratio)));

  return (
    <div className="mt-1 flex justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <linearGradient id="heroCaloriesGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="12%" stopColor="#98ee57" />
              <stop offset="56%" stopColor="#46a6ff" />
              <stop offset="96%" stopColor="#ff5572" />
            </linearGradient>
            <filter id="heroGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="#101b2a" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="url(#heroCaloriesGradient)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            filter="url(#heroGlow)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#869ab3]">Calories</p>
          <p className="mt-1 text-[2.55rem] font-bold leading-none tracking-[-0.033em] text-[#f8fcff]">{formatNumber(consumed)}</p>
          <p className="mt-1 text-[11px] text-[#8ea3bf]">of {formatNumber(target)} kcal</p>
        </div>
      </div>
    </div>
  );
}

function GoalMiniRing({ ratio }: { ratio: number }) {
  const size = 54;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeRatio = Math.max(0, Math.min(1, ratio));
  const offset = circumference * (1 - safeRatio);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1d2b3e" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#8cf55e"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#e6f3ff]">
        {Math.round(safeRatio * 100)}%
      </div>
    </div>
  );
}

function MacroMiniRing({
  label,
  consumed,
  target,
  color,
}: {
  label: string;
  consumed: number;
  target: number;
  color: string;
}) {
  const size = 52;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, consumed / target));
  const offset = circumference * (1 - ratio);

  return (
    <div className="rounded-[14px] bg-[rgba(15,22,34,0.62)] px-1.5 py-1 text-center ring-1 ring-white/5">
      <div className="mx-auto" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1b283b" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
      </div>
      <p className="mt-1 text-[9px] uppercase tracking-[0.08em] text-[#8ea3bf]">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold leading-none">{formatNumber(consumed)}г</p>
      <p className="mt-0.5 text-[9px] text-[#8da1bb]">{Math.round(ratio * 100)}%</p>
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
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${ratio * 100}%`, background: progressColor }}
        />
      </div>
    </div>
  );
}
