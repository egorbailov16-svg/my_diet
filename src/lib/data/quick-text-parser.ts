export type ParsedQuickEntryUnit = "g" | "kg" | "ml" | "pcs";

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
  мл: "ml",
  ml: "ml",
  миллилитр: "ml",
  миллилитра: "ml",
  миллилитров: "ml",
  шт: "pcs",
  штука: "pcs",
  штуки: "pcs",
  штук: "pcs",
};

const LEADING_AMOUNT_REGEX =
  /^\s*(\d+(?:[.,]\d+)?)\s*(г|гр|грамм|грамма|граммов|кг|kg|шт|штука|штуки|штук)?\s+(.+?)\s*$/i;
const TRAILING_AMOUNT_REGEX =
  /^\s*(.+?)\s+(\d+(?:[.,]\d+)?)\s*(г|гр|грамм|грамма|граммов|кг|kg|мл|ml|миллилитр|миллилитра|миллилитров|шт|штука|штуки|штук)\s*$/i;

export function parseQuickEntryText(input: string): ParsedQuickEntryItem[] {
  return input
    .split(/(?:\+|,|\s+и\s+)/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parsePart)
    .filter((item): item is ParsedQuickEntryItem => item !== null);
}

function parsePart(part: string): ParsedQuickEntryItem | null {
  const leadingMatch = part.match(LEADING_AMOUNT_REGEX);
  const trailingMatch = part.match(TRAILING_AMOUNT_REGEX);
  const quantityValue = leadingMatch?.[1] ?? trailingMatch?.[2];
  const unitValue = leadingMatch?.[2] ?? trailingMatch?.[3] ?? "";
  const nameValue = leadingMatch?.[3] ?? trailingMatch?.[1];

  if (!quantityValue || !nameValue) return null;

  const quantityRaw = Number(quantityValue.replace(",", "."));
  if (!Number.isFinite(quantityRaw) || quantityRaw <= 0) {
    return null;
  }

  const unitRaw = unitValue.toLowerCase();
  const productName = nameValue.trim();
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
  if (unit === "ml") return "мл";
  if (unit === "pcs") return "шт";
  return "г";
}
