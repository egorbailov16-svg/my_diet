import type { Food } from "@/lib/data/types";

export type NutrientMap = Record<string, number>;

function normalizeNutrientName(raw: string): string {
  return raw
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-zA-Zа-яА-ЯёЁ0-9+\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeValue(raw: string): number | null {
  const cleaned = raw
    .replace(/[−–—]/g, "-")
    .replace(/^[^\d+\-]*/u, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function mergeMap(target: NutrientMap, source: NutrientMap): NutrientMap {
  const out: NutrientMap = { ...target };
  for (const [name, value] of Object.entries(source)) {
    out[name] = value;
  }
  return out;
}

function parsePairs(text: string): NutrientMap {
  const map: NutrientMap = {};
  const pairRegex = /([a-zA-Zа-яА-ЯёЁ0-9+\- ]{2,}?)\s*[:=]\s*([~≈<>≤≥]?\s*[-+]?\d+(?:[.,]\d+)?)/g;
  let match: RegExpExecArray | null = pairRegex.exec(text);
  while (match) {
    const name = normalizeNutrientName(match[1] ?? "");
    const value = normalizeValue(match[2] ?? "");
    if (name && value !== null) {
      map[name] = value;
    }
    match = pairRegex.exec(text);
  }
  return map;
}

function splitSections(note: string): { micro: string; vitamins: string } {
  const text = note.toLowerCase();
  const microMarker = text.search(/микро|минерал|micro|mineral/);
  const vitaminMarker = text.search(/витамин|vitamin/);

  if (microMarker === -1 && vitaminMarker === -1) {
    return { micro: note, vitamins: "" };
  }

  if (microMarker !== -1 && (vitaminMarker === -1 || microMarker < vitaminMarker)) {
    const micro = note.slice(microMarker, vitaminMarker === -1 ? note.length : vitaminMarker);
    const vitamins = vitaminMarker === -1 ? "" : note.slice(vitaminMarker);
    return { micro, vitamins };
  }

  const vitamins = note.slice(vitaminMarker, microMarker === -1 ? note.length : microMarker);
  const micro = microMarker === -1 ? "" : note.slice(microMarker);
  return { micro, vitamins };
}

function splitGenericMicroAndVitamins(data: NutrientMap): { micro: NutrientMap; vitamins: NutrientMap } {
  const micro: NutrientMap = {};
  const vitamins: NutrientMap = {};

  for (const [key, value] of Object.entries(data)) {
    if (/(^| )витамин|vitamin|^a$|^b[0-9]+$|^c$|^d$|^e$|^k$/i.test(key)) {
      vitamins[key] = value;
    } else {
      micro[key] = value;
    }
  }

  return { micro, vitamins };
}

export function parseNutrientsFromNote(note?: string): {
  micronutrientsPer100g?: NutrientMap;
  vitaminsPer100g?: NutrientMap;
} {
  const trimmed = note?.trim();
  if (!trimmed) return {};

  const sections = splitSections(trimmed);
  const sectionMicro = parsePairs(sections.micro);
  const sectionVitamins = parsePairs(sections.vitamins);
  const generic = splitGenericMicroAndVitamins(parsePairs(trimmed));

  const micro = mergeMap(generic.micro, sectionMicro);
  const vitamins = mergeMap(generic.vitamins, sectionVitamins);

  return {
    micronutrientsPer100g: Object.keys(micro).length > 0 ? micro : undefined,
    vitaminsPer100g: Object.keys(vitamins).length > 0 ? vitamins : undefined,
  };
}

export function resolveFoodNutrientDetails(food: Food): {
  micronutrientsPer100g?: NutrientMap;
  vitaminsPer100g?: NutrientMap;
} {
  const fromNote = parseNutrientsFromNote(food.note);
  const micro = food.micronutrientsPer100g ?? fromNote.micronutrientsPer100g;
  const vitamins = food.vitaminsPer100g ?? fromNote.vitaminsPer100g;
  return {
    micronutrientsPer100g: micro,
    vitaminsPer100g: vitamins,
  };
}
