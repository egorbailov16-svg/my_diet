"use client";

import { calculateRecipePer100g, calculateRecipePortionNutrients, foodRepo, recipeIngredientRepo, recipeRepo } from "@/lib/data";
import { isAdminUnlocked } from "@/lib/admin/local-admin";
import type { Food, Recipe, RecipeIngredient } from "@/lib/data";
import { useEffect, useMemo, useState } from "react";

type IngredientInput = {
  localId: string;
  foodId: string;
  weightG: string;
};

type RecipeForm = {
  name: string;
  cookedWeightG: string;
  portionWeightG: string;
  ingredients: IngredientInput[];
};

const emptyForm: RecipeForm = {
  name: "",
  cookedWeightG: "",
  portionWeightG: "150",
  ingredients: [{ localId: "row_1", foodId: "", weightG: "" }],
};

function nowISO(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.round(Math.random() * 10000)}`;
}

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function format(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function recipeImageUrl(name: string): string {
  return `https://source.unsplash.com/featured/?meal,${encodeURIComponent(name)}`;
}

export default function RecipesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [foods, setFoods] = useState<Food[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [allIngredients, setAllIngredients] = useState<RecipeIngredient[]>([]);
  const [query, setQuery] = useState("");
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [form, setForm] = useState<RecipeForm>(emptyForm);
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  useEffect(() => {
    loadData()
      .catch((error: unknown) => console.error("Failed to load recipes page data", error))
      .finally(() => setIsLoading(false));
    setAdminUnlocked(isAdminUnlocked());
  }, []);

  async function loadData() {
    const [foodsList, recipesList, ingredientsList] = await Promise.all([foodRepo.list(), recipeRepo.list(), recipeIngredientRepo.list()]);
    setFoods(foodsList.sort((a, b) => a.name.localeCompare(b.name, "ru")));
    setRecipes(recipesList.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setAllIngredients(ingredientsList);
  }

  const foodsById = useMemo(() => new Map(foods.map((food) => [food.id, food])), [foods]);

  const ingredientsByRecipeId = useMemo(() => {
    const map = new Map<string, RecipeIngredient[]>();
    for (const ingredient of allIngredients) {
      const current = map.get(ingredient.recipeId) ?? [];
      current.push(ingredient);
      map.set(ingredient.recipeId, current);
    }
    return map;
  }, [allIngredients]);

  const recipePreviewIngredients = useMemo<RecipeIngredient[]>(() => {
    return form.ingredients
      .filter((item) => item.foodId)
      .map((item) => ({
        id: item.localId,
        recipeId: editingRecipeId ?? "preview",
        foodId: item.foodId,
        weightG: toNumber(item.weightG),
        createdAt: "",
        updatedAt: "",
      }))
      .filter((item) => item.weightG > 0);
  }, [form.ingredients, editingRecipeId]);

  const recipePreview = useMemo(() => {
    return {
      id: editingRecipeId ?? "preview",
      name: form.name || "Новый рецепт",
      cookedWeightG: toNumber(form.cookedWeightG) || undefined,
      createdAt: "",
      updatedAt: "",
    } satisfies Recipe;
  }, [form.name, form.cookedWeightG, editingRecipeId]);

  const totals = useMemo(() => {
    return calculateRecipePer100g(recipePreview, recipePreviewIngredients, foodsById);
  }, [recipePreview, recipePreviewIngredients, foodsById]);

  const portionNutrients = useMemo(() => {
    return calculateRecipePortionNutrients(recipePreview, recipePreviewIngredients, foodsById, toNumber(form.portionWeightG));
  }, [recipePreview, recipePreviewIngredients, foodsById, form.portionWeightG]);

  const filteredRecipes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return recipes.filter((recipe) => recipe.name.toLowerCase().includes(normalizedQuery));
  }, [recipes, query]);

  function addIngredientRow() {
    setForm((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, { localId: makeId("row"), foodId: "", weightG: "" }],
    }));
  }

  function updateIngredient(localId: string, patch: Partial<IngredientInput>) {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    }));
  }

  function removeIngredient(localId: string) {
    setForm((prev) => {
      if (prev.ingredients.length === 1) {
        return { ...prev, ingredients: [{ localId: makeId("row"), foodId: "", weightG: "" }] };
      }
      return { ...prev, ingredients: prev.ingredients.filter((item) => item.localId !== localId) };
    });
  }

  function resetForm() {
    setEditingRecipeId(null);
    setForm({
      ...emptyForm,
      ingredients: [{ localId: makeId("row"), foodId: "", weightG: "" }],
    });
  }

  async function onSaveRecipe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminUnlocked) return;

    const name = form.name.trim();
    if (!name) return;

    const validIngredients = form.ingredients
      .filter((item) => item.foodId && toNumber(item.weightG) > 0)
      .map((item) => ({
        foodId: item.foodId,
        weightG: toNumber(item.weightG),
      }));

    if (validIngredients.length === 0) return;

    const timestamp = nowISO();
    const existing = editingRecipeId ? recipes.find((recipe) => recipe.id === editingRecipeId) : null;
    const recipeId = editingRecipeId ?? makeId("recipe");

    const nextRecipe: Recipe = {
      id: recipeId,
      name,
      cookedWeightG: toNumber(form.cookedWeightG) || undefined,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await recipeRepo.upsert(nextRecipe);
    await recipeIngredientRepo.removeByRecipeId(recipeId);

    const nextIngredients: RecipeIngredient[] = validIngredients.map((item) => ({
      id: makeId("ri"),
      recipeId,
      foodId: item.foodId,
      weightG: item.weightG,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    await recipeIngredientRepo.upsertMany(nextIngredients);
    await loadData();
    resetForm();
  }

  function onEditRecipe(recipe: Recipe) {
    const ingredients = ingredientsByRecipeId.get(recipe.id) ?? [];
    setEditingRecipeId(recipe.id);
    setForm({
      name: recipe.name,
      cookedWeightG: recipe.cookedWeightG ? String(recipe.cookedWeightG) : "",
      portionWeightG: "150",
      ingredients:
        ingredients.length > 0
          ? ingredients.map((item) => ({ localId: item.id, foodId: item.foodId, weightG: String(item.weightG) }))
          : [{ localId: makeId("row"), foodId: "", weightG: "" }],
    });
  }

  async function onDeleteRecipe(recipeId: string) {
    if (!adminUnlocked) return;
    await recipeIngredientRepo.removeByRecipeId(recipeId);
    await recipeRepo.remove(recipeId);
    await loadData();

    if (editingRecipeId === recipeId) {
      resetForm();
    }
  }

  return (
    <section className="space-y-4 pb-2 text-neutral-100">
      <header className="space-y-2">
        <p className="screen-subtitle">Конструктор рецептов</p>
        <h1 className="screen-title">Добавить блюдо</h1>
      </header>

      <form onSubmit={onSaveRecipe} className="app-card space-y-3 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[#9db0c8]">
          {editingRecipeId ? "Редактирование рецепта" : "Новый рецепт"}
        </p>
        {!adminUnlocked ? <p className="text-xs text-amber-700">Только админ может менять рецепты. Включи режим в Настройках.</p> : null}

        <input
          type="text"
          placeholder="Название рецепта"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          className="h-12 w-full rounded-2xl border border-neutral-300 px-3 text-base outline-none"
          required
        />

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Ингредиенты</p>
          {form.ingredients.map((item, index) => (
            <div key={item.localId} className="app-subcard p-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-[#9db0c8]">Ингредиент {index + 1}</p>
                <button
                  type="button"
                  onClick={() => removeIngredient(item.localId)}
                  className="h-9 rounded-xl danger-btn px-3 text-xs font-semibold"
                >
                  Убрать
                </button>
              </div>
              <select
                value={item.foodId}
                onChange={(event) => updateIngredient(item.localId, { foodId: event.target.value })}
                className="mb-2 h-11 w-full rounded-xl border border-neutral-300 px-2 text-sm outline-none"
              >
                <option value="">Выбери продукт</option>
                {foods.map((food) => (
                  <option key={food.id} value={food.id}>
                    {food.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Вес, г"
                value={item.weightG}
                onChange={(event) => updateIngredient(item.localId, { weightG: event.target.value })}
                className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none"
              />
            </div>
          ))}
          <button type="button" onClick={addIngredientRow} disabled={!adminUnlocked} className="h-11 w-full rounded-xl secondary-btn text-sm font-semibold disabled:opacity-40">
            + Добавить ингредиент
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs text-[#9db0c8]">Готовый вес, г</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.cookedWeightG}
              onChange={(event) => setForm((prev) => ({ ...prev, cookedWeightG: event.target.value }))}
              className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none"
              placeholder="Например 800"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-[#9db0c8]">Порция, г</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.portionWeightG}
              onChange={(event) => setForm((prev) => ({ ...prev, portionWeightG: event.target.value }))}
              className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none"
            />
          </label>
        </div>

        <div className="app-subcard p-3 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Авторасчет</p>
          <p className="text-[#e8f0fc]">
            Всего: {format(totals.totalForRecipe.kcal)} ккал · Б {format(totals.totalForRecipe.protein)} · Ж {format(totals.totalForRecipe.fat)} · У{" "}
            {format(totals.totalForRecipe.carbs)}
          </p>
          <p className="mt-1 text-[#b8c7da]">
            На 100 г: {format(totals.per100g.kcal)} ккал · Б {format(totals.per100g.protein)} · Ж {format(totals.per100g.fat)} · У{" "}
            {format(totals.per100g.carbs)}
          </p>
          <p className="mt-1 text-[#b8c7da]">
            Порция {format(toNumber(form.portionWeightG))} г: {format(portionNutrients.kcal)} ккал · Б {format(portionNutrients.protein)} · Ж{" "}
            {format(portionNutrients.fat)} · У {format(portionNutrients.carbs)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="submit" disabled={!adminUnlocked} className="h-12 rounded-2xl accent-btn text-sm font-semibold disabled:opacity-40">
            {editingRecipeId ? "Сохранить" : "Сохранить рецепт"}
          </button>
          <button type="button" onClick={resetForm} className="h-12 rounded-2xl secondary-btn text-sm font-semibold">
            Очистить
          </button>
        </div>
      </form>

      <div className="app-card p-3">
        <input
          type="text"
          placeholder="Поиск рецепта"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-12 w-full rounded-2xl border border-neutral-300 px-3 text-base outline-none"
        />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-[#9db0c8]">Загрузка...</p>
        ) : filteredRecipes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#2a3a52] p-4 text-sm text-[#9db0c8]">Рецептов пока нет.</p>
        ) : (
          filteredRecipes.map((recipe) => {
            const recipeIngredients = ingredientsByRecipeId.get(recipe.id) ?? [];
            const stats = calculateRecipePer100g(recipe, recipeIngredients, foodsById);

            return (
              <article key={recipe.id} className="app-card p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <img
                      src={recipeImageUrl(recipe.name)}
                      alt={recipe.name}
                      className="food-thumb"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.src = "https://source.unsplash.com/featured/?dish,food";
                      }}
                    />
                    <div>
                    <h2 className="text-sm font-semibold">{recipe.name}</h2>
                    <p className="text-xs text-[#8da1bb]">
                      Ингредиентов: {recipeIngredients.length} · Вес блюда: {recipe.cookedWeightG ?? "не указан"} г
                    </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onEditRecipe(recipe)}
                      disabled={!adminUnlocked}
                      className="h-8 rounded-lg secondary-btn px-2.5 text-[11px] font-semibold"
                    >
                      Изм.
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRecipe(recipe.id)}
                      disabled={!adminUnlocked}
                      className="h-8 rounded-lg danger-btn px-2.5 text-[11px] font-semibold"
                    >
                      Удал.
                    </button>
                  </div>
                </div>
                <p className="text-sm font-semibold text-[#e8f0fc]">Всего: {format(stats.totalForRecipe.kcal)} ккал</p>
                <p className="text-xs text-[#b8c7da]">
                  <span className="macro-protein">Б {format(stats.totalForRecipe.protein)}</span> ·{" "}
                  <span className="macro-fat">Ж {format(stats.totalForRecipe.fat)}</span> ·{" "}
                  <span className="macro-carbs">У {format(stats.totalForRecipe.carbs)}</span>
                </p>
                <p className="mt-1 text-xs text-[#b8c7da]">
                  На 100 г: {format(stats.per100g.kcal)} ккал · Б {format(stats.per100g.protein)} · Ж {format(stats.per100g.fat)} · У{" "}
                  {format(stats.per100g.carbs)}
                </p>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
