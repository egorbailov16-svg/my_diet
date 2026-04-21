export type ParsedQuickEntryUnit = "g" | "kg" | "pcs";

export type ParsedQuickEntryItem = {
  raw: string;
  quantity: number;
  unit: ParsedQuickEntryUnit;
  productName: string;
};

const UNIT_ALIASES: Record<string, ParsedQuickEntryUnit> = {
  г: "g",
  гр: "g",
  грамм: "g",
  грамма: "g",
  граммов: "g",
  kg: "kg",
  кг: "kg",
  шт: "pcs",
  штука: "pcs",
  штуки: "pcs",
  штук: "pcs",
};

const PART_REGEX =
  /^\s*(\d+(?:[.,]\d+)?)\s*(г|гр|грамм|грамма|граммов|кг|kg|шт|штука|штуки|штук)?\s+(.+?)\s*$/i;

export function parseQuickEntryText(input: string): ParsedQuickEntryItem[] {
  return input
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parsePart)
    .filter((item): item is ParsedQuickEntryItem => item !== null);
}

function parsePart(part: string): ParsedQuickEntryItem | null {
  const match = part.match(PART_REGEX);
  if (!match) {
    return null;
  }

  const quantityRaw = Number(match[1].replace(",", "."));
  if (!Number.isFinite(quantityRaw) || quantityRaw <= 0) {
    return null;
  }

  const unitRaw = (match[2] ?? "").toLowerCase();
  const productName = match[3].trim();
  if (!productName) {
    return null;
  }

  const normalizedUnit = UNIT_ALIASES[unitRaw] ?? inferUnitFromName(productName);

  return {
    raw: part,
    quantity: Math.round(quantityRaw * 100) / 100,
    unit: normalizedUnit,
    productName,
  };
}

function inferUnitFromName(name: string): ParsedQuickEntryUnit {
  const normalized = name.toLowerCase();
  if (normalized.includes("яйц") || normalized.includes("egg")) {
    return "pcs";
  }

  return "g";
}

export function unitLabel(unit: ParsedQuickEntryUnit): string {
  if (unit === "kg") return "кг";
  if (unit === "pcs") return "шт";
  return "г";
}
