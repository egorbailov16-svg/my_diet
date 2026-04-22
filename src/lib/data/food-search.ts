export type ExternalFoodSearchResult = {
  provider: string;
  externalId: string;
  barcode?: string;
  name: string;
  brand?: string;
  nutrientsPer100g: {
    kcal: number | null;
    protein: number | null;
    fat: number | null;
    carbs: number | null;
  };
  hasCompleteNutrients: boolean;
  sourceMeta?: Record<string, unknown>;
};

export interface FoodSearchProvider {
  providerId: string;
  searchFoods(query: string): Promise<ExternalFoodSearchResult[]>;
}

type OpenFoodFactsProduct = {
  code?: string;
  product_name_ru?: string;
  generic_name_ru?: string;
  product_name?: string;
  generic_name?: string;
  brands?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    "energy-kcal"?: number;
    proteins_100g?: number;
    fat_100g?: number;
    carbohydrates_100g?: number;
  };
};

type OpenFoodFactsResponse = {
  products?: OpenFoodFactsProduct[];
};

function toNumberOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function pickRussianName(product: OpenFoodFactsProduct): string | null {
  const variants = [product.product_name_ru, product.generic_name_ru, product.product_name, product.generic_name];

  for (const variant of variants) {
    const normalized = variant?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function normalizeOpenFoodFactsProduct(product: OpenFoodFactsProduct, providerId: string): ExternalFoodSearchResult | null {
  const code = product.code?.trim();
  const name = pickRussianName(product);
  if (!code || !name) {
    return null;
  }

  const nutriments = product.nutriments;
  const kcal = toNumberOrNull(nutriments?.["energy-kcal_100g"] ?? nutriments?.["energy-kcal"]);
  const protein = toNumberOrNull(nutriments?.proteins_100g);
  const fat = toNumberOrNull(nutriments?.fat_100g);
  const carbs = toNumberOrNull(nutriments?.carbohydrates_100g);
  const hasCompleteNutrients = [kcal, protein, fat, carbs].every((value) => value !== null);

  return {
    provider: providerId,
    externalId: code,
    barcode: code,
    name,
    brand: product.brands?.trim() || undefined,
    nutrientsPer100g: {
      kcal,
      protein,
      fat,
      carbs,
    },
    hasCompleteNutrients,
    sourceMeta: {
      product_name_ru: product.product_name_ru,
      generic_name_ru: product.generic_name_ru,
      product_name: product.product_name,
      generic_name: product.generic_name,
    },
  };
}

class OpenFoodFactsProvider implements FoodSearchProvider {
  providerId = "openfoodfacts";

  async searchFoods(query: string): Promise<ExternalFoodSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return [];
    }

    const params = new URLSearchParams({
      search_terms: trimmed,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: "12",
      fields: "code,product_name_ru,generic_name_ru,product_name,generic_name,brands,nutriments",
    });

    const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`OpenFoodFacts request failed with ${response.status}`);
    }

    const data = (await response.json()) as OpenFoodFactsResponse;
    const products = data.products ?? [];

    return products
      .map((product) => normalizeOpenFoodFactsProduct(product, this.providerId))
      .filter((item): item is ExternalFoodSearchResult => item !== null);
  }
}

const defaultProvider: FoodSearchProvider = new OpenFoodFactsProvider();

export async function searchExternalFoods(query: string): Promise<ExternalFoodSearchResult[]> {
  return defaultProvider.searchFoods(query);
}
