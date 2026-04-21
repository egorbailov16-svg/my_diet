"use client";

import { foodRepo, searchExternalFoods } from "@/lib/data";
import type { ExternalFoodSearchResult, Food, FoodSource } from "@/lib/data";
import { useEffect, useMemo, useState } from "react";

type FoodFormState = {
  name: string;
  kcal: string;
  protein: string;
  fat: string;
  carbs: string;
  note: string;
  source: FoodSource;
};

const initialForm: FoodFormState = {
  name: "",
  kcal: "",
  protein: "",
  fat: "",
  carbs: "",
  note: "",
  source: "custom",
};

function nowISO(): string {
  return new Date().toISOString();
}

function makeFoodId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `food_${crypto.randomUUID()}`;
  }

  return `food_${Date.now()}`;
}

function parseNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function sourcePriority(source: FoodSource): number {
  return source === "custom" ? 0 : 1;
}

export default function FoodsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [foods, setFoods] = useState<Food[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FoodFormState>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [externalQuery, setExternalQuery] = useState("");
  const [isExternalLoading, setIsExternalLoading] = useState(false);
  const [externalResults, setExternalResults] = useState<ExternalFoodSearchResult[]>([]);
  const [externalMessage, setExternalMessage] = useState("");

  useEffect(() => {
    loadFoods()
      .catch((error: unknown) => console.error("Failed to load foods", error))
      .finally(() => setIsLoading(false));
  }, []);

  async function loadFoods() {
    const allFoods = await foodRepo.list();
    setFoods(allFoods);
  }

  const filteredFoods = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return foods
      .filter((food) => food.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        const sourceDelta = sourcePriority(a.source) - sourcePriority(b.source);
        if (sourceDelta !== 0) return sourceDelta;
        return a.name.localeCompare(b.name, "ru");
      });
  }, [foods, query]);

  function startEdit(food: Food) {
    if (food.source !== "custom") return;

    setEditingId(food.id);
    setForm({
      name: food.name,
      kcal: String(food.nutrientsPer100g.kcal),
      protein: String(food.nutrientsPer100g.protein),
      fat: String(food.nutrientsPer100g.fat),
      carbs: String(food.nutrientsPer100g.carbs),
      note: food.note ?? "",
      source: food.source,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const timestamp = nowISO();
    const currentEditing = editingId ? foods.find((food) => food.id === editingId) : null;

    const nextFood: Food = {
      id: editingId ?? makeFoodId(),
      name: form.name.trim(),
      source: form.source,
      note: form.note.trim() || undefined,
      nutrientsPer100g: {
        kcal: parseNumber(form.kcal),
        protein: parseNumber(form.protein),
        fat: parseNumber(form.fat),
        carbs: parseNumber(form.carbs),
      },
      createdAt: currentEditing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    if (!nextFood.name) return;

    await foodRepo.upsert(nextFood);
    await loadFoods();
    resetForm();
  }

  async function onDelete(food: Food) {
    if (food.source !== "custom") return;
    await foodRepo.remove(food.id);
    await loadFoods();

    if (editingId === food.id) {
      resetForm();
    }
  }

  async function onExternalSearch() {
    const trimmed = externalQuery.trim();
    if (!trimmed) {
      setExternalResults([]);
      setExternalMessage("");
      return;
    }

    setIsExternalLoading(true);
    setExternalMessage("");
    try {
      const results = await searchExternalFoods(trimmed);
      setExternalResults(results);
      if (results.length === 0) {
        setExternalMessage("Ничего не найдено во внешнем источнике.");
      }
    } catch (error: unknown) {
      console.error("External search failed", error);
      setExternalMessage("Ошибка внешнего поиска. Попробуй еще раз.");
    } finally {
      setIsExternalLoading(false);
    }
  }

  async function importExternalFood(item: ExternalFoodSearchResult) {
    const externalRefId = `${item.provider}:${item.externalId}`;
    const existing = foods.find((food) => food.externalRefId === externalRefId);
    if (existing) {
      setExternalMessage("Этот внешний продукт уже импортирован локально.");
      return;
    }

    const timestamp = nowISO();
    const importedFood: Food = {
      id: makeFoodId(),
      name: item.name,
      source: "custom",
      externalRefId,
      note: `Imported from ${item.provider}${item.brand ? ` (${item.brand})` : ""}`,
      nutrientsPer100g: item.nutrientsPer100g,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await foodRepo.upsert(importedFood);
    await loadFoods();
    setExternalMessage(`Импортировано: ${item.name}`);
  }

  return (
    <section className="space-y-4 pb-2">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Foods</p>
        <h1 className="text-xl font-semibold">Продукты</h1>
      </header>

      <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {editingId ? "Редактировать продукт" : "Добавить продукт"}
        </p>

        <input
          type="text"
          placeholder="Название"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-700"
          required
        />

        <div className="grid grid-cols-2 gap-2">
          <NumericInput label="Ккал /100г" value={form.kcal} onChange={(value) => setForm((prev) => ({ ...prev, kcal: value }))} />
          <NumericInput
            label="Белки /100г"
            value={form.protein}
            onChange={(value) => setForm((prev) => ({ ...prev, protein: value }))}
          />
          <NumericInput label="Жиры /100г" value={form.fat} onChange={(value) => setForm((prev) => ({ ...prev, fat: value }))} />
          <NumericInput
            label="Углеводы /100г"
            value={form.carbs}
            onChange={(value) => setForm((prev) => ({ ...prev, carbs: value }))}
          />
        </div>

        <textarea
          placeholder="Заметка (необязательно)"
          value={form.note}
          onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
          className="min-h-20 w-full rounded-lg border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-700"
        />

        <div className="rounded-lg border border-neutral-200 p-2">
          <p className="mb-2 text-xs text-neutral-500">Источник</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, source: "custom" }))}
              className={`h-10 rounded-lg text-xs font-semibold ${
                form.source === "custom" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
              }`}
            >
              custom
            </button>
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, source: "external" }))}
              className={`h-10 rounded-lg text-xs font-semibold ${
                form.source === "external" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800"
              }`}
            >
              external
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="submit" className="h-12 rounded-lg bg-neutral-900 text-sm font-semibold text-white">
            {editingId ? "Сохранить" : "Добавить"}
          </button>
          <button type="button" onClick={resetForm} className="h-12 rounded-lg bg-neutral-100 text-sm font-semibold text-neutral-800">
            Очистить
          </button>
        </div>
      </form>

      <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Внешний поиск (OpenFoodFacts)</p>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="text"
            placeholder="Найти во внешнем источнике"
            value={externalQuery}
            onChange={(event) => setExternalQuery(event.target.value)}
            className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-700"
          />
          <button
            type="button"
            onClick={onExternalSearch}
            className="h-12 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white"
            disabled={isExternalLoading}
          >
            {isExternalLoading ? "..." : "Поиск"}
          </button>
        </div>
        {externalMessage ? <p className="text-xs text-neutral-600">{externalMessage}</p> : null}
        {externalResults.length > 0 ? (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {externalResults.map((item) => (
              <article key={`${item.provider}_${item.externalId}`} className="rounded-lg border border-neutral-200 p-3">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="text-xs text-neutral-500">
                      {item.provider}
                      {item.brand ? ` · ${item.brand}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => importExternalFood(item)}
                    className="h-10 rounded-lg bg-neutral-900 px-3 text-xs font-semibold text-white"
                  >
                    Импорт
                  </button>
                </div>
                <p className="text-xs text-neutral-600">
                  {item.nutrientsPer100g.kcal} ккал · Б {item.nutrientsPer100g.protein} · Ж {item.nutrientsPer100g.fat} · У{" "}
                  {item.nutrientsPer100g.carbs} (на 100 г)
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-neutral-200 p-3">
        <input
          type="text"
          placeholder="Поиск продукта"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-700"
        />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : filteredFoods.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">Ничего не найдено.</p>
        ) : (
          filteredFoods.map((food) => (
            <article key={food.id} className="rounded-xl border border-neutral-200 p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{food.name}</h2>
                  <span
                    className={`mt-1 inline-block rounded px-2 py-1 text-[11px] font-medium ${
                      food.source === "custom" ? "bg-neutral-900 text-white" : "bg-neutral-200 text-neutral-700"
                    }`}
                  >
                    {food.source}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(food)}
                    disabled={food.source !== "custom"}
                    className="h-10 rounded-lg bg-neutral-100 px-3 text-xs font-semibold text-neutral-800 disabled:opacity-40"
                  >
                    Изм.
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(food)}
                    disabled={food.source !== "custom"}
                    className="h-10 rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-700 disabled:opacity-40"
                  >
                    Удал.
                  </button>
                </div>
              </div>

              <p className="text-xs text-neutral-600">
                {food.nutrientsPer100g.kcal} ккал · Б {food.nutrientsPer100g.protein} · Ж {food.nutrientsPer100g.fat} · У{" "}
                {food.nutrientsPer100g.carbs} (на 100 г)
              </p>
              {food.note ? <p className="mt-2 text-xs text-neutral-500">{food.note}</p> : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function NumericInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-neutral-500">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-700"
        required
      />
    </label>
  );
}
