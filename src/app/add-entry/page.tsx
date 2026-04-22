"use client";

import {
  calculateFoodNutrientsForWeight,
  calculateRecipePortionNutrients,
  dayLogRepo,
  foodRepo,
  mealEntryRepo,
  parseQuickEntryText,
  searchExternalFoods,
  unitLabel,
  recentItemRepo,
  recipeIngredientRepo,
  recipeRepo,
} from "@/lib/data";
import { createSpeechProvider } from "@/lib/speech";
import type { DayLog, ExternalFoodSearchResult, Food, MealEntry, ParsedQuickEntryItem, RecentItem, Recipe, RecipeIngredient } from "@/lib/data";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type EntryType = "food" | "recipe";
type VoiceState = "idle" | "listening" | "processing" | "parsed" | "error" | "unavailable";

function nowISO(): string {
  return new Date().toISOString();
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
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

export default function AddEntryPage() {
  const router = useRouter();
  const speechProvider = useMemo(() => createSpeechProvider(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [entryType, setEntryType] = useState<EntryType>("food");
  const [selectedId, setSelectedId] = useState<string>("");
  const [weightInput, setWeightInput] = useState("150");

  const [foods, setFoods] = useState<Food[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [quickInput, setQuickInput] = useState("");
  const [quickDraft, setQuickDraft] = useState<
    Array<{
      id: string;
      parsed: ParsedQuickEntryItem;
      sourceType: "food" | "recipe";
      sourceId: string;
      weightInput: string;
      confidence: number;
    }>
  >([]);
  const [quickMessage, setQuickMessage] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceText, setVoiceText] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [isResolvingExternal, setIsResolvingExternal] = useState(false);

  useEffect(() => {
    async function loadData() {
      const [foodsList, recipesList, ingredientsList, recent] = await Promise.all([
        foodRepo.list(),
        recipeRepo.list(),
        recipeIngredientRepo.list(),
        recentItemRepo.list(),
      ]);

      setFoods(foodsList.sort((a, b) => a.name.localeCompare(b.name, "ru")));
      setRecipes(recipesList.sort((a, b) => a.name.localeCompare(b.name, "ru")));
      setRecipeIngredients(ingredientsList);
      setRecentItems(recent);
      setIsLoading(false);
    }

    loadData().catch((error: unknown) => {
      console.error("Failed to load add-entry data", error);
      setIsLoading(false);
    });
  }, []);

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

  const normalizedQuery = query.trim().toLowerCase();

  const items = useMemo(() => {
    const recentById = new Map(
      recentItems.filter((item) => item.itemType === entryType).map((item) => [item.itemId, item]),
    );

    if (entryType === "food") {
      return foods
        .filter((food) => food.name.toLowerCase().includes(normalizedQuery))
        .map((food) => ({
          id: food.id,
          title: food.name,
          subtitle: `${food.nutrientsPer100g.kcal} ккал / 100 г`,
          useCount: recentById.get(food.id)?.useCount ?? 0,
          lastUsedAt: recentById.get(food.id)?.lastUsedAt ?? "",
        }))
        .sort((a, b) => b.useCount - a.useCount || b.lastUsedAt.localeCompare(a.lastUsedAt) || a.title.localeCompare(b.title, "ru"));
    }

    return recipes
      .filter((recipe) => recipe.name.toLowerCase().includes(normalizedQuery))
      .map((recipe) => ({
        id: recipe.id,
        title: recipe.name,
        subtitle: "Рецепт",
        useCount: recentById.get(recipe.id)?.useCount ?? 0,
        lastUsedAt: recentById.get(recipe.id)?.lastUsedAt ?? "",
      }))
      .sort((a, b) => b.useCount - a.useCount || b.lastUsedAt.localeCompare(a.lastUsedAt) || a.title.localeCompare(b.title, "ru"));
  }, [entryType, foods, recipes, normalizedQuery, recentItems]);

  const selectedTitle = useMemo(() => {
    if (!selectedId) return "";
    return entryType === "food" ? foodsById.get(selectedId)?.name ?? "" : recipesById.get(selectedId)?.name ?? "";
  }, [selectedId, entryType, foodsById, recipesById]);

  const preview = useMemo(() => {
    const weightG = parseWeight(weightInput);
    if (!selectedId || weightG <= 0) {
      return { kcal: 0, protein: 0, fat: 0, carbs: 0 };
    }

    if (entryType === "food") {
      const food = foodsById.get(selectedId);
      if (!food) return { kcal: 0, protein: 0, fat: 0, carbs: 0 };
      return calculateFoodNutrientsForWeight(food.nutrientsPer100g, weightG);
    }

    const recipe = recipesById.get(selectedId);
    if (!recipe) return { kcal: 0, protein: 0, fat: 0, carbs: 0 };
    const ingredients = ingredientsByRecipeId.get(recipe.id) ?? [];
    return calculateRecipePortionNutrients(recipe, ingredients, foodsById, weightG);
  }, [selectedId, weightInput, entryType, foodsById, recipesById, ingredientsByRecipeId]);

  const recentQuick = useMemo(() => {
    return recentItems
      .filter((item) => item.itemType === entryType)
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
      .slice(0, 5);
  }, [recentItems, entryType]);

  const frequentQuick = useMemo(() => {
    return recentItems
      .filter((item) => item.itemType === entryType)
      .sort((a, b) => b.useCount - a.useCount || b.lastUsedAt.localeCompare(a.lastUsedAt))
      .slice(0, 5);
  }, [recentItems, entryType]);

  function resolveItemName(item: RecentItem): string {
    if (item.itemType === "food") {
      return foodsById.get(item.itemId)?.name ?? "";
    }
    return recipesById.get(item.itemId)?.name ?? "";
  }

  function makeDraftId(prefix: string): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.round(Math.random() * 10000)}`;
  }

  function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^\p{L}\p{N}% ]/gu, " ").replace(/\s+/g, " ").trim();
  }

  function defaultWeightFromParsed(parsed: ParsedQuickEntryItem): number {
    if (parsed.unit === "kg") return parsed.quantity * 1000;
    if (parsed.unit === "ml") return parsed.quantity;
    if (parsed.unit === "g") return parsed.quantity;

    const normalized = normalizeName(parsed.productName);
    const gramPerPiece = normalized.includes("яйц") || normalized.includes("egg") ? 50 : 100;
    return parsed.quantity * gramPerPiece;
  }

  function scoreNameMatch(source: string, target: string): number {
    const a = normalizeName(source);
    const b = normalizeName(target);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.82;

    const sourceTokens = a.split(" ");
    const targetTokens = b.split(" ");
    const overlap = sourceTokens.filter((token) => targetTokens.includes(token)).length;
    const tokenScore = overlap / Math.max(sourceTokens.length, targetTokens.length);
    return Math.max(0, Math.min(0.79, tokenScore));
  }

  function pickBestDraftMatch(parsed: ParsedQuickEntryItem): { sourceType: "food" | "recipe"; sourceId: string; confidence: number } {
    const localFoods = foods.filter((food) => food.source === "custom");
    const localRecipes = recipes;
    const importedFoods = foods.filter((food) => food.source === "imported");

    const bestLocalFood = localFoods
      .map((food) => ({ id: food.id, confidence: scoreNameMatch(parsed.productName, food.name), type: "food" as const }))
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (bestLocalFood && bestLocalFood.confidence >= 0.75) {
      return { sourceType: "food", sourceId: bestLocalFood.id, confidence: bestLocalFood.confidence };
    }

    const bestRecipe = localRecipes
      .map((recipe) => ({ id: recipe.id, confidence: scoreNameMatch(parsed.productName, recipe.name), type: "recipe" as const }))
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (bestRecipe && bestRecipe.confidence >= 0.72) {
      return { sourceType: "recipe", sourceId: bestRecipe.id, confidence: bestRecipe.confidence };
    }

    const bestImported = importedFoods
      .map((food) => ({ id: food.id, confidence: scoreNameMatch(parsed.productName, food.name), type: "food" as const }))
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (bestImported && bestImported.confidence >= 0.7) {
      return { sourceType: "food", sourceId: bestImported.id, confidence: bestImported.confidence };
    }

    return { sourceType: "food", sourceId: "", confidence: 0 };
  }

  async function importBestExternalCandidate(parsed: ParsedQuickEntryItem): Promise<{ sourceId: string; confidence: number } | null> {
    const candidates = await searchExternalFoods(parsed.productName);
    const suitable = candidates
      .filter((item) => item.hasCompleteNutrients)
      .map((item) => ({
        item,
        score: scoreNameMatch(parsed.productName, item.name),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (!suitable || suitable.score < 0.55) return null;

    const existingByExternalRef = foods.find(
      (food) => food.externalRefId === `${suitable.item.provider}:${suitable.item.externalId}`,
    );
    if (existingByExternalRef) {
      return { sourceId: existingByExternalRef.id, confidence: suitable.score };
    }

    const imported = mapExternalToImportedFood(suitable.item);
    await foodRepo.upsert(imported);
    return { sourceId: imported.id, confidence: suitable.score };
  }

  function mapExternalToImportedFood(item: ExternalFoodSearchResult): Food {
    const timestamp = nowISO();
    return {
      id: makeId("food"),
      name: item.name,
      source: "imported",
      externalRefId: `${item.provider}:${item.externalId}`,
      externalMeta: {
        provider: item.provider,
        externalId: item.externalId,
        barcode: item.barcode,
        rawName: item.name,
        importedAt: timestamp,
        rawSource: item.sourceMeta,
      },
      nutrientsPer100g: {
        kcal: item.nutrientsPer100g.kcal ?? 0,
        protein: item.nutrientsPer100g.protein ?? 0,
        fat: item.nutrientsPer100g.fat ?? 0,
        carbs: item.nutrientsPer100g.carbs ?? 0,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async function parseQuickTextToDraft(inputText?: string) {
    const parsedItems = parseQuickEntryText(inputText ?? quickInput);
    if (parsedItems.length === 0) {
      setQuickDraft([]);
      setQuickMessage("Не удалось разобрать строку. Пример: 60 г овсянки + 30 г протеина");
      return;
    }

    setIsResolvingExternal(true);
    const nextFoods = [...foods];
    const draft = [];
    for (const parsed of parsedItems) {
      let match = pickBestDraftMatch(parsed);
      if (!match.sourceId) {
        try {
          const externalMatch = await importBestExternalCandidate(parsed);
          if (externalMatch) {
            const refreshedFoods = await foodRepo.list();
            nextFoods.splice(0, nextFoods.length, ...refreshedFoods);
            match = { sourceType: "food", sourceId: externalMatch.sourceId, confidence: Math.max(0.6, externalMatch.confidence) };
          }
        } catch (error) {
          console.error("Auto-import external candidate failed", error);
        }
      }

      draft.push({
        id: makeDraftId("draft"),
        parsed,
        sourceType: match.sourceType,
        sourceId: match.sourceId,
        weightInput: String(defaultWeightFromParsed(parsed)),
        confidence: match.confidence,
      });
    }

    setFoods(nextFoods.sort((a, b) => a.name.localeCompare(b.name, "ru")));
    setQuickDraft(draft);
    setQuickMessage("Черновик собран. Неизвестные продукты автоматически подтянуты из внешней базы, если найдены.");
    setIsResolvingExternal(false);
  }

  async function saveQuickDraft() {
    if (quickDraft.length === 0) return;

    const validDraft = quickDraft.filter((item) => item.sourceId && parseWeight(item.weightInput) > 0);
    if (validDraft.length === 0) {
      setQuickMessage("В draft нет валидных элементов для сохранения.");
      return;
    }

    const date = todayISODate();
    const timestamp = nowISO();
    const existingDayLog = await dayLogRepo.getByDate(date);

    const dayLog: DayLog =
      existingDayLog ??
      ({
        id: date,
        date,
        dayType: "normal",
        status: "active",
        activeKcal: 0,
        activitySource: "manual",
        healthSyncStatus: "idle",
        manualActivityOverride: false,
        healthPermissionsState: "unknown",
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies DayLog);

    if (!existingDayLog) {
      await dayLogRepo.upsert(dayLog);
    } else if (existingDayLog.status === "completed") {
      await dayLogRepo.upsert({
        ...existingDayLog,
        status: "active",
        dayAnalysis: undefined,
        dayAnalysisAt: undefined,
        updatedAt: timestamp,
      });
    }

    for (const draftItem of validDraft) {
      const weightG = parseWeight(draftItem.weightInput);

      const mealEntry: MealEntry = {
        id: makeId("meal"),
        dayLogId: dayLog.id,
        mealType: "snack",
        sourceType: draftItem.sourceType,
        sourceId: draftItem.sourceId,
        amountG: weightG,
        consumedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await mealEntryRepo.upsert(mealEntry);

      const recentId = `${draftItem.sourceType}_${draftItem.sourceId}`;
      const existingRecent = recentItems.find((item) => item.id === recentId);
      const nextRecent: RecentItem = {
        id: recentId,
        itemType: draftItem.sourceType,
        itemId: draftItem.sourceId,
        lastUsedAt: timestamp,
        useCount: (existingRecent?.useCount ?? 0) + 1,
        lastAmountG: weightG,
      };

      await recentItemRepo.upsert(nextRecent);
    }

    setQuickMessage(`Сохранено записей: ${validDraft.length}`);
    setQuickDraft([]);
    setQuickInput("");
    router.push("/");
  }

  async function startVoiceInput() {
    const speechAvailability = speechProvider.getAvailability();
    if (speechAvailability.availability !== "available") {
      setVoiceState("unavailable");
      setVoiceError(speechAvailability.reason ?? "unknown");
      setQuickMessage("Голосовой ввод недоступен в этом браузере. Используй обычный текстовый ввод.");
      return;
    }

    try {
      setVoiceError("");
      setVoiceState("listening");
      const transcription = await speechProvider.listenOnce("ru-RU");
      setVoiceText(transcription.text);
      setQuickInput(transcription.text);
      setVoiceState("processing");
      const parsedItems = parseQuickEntryText(transcription.text);
      if (parsedItems.length === 0) {
        setVoiceState("error");
        setQuickMessage("Не удалось распознать структуру приема пищи. Поправь текст вручную.");
        return;
      }

      await parseQuickTextToDraft(transcription.text);
      setVoiceState("parsed");
    } catch (error) {
      setVoiceState("error");
      const message = error instanceof Error ? error.message : "unknown";
      setVoiceError(message);
      setQuickMessage("Ошибка голосового ввода. Попробуй еще раз.");
    }
  }

  async function saveEntry() {
    const weightG = parseWeight(weightInput);
    if (!selectedId || weightG <= 0) return;

    const date = todayISODate();
    const timestamp = nowISO();
    const existingDayLog = await dayLogRepo.getByDate(date);

    const dayLog: DayLog =
      existingDayLog ??
      ({
        id: date,
        date,
        dayType: "normal",
        status: "active",
        activeKcal: 0,
        activitySource: "manual",
        healthSyncStatus: "idle",
        manualActivityOverride: false,
        healthPermissionsState: "unknown",
        createdAt: timestamp,
        updatedAt: timestamp,
      } satisfies DayLog);

    if (!existingDayLog) {
      await dayLogRepo.upsert(dayLog);
    } else if (existingDayLog.status === "completed") {
      await dayLogRepo.upsert({
        ...existingDayLog,
        status: "active",
        dayAnalysis: undefined,
        dayAnalysisAt: undefined,
        updatedAt: timestamp,
      });
    }

    const mealEntry: MealEntry = {
      id: makeId("meal"),
      dayLogId: dayLog.id,
      mealType: "snack",
      sourceType: entryType,
      sourceId: selectedId,
      amountG: weightG,
      consumedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await mealEntryRepo.upsert(mealEntry);

    const recentId = `${entryType}_${selectedId}`;
    const existingRecent = recentItems.find((item) => item.id === recentId);
    const nextRecent: RecentItem = {
      id: recentId,
      itemType: entryType,
      itemId: selectedId,
      lastUsedAt: timestamp,
      useCount: (existingRecent?.useCount ?? 0) + 1,
      lastAmountG: weightG,
    };
    await recentItemRepo.upsert(nextRecent);
    setRecentItems((prev) => {
      const withoutCurrent = prev.filter((item) => item.id !== recentId);
      return [nextRecent, ...withoutCurrent];
    });

    router.push("/");
  }

  return (
    <section className="space-y-4 pb-2">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Добавить прием</p>
        <h1 className="text-xl font-semibold">Добавить прием пищи</h1>
      </header>

      <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Быстрый текстовый ввод (v1, локально)</p>
        <button
          type="button"
          onClick={startVoiceInput}
          className="h-11 w-full rounded-lg bg-neutral-100 text-sm font-semibold"
        >
          🎤 Голосовой ввод
        </button>
        <p className="text-xs text-neutral-600">
          Состояние:{" "}
          {voiceState === "idle"
            ? "ожидание"
            : voiceState === "listening"
              ? "слушаю"
              : voiceState === "processing"
                ? "обработка"
                : voiceState === "parsed"
                  ? "черновик готов"
                  : voiceState === "unavailable"
                    ? "недоступно"
                    : "ошибка"}
        </p>
        {voiceText ? <p className="text-xs text-neutral-700">Распознано: {voiceText}</p> : null}
        {voiceError ? <p className="text-xs text-red-700">Детали: {voiceError}</p> : null}
        <textarea
          value={quickInput}
          onChange={(event) => setQuickInput(event.target.value)}
          placeholder="Пример: 60 г овсянки + 30 г протеина"
          className="min-h-20 w-full rounded-lg border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-700"
        />
        <button type="button" onClick={() => parseQuickTextToDraft()} className="h-11 w-full rounded-lg bg-neutral-100 text-sm font-semibold">
          {isResolvingExternal ? "Подбираю продукты..." : "Разобрать в draft"}
        </button>

        {quickDraft.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Черновик перед сохранением</p>
            {quickDraft.map((item, index) => (
              <div key={item.id} className="rounded-lg border border-neutral-200 p-2">
                <p className="mb-1 text-xs text-neutral-500">
                  {index + 1}. {item.parsed.quantity} {unitLabel(item.parsed.unit)} {item.parsed.productName}
                </p>
                <p className="mb-1 text-xs text-neutral-500">Confidence: {(item.confidence * 100).toFixed(0)}%</p>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setQuickDraft((prev) =>
                        prev.map((draft) =>
                          draft.id === item.id ? { ...draft, sourceType: "food", sourceId: "" } : draft,
                        ),
                      )
                    }
                    className={`h-9 rounded-lg text-xs font-semibold ${
                      item.sourceType === "food" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
                    }`}
                  >
                    Продукт
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setQuickDraft((prev) =>
                        prev.map((draft) =>
                          draft.id === item.id ? { ...draft, sourceType: "recipe", sourceId: "" } : draft,
                        ),
                      )
                    }
                    className={`h-9 rounded-lg text-xs font-semibold ${
                      item.sourceType === "recipe" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
                    }`}
                  >
                    Рецепт
                  </button>
                </div>
                <select
                  value={item.sourceId}
                  onChange={(event) =>
                    setQuickDraft((prev) =>
                      prev.map((draft) => (draft.id === item.id ? { ...draft, sourceId: event.target.value } : draft)),
                    )
                  }
                  className="mb-2 h-10 w-full rounded-lg border border-neutral-300 px-2 text-sm outline-none focus:border-neutral-700"
                >
                  <option value="">Выбери {item.sourceType === "food" ? "продукт" : "рецепт"}</option>
                  {(item.sourceType === "food" ? foods : recipes).map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  value={item.weightInput}
                  onChange={(event) =>
                    setQuickDraft((prev) =>
                      prev.map((draft) => (draft.id === item.id ? { ...draft, weightInput: event.target.value } : draft)),
                    )
                  }
                  placeholder="Вес, г"
                  className="h-10 w-full rounded-lg border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-700"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={saveQuickDraft}
              className="h-11 w-full rounded-lg bg-neutral-900 text-sm font-semibold text-white"
            >
              Подтвердить и сохранить draft
            </button>
          </div>
        ) : null}

        {quickMessage ? <p className="text-xs text-neutral-600">{quickMessage}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setEntryType("food");
            setSelectedId("");
          }}
          className={`h-12 rounded-lg text-sm font-semibold ${
            entryType === "food" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
          }`}
        >
          Продукт
        </button>
        <button
          type="button"
          onClick={() => {
            setEntryType("recipe");
            setSelectedId("");
          }}
          className={`h-12 rounded-lg text-sm font-semibold ${
            entryType === "recipe" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
          }`}
        >
          Блюдо
        </button>
      </div>

      <QuickPickSection
        title="Недавние"
        items={recentQuick}
        resolveName={resolveItemName}
        selectedId={selectedId}
        onSelect={(id, amount) => {
          setSelectedId(id);
          if (amount) setWeightInput(String(amount));
        }}
      />

      <QuickPickSection
        title="Частые"
        items={frequentQuick}
        resolveName={resolveItemName}
        selectedId={selectedId}
        onSelect={(id, amount) => {
          setSelectedId(id);
          if (amount) setWeightInput(String(amount));
        }}
      />

      <div className="rounded-xl border border-neutral-200 p-3">
        <input
          type="text"
          placeholder={entryType === "food" ? "Поиск продукта" : "Поиск блюда"}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-700"
        />
      </div>

      <div className="max-h-60 space-y-2 overflow-y-auto rounded-xl border border-neutral-200 p-3">
        {isLoading ? (
          <p className="text-sm text-neutral-500">Загрузка...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-neutral-500">Ничего не найдено.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={`w-full rounded-lg border px-3 py-3 text-left ${
                selectedId === item.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-900"
              }`}
            >
              <p className="text-sm font-semibold">{item.title}</p>
              <p className={`text-xs ${selectedId === item.id ? "text-neutral-200" : "text-neutral-500"}`}>
                {item.subtitle}
                {item.useCount > 0 ? ` · Частота: ${item.useCount}` : ""}
              </p>
            </button>
          ))
        )}
      </div>

      <div className="rounded-xl border border-neutral-200 p-3">
        <label htmlFor="entry-weight" className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500">
          Вес, г
        </label>
        <input
          id="entry-weight"
          type="text"
          inputMode="decimal"
          value={weightInput}
          onChange={(event) => setWeightInput(event.target.value)}
          className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-700"
        />
      </div>

      <div className="rounded-xl border border-neutral-200 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">КБЖУ записи</p>
        <p className="text-sm text-neutral-700">
          {selectedTitle || "Не выбрано"} · {formatNumber(parseWeight(weightInput))} г
        </p>
        <p className="mt-1 text-sm">
          {formatNumber(preview.kcal)} ккал · Б {formatNumber(preview.protein)} · Ж {formatNumber(preview.fat)} · У {formatNumber(preview.carbs)}
        </p>
      </div>

      <button
        type="button"
        onClick={saveEntry}
        disabled={!selectedId || parseWeight(weightInput) <= 0}
        className="flex h-12 w-full items-center justify-center rounded-lg bg-neutral-900 text-sm font-semibold text-white disabled:opacity-40"
      >
        Сохранить в текущий день
      </button>

      <Link href="/" className="flex h-12 w-full items-center justify-center rounded-lg bg-neutral-100 text-sm font-semibold text-neutral-800">
        Назад к Сегодня
      </Link>
    </section>
  );
}

function QuickPickSection({
  title,
  items,
  resolveName,
  selectedId,
  onSelect,
}: {
  title: string;
  items: RecentItem[];
  resolveName: (item: RecentItem) => string;
  selectedId: string;
  onSelect: (id: string, amount?: number) => void;
}) {
  const mapped = items
    .map((item) => ({ id: item.itemId, name: resolveName(item), amount: item.lastAmountG }))
    .filter((item) => item.name);

  if (mapped.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">{title}</p>
      <div className="flex flex-wrap gap-2">
        {mapped.map((item) => (
          <button
            key={`${title}_${item.id}`}
            type="button"
            onClick={() => onSelect(item.id, item.amount)}
            className={`h-10 rounded-lg px-3 text-xs font-semibold ${
              selectedId === item.id ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
            }`}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}
