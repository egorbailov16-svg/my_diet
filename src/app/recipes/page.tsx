"use client";

import { calculateRecipePer100g, calculateRecipePortionNutrients, foodRepo, recipeIngredientRepo, recipeRepo } from "@/lib/data";
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

export default function RecipesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [foods, setFoods] = useState<Food[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [allIngredients, setAllIngredients] = useState<RecipeIngredient[]>([]);
  const [query, setQuery] = useState("");
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [form, setForm] = useState<RecipeForm>(emptyForm);

  useEffect(() => {
    loadData()
      .catch((error: unknown) => console.error("Failed to load recipes page data", error))
      .finally(() => setIsLoading(false));
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
    await recipeIngredientRepo.removeByRecipeId(recipeId);
    await recipeRepo.remove(recipeId);
    await loadData();

    if (editingRecipeId === recipeId) {
      resetForm();
    }
  }

  return (
    <section className="space-y-4 pb-2">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Recipes</p>
        <h1 className="text-xl font-semibold">Рецепты</h1>
      </header>

      <form onSubmit={onSaveRecipe} className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {editingRecipeId ? "Редактирование рецепта" : "Новый рецепт"}
        </p>

        <input
          type="text"
          placeholder="Название рецепта"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-700"
          required
        />

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Ингредиенты</p>
          {form.ingredients.map((item, index) => (
            <div key={item.localId} className="rounded-lg border border-neutral-200 p-2">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-neutral-500">Ингредиент {index + 1}</p>
                <button
                  type="button"
                  onClick={() => removeIngredient(item.localId)}
                  className="h-9 rounded-md bg-neutral-100 px-3 text-xs font-semibold text-neutral-700"
                >
                  Убрать
                </button>
              </div>
              <select
                value={item.foodId}
                onChange={(event) => updateIngredient(item.localId, { foodId: event.target.value })}
                className="mb-2 h-11 w-full rounded-lg border border-neutral-300 px-2 text-sm outline-none focus:border-neutral-700"
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
                className="h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-700"
              />
            </div>
          ))}
          <button type="button" onClick={addIngredientRow} className="h-11 w-full rounded-lg bg-neutral-100 text-sm font-semibold">
            + Добавить ингредиент
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs text-neutral-500">Готовый вес, г</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.cookedWeightG}
              onChange={(event) => setForm((prev) => ({ ...prev, cookedWeightG: event.target.value }))}
              className="h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-700"
              placeholder="Например 800"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-neutral-500">Порция, г</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.portionWeightG}
              onChange={(event) => setForm((prev) => ({ ...prev, portionWeightG: event.target.value }))}
              className="h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-700"
            />
          </label>
        </div>

        <div className="rounded-lg bg-neutral-50 p-3 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Авторасчет</p>
          <p className="text-neutral-700">
            Всего: {format(totals.totalForRecipe.kcal)} ккал · Б {format(totals.totalForRecipe.protein)} · Ж {format(totals.totalForRecipe.fat)} · У{" "}
            {format(totals.totalForRecipe.carbs)}
          </p>
          <p className="mt-1 text-neutral-700">
            На 100 г: {format(totals.per100g.kcal)} ккал · Б {format(totals.per100g.protein)} · Ж {format(totals.per100g.fat)} · У{" "}
            {format(totals.per100g.carbs)}
          </p>
          <p className="mt-1 text-neutral-700">
            Порция {format(toNumber(form.portionWeightG))} г: {format(portionNutrients.kcal)} ккал · Б {format(portionNutrients.protein)} · Ж{" "}
            {format(portionNutrients.fat)} · У {format(portionNutrients.carbs)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="submit" className="h-12 rounded-lg bg-neutral-900 text-sm font-semibold text-white">
            {editingRecipeId ? "Сохранить" : "Сохранить рецепт"}
          </button>
          <button type="button" onClick={resetForm} className="h-12 rounded-lg bg-neutral-100 text-sm font-semibold text-neutral-800">
            Очистить
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-neutral-200 p-3">
        <input
          type="text"
          placeholder="Поиск рецепта"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-700"
        />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : filteredRecipes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">Рецептов пока нет.</p>
        ) : (
          filteredRecipes.map((recipe) => {
            const recipeIngredients = ingredientsByRecipeId.get(recipe.id) ?? [];
            const stats = calculateRecipePer100g(recipe, recipeIngredients, foodsById);

            return (
              <article key={recipe.id} className="rounded-xl border border-neutral-200 p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">{recipe.name}</h2>
                    <p className="text-xs text-neutral-500">
                      Ингредиентов: {recipeIngredients.length} · Вес блюда: {recipe.cookedWeightG ?? "не указан"} г
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onEditRecipe(recipe)}
                      className="h-10 rounded-lg bg-neutral-100 px-3 text-xs font-semibold text-neutral-800"
                    >
                      Изм.
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRecipe(recipe.id)}
                      className="h-10 rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-700"
                    >
                      Удал.
                    </button>
                  </div>
                </div>
                <p className="text-xs text-neutral-700">
                  Всего: {format(stats.totalForRecipe.kcal)} ккал · Б {format(stats.totalForRecipe.protein)} · Ж {format(stats.totalForRecipe.fat)}
                  {" · "}У {format(stats.totalForRecipe.carbs)}
                </p>
                <p className="mt-1 text-xs text-neutral-700">
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
