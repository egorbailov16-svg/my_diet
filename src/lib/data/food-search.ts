import type { NutrientsPer100g } from "@/lib/data/types";

export type ExternalFoodSearchResult = {
  provider: string;
  externalId: string;
  name: string;
  brand?: string;
  nutrientsPer100g: NutrientsPer100g;
};

export interface FoodSearchProvider {
  providerId: string;
  searchFoods(query: string): Promise<ExternalFoodSearchResult[]>;
}

type OpenFoodFactsResponse = {
  products?: Array<{
    code?: string;
    product_name?: string;
    brands?: string;
    nutriments?: {
      "energy-kcal_100g"?: number;
      proteins_100g?: number;
      fat_100g?: number;
      carbohydrates_100g?: number;
    };
  }>;
};

class OpenFoodFactsProvider implements FoodSearchProvider {
  providerId = "openfoodfacts";

  async searchFoods(query: string): Promise<ExternalFoodSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const params = new URLSearchParams({
      search_terms: trimmed,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: "12",
      fields: "code,product_name,brands,nutriments",
    });

    const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`OpenFoodFacts request failed with ${response.status}`);
    }

    const data = (await response.json()) as OpenFoodFactsResponse;
    const products = data.products ?? [];

    const mapped: Array<ExternalFoodSearchResult | null> = products.map((product) => {
        const code = product.code?.trim();
        const name = product.product_name?.trim();
        const nutriments = product.nutriments;
        const kcal = nutriments?.["energy-kcal_100g"];
        const protein = nutriments?.proteins_100g;
        const fat = nutriments?.fat_100g;
        const carbs = nutriments?.carbohydrates_100g;

        if (!code || !name) return null;
        if ([kcal, protein, fat, carbs].some((value) => typeof value !== "number")) return null;

        return {
          provider: this.providerId,
          externalId: code,
          name,
          brand: product.brands?.trim() || undefined,
          nutrientsPer100g: {
            kcal: Math.round((kcal ?? 0) * 100) / 100,
            protein: Math.round((protein ?? 0) * 100) / 100,
            fat: Math.round((fat ?? 0) * 100) / 100,
            carbs: Math.round((carbs ?? 0) * 100) / 100,
          },
        };
      });

    return mapped.filter((item): item is ExternalFoodSearchResult => item !== null);
  }
}

const defaultProvider: FoodSearchProvider = new OpenFoodFactsProvider();

export async function searchExternalFoods(query: string): Promise<ExternalFoodSearchResult[]> {
  return defaultProvider.searchFoods(query);
}
