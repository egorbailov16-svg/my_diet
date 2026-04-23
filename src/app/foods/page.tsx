"use client";

import { foodRepo, parseNutrientsFromNote, searchExternalFoods } from "@/lib/data";
import { isAdminUnlocked } from "@/lib/admin/local-admin";
import { FoodThumbnail } from "@/components/food-thumbnail";
import type { ExternalFoodSearchResult, Food, FoodSource } from "@/lib/data";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  if (source === "custom") return 0;
  if (source === "imported") return 1;
  return 2;
}

function sourceLabel(source: FoodSource): string {
  if (source === "custom") return "свой";
  if (source === "imported") return "импорт";
  return "external";
}

function getExternalImageUrl(food: Food): string | undefined {
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

export default function FoodsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [foods, setFoods] = useState<Food[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FoodFormState>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [externalQuery, setExternalQuery] = useState("");
  const [isExternalLoading, setIsExternalLoading] = useState(false);
  const [externalResults, setExternalResults] = useState<ExternalFoodSearchResult[]>([]);
  const [externalError, setExternalError] = useState("");
  const [debouncedExternalQuery, setDebouncedExternalQuery] = useState("");
  const [activeExternalQuery, setActiveExternalQuery] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const externalCacheRef = useRef<Map<string, { ts: number; results: ExternalFoodSearchResult[] }>>(new Map());
  const requestTokenRef = useRef(0);

  useEffect(() => {
    loadFoods()
      .catch((error: unknown) => console.error("Failed to load foods", error))
      .finally(() => setIsLoading(false));
    setAdminUnlocked(isAdminUnlocked());

    const intervalId = window.setInterval(() => {
      loadFoods().catch((error: unknown) => console.error("Background foods sync failed", error));
    }, 12000);

    return () => window.clearInterval(intervalId);
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
    if (food.source === "external") return;

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
    if (!adminUnlocked) return;

    const timestamp = nowISO();
    const currentEditing = editingId ? foods.find((food) => food.id === editingId) : null;

    const nextFood: Food = {
      id: editingId ?? makeFoodId(),
      name: form.name.trim(),
      source: editingId ? (currentEditing?.source ?? "custom") : "custom",
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
    const noteNutrients = parseNutrientsFromNote(nextFood.note);
    nextFood.micronutrientsPer100g = noteNutrients.micronutrientsPer100g ?? currentEditing?.micronutrientsPer100g;
    nextFood.vitaminsPer100g = noteNutrients.vitaminsPer100g ?? currentEditing?.vitaminsPer100g;

    if (!nextFood.name) return;

    await foodRepo.upsert(nextFood);
    await loadFoods();
    resetForm();
  }

  async function onDelete(food: Food) {
    if (!adminUnlocked) return;
    if (food.source === "external") return;
    await foodRepo.remove(food.id);
    await loadFoods();

    if (editingId === food.id) {
      resetForm();
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedExternalQuery(externalQuery.trim());
    }, 700);

    return () => clearTimeout(timeoutId);
  }, [externalQuery]);

  useEffect(() => {
    const query = debouncedExternalQuery;
    if (query.length < 2) return;

    const cached = externalCacheRef.current.get(query);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
      setExternalResults(cached.results);
      setExternalError("");
      setActiveExternalQuery(query);
      return;
    }

    const token = requestTokenRef.current + 1;
    requestTokenRef.current = token;
    setIsExternalLoading(true);
    setExternalError("");
    setActiveExternalQuery(query);

    searchExternalFoods(query)
      .then((results) => {
        if (requestTokenRef.current !== token) return;
        externalCacheRef.current.set(query, { ts: Date.now(), results });
        setExternalResults(results);
      })
      .catch((error: unknown) => {
        if (requestTokenRef.current !== token) return;
        console.error("External search failed", error);
        setExternalError("Ошибка внешнего поиска. Повтори запрос чуть позже.");
        setExternalResults([]);
      })
      .finally(() => {
        if (requestTokenRef.current === token) {
          setIsExternalLoading(false);
        }
      });
  }, [debouncedExternalQuery]);

  async function importExternalFood(item: ExternalFoodSearchResult) {
    if (!adminUnlocked) return;
    const externalRefId = `${item.provider}:${item.externalId}`;
    const existing = foods.find((food) => food.externalRefId === externalRefId);
    if (existing) {
      setExternalError("Этот продукт уже импортирован в локальную базу.");
      return;
    }

    if (!item.hasCompleteNutrients) {
      setExternalError("У продукта неполные КБЖУ. Импорт недоступен.");
      return;
    }

    const { kcal, protein, fat, carbs } = item.nutrientsPer100g;
    if (kcal === null || protein === null || fat === null || carbs === null) {
      setExternalError("У продукта неполные КБЖУ. Импорт недоступен.");
      return;
    }

    const timestamp = nowISO();
    const importedFood: Food = {
      id: makeFoodId(),
      name: item.name,
      source: "imported",
      externalRefId,
      externalMeta: {
        provider: item.provider,
        externalId: item.externalId,
        barcode: item.barcode,
        rawName: item.name,
        importedAt: timestamp,
        rawSource: item.sourceMeta,
      },
      note: `Импортировано из ${item.provider}${item.brand ? ` (${item.brand})` : ""}`,
      nutrientsPer100g: { kcal, protein, fat, carbs },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await foodRepo.upsert(importedFood);
    await loadFoods();
    setExternalError("");
  }

  return (
    <section className="space-y-4 pb-2 text-neutral-100">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="screen-subtitle">Локальная база</p>
            <h1 className="screen-title">Продукты</h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="glass-icon-btn" aria-label="Добавить">＋</button>
            <button type="button" className="glass-icon-btn" aria-label="Опции">⋯</button>
          </div>
        </div>
      </header>

      <form onSubmit={onSubmit} className="app-card space-y-3 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Basic Information</p>
        <p className="text-xs font-medium uppercase tracking-wide text-[#dce8f8]">
          {editingId ? "Редактировать продукт" : "Добавить продукт"}
        </p>
        {!adminUnlocked ? <p className="text-xs text-amber-700">Только админ может менять базу. Включи режим в Настройках.</p> : null}

        <input
          type="text"
          placeholder="Название"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          className="h-12 w-full rounded-2xl  px-3 text-base outline-none"
          required
        />

        <p className="pt-1 text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Nutrition (per 100g)</p>
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
          className="min-h-24 w-full rounded-2xl  px-3 py-2 text-base outline-none"
        />

        <div className="app-subcard p-3">
          <p className="text-xs text-[#9db0c8]">Источник: локальный продукт</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="submit" disabled={!adminUnlocked} className="h-12 rounded-2xl accent-btn text-sm font-semibold disabled:opacity-40">
            {editingId ? "Сохранить" : "Добавить"}
          </button>
          <button type="button" onClick={resetForm} className="h-12 rounded-2xl secondary-btn text-sm font-semibold">
            Очистить
          </button>
        </div>
      </form>

      <div className="app-card space-y-3 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[#9db0c8]">Search External Databases</p>
        <input
          type="text"
          placeholder="Найти во внешней базе (минимум 2 символа)"
          value={externalQuery}
          onChange={(event) => {
            const value = event.target.value;
            setExternalQuery(value);
            if (value.trim().length < 2) {
              setExternalResults([]);
              setExternalError("");
              setActiveExternalQuery("");
            }
          }}
          className="h-12 w-full rounded-2xl  px-3 text-base outline-none"
        />
        {isExternalLoading ? <p className="text-xs text-[#9db0c8]">Ищем во внешней базе...</p> : null}
        {externalError ? <p className="text-xs text-red-600">{externalError}</p> : null}
        {!isExternalLoading && activeExternalQuery.length >= 2 && externalResults.length === 0 && !externalError ? (
          <p className="text-xs text-[#9db0c8]">Ничего не найдено во внешней базе.</p>
        ) : null}
        {externalResults.length > 0 ? (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {externalResults.map((item) => (
              <article key={`${item.provider}_${item.externalId}`} className="app-subcard p-3">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="text-xs text-[#8da1bb]">
                      {item.provider}
                      {item.brand ? ` · ${item.brand}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => importExternalFood(item)}
                    disabled={!item.hasCompleteNutrients || !adminUnlocked}
                    className="h-10 rounded-xl accent-btn px-3 text-xs font-semibold disabled:opacity-40"
                  >
                    Импорт
                  </button>
                </div>
                <p className="text-xs text-[#b8c7da]">
                  {item.nutrientsPer100g.kcal ?? "—"} ккал · Б {item.nutrientsPer100g.protein ?? "—"} · Ж {item.nutrientsPer100g.fat ?? "—"} ·
                  {" "}У {item.nutrientsPer100g.carbs ?? "—"} (на 100 г)
                </p>
                {!item.hasCompleteNutrients ? <p className="mt-1 text-xs text-amber-700">Неполные данные КБЖУ</p> : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className="app-card p-3">
        <input
          type="text"
          placeholder="Поиск продукта"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-12 w-full rounded-2xl  px-3 text-base outline-none"
        />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-[#9db0c8]">Загрузка...</p>
        ) : filteredFoods.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#2a3a52] p-4 text-sm text-[#9db0c8]">Ничего не найдено.</p>
        ) : (
          filteredFoods.map((food) => (
            <article key={food.id} className="app-card p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <FoodThumbnail name={food.name} preferredUrl={getExternalImageUrl(food)} />
                  <div>
                  <h2 className="text-sm font-semibold">{food.name}</h2>
                  <span
                    className={`mt-1 inline-block rounded-xl px-2 py-1 text-[11px] font-medium ${
                      food.source === "custom"
                        ? "bg-[#143018] text-[#8fff70]"
                        : food.source === "imported"
                          ? "bg-[#102744] text-[#6da3ff]"
                          : "bg-[#1b2431] text-[#a8b5c6]"
                    }`}
                  >
                    {sourceLabel(food.source)}
                  </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(food)}
                    disabled={food.source === "external" || !adminUnlocked}
                    className="icon-action-btn secondary-btn disabled:opacity-40"
                    aria-label={`Редактировать ${food.name}`}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(food)}
                    disabled={food.source === "external" || !adminUnlocked}
                    className="icon-action-btn danger-btn disabled:opacity-40"
                    aria-label={`Удалить ${food.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <p className="text-sm font-semibold text-[#eef5ff]">{food.nutrientsPer100g.kcal} ккал / 100 г</p>
              <p className="text-xs text-[#b8c7da]">
                <span className="macro-protein">Б {food.nutrientsPer100g.protein}</span> ·{" "}
                <span className="macro-fat">Ж {food.nutrientsPer100g.fat}</span> ·{" "}
                <span className="macro-carbs">У {food.nutrientsPer100g.carbs}</span>
              </p>
              {food.note ? <p className="mt-2 text-xs text-[#8da1bb]">{food.note}</p> : null}
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
      <span className="text-xs text-[#9db0c8]">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-2xl  px-3 text-base outline-none"
        required
      />
    </label>
  );
}
