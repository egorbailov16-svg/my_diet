import { resolveFoodNutrientDetails, type NutrientMap } from "@/lib/data/nutrient-note-parser";
import type { Food, NutrientsPer100g, NutrientsTotal, Recipe, RecipeIngredient } from "@/lib/data/types";

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function emptyNutrients(): NutrientsTotal {
  return { kcal: 0, protein: 0, fat: 0, carbs: 0 };
}

export function addNutrients(a: NutrientsTotal, b: NutrientsTotal): NutrientsTotal {
  return {
    kcal: round(a.kcal + b.kcal),
    protein: round(a.protein + b.protein),
    fat: round(a.fat + b.fat),
    carbs: round(a.carbs + b.carbs),
  };
}

export function nutrientsForWeight(nutrientsPer100g: NutrientsPer100g, weightG: number): NutrientsTotal {
  const factor = weightG / 100;
  return {
    kcal: round(nutrientsPer100g.kcal * factor),
    protein: round(nutrientsPer100g.protein * factor),
    fat: round(nutrientsPer100g.fat * factor),
    carbs: round(nutrientsPer100g.carbs * factor),
  };
}

export type RecipeNutritionResult = {
  totalForRecipe: NutrientsTotal;
  per100g: NutrientsPer100g;
  baseWeightG: number;
};

export type RecipeNutrientDetailsResult = {
  micronutrientsPer100g: NutrientMap;
  vitaminsPer100g: NutrientMap;
};

function scaleNutrientMap(per100g: NutrientMap | undefined, weightG: number): NutrientMap {
  if (!per100g) return {};
  const factor = weightG / 100;
  const out: NutrientMap = {};
  for (const [name, value] of Object.entries(per100g)) {
    out[name] = round(value * factor);
  }
  return out;
}

function addNutrientMaps(a: NutrientMap, b: NutrientMap): NutrientMap {
  const out: NutrientMap = { ...a };
  for (const [name, value] of Object.entries(b)) {
    out[name] = round((out[name] ?? 0) + value);
  }
  return out;
}

function mapToPer100g(total: NutrientMap, totalWeightG: number): NutrientMap {
  const safeWeight = totalWeightG > 0 ? totalWeightG : 100;
  const factor = 100 / safeWeight;
  const out: NutrientMap = {};
  for (const [name, value] of Object.entries(total)) {
    out[name] = round(value * factor);
  }
  return out;
}

export function calculateRecipeNutrition(
  recipe: Recipe,
  ingredients: RecipeIngredient[],
  foodsById: Map<string, Food>,
): RecipeNutritionResult {
  const totalForRecipe = ingredients.reduce<NutrientsTotal>((acc, ingredient) => {
    const food = foodsById.get(ingredient.foodId);

    if (!food) {
      return acc;
    }

    return addNutrients(acc, nutrientsForWeight(food.nutrientsPer100g, ingredient.weightG));
  }, emptyNutrients());

  const ingredientsWeightG = ingredients.reduce((acc, ingredient) => acc + ingredient.weightG, 0);
  const baseWeightG = recipe.cookedWeightG && recipe.cookedWeightG > 0 ? recipe.cookedWeightG : ingredientsWeightG;
  const safeWeight = baseWeightG > 0 ? baseWeightG : 100;
  const factor = 100 / safeWeight;

  return {
    totalForRecipe,
    per100g: {
      kcal: round(totalForRecipe.kcal * factor),
      protein: round(totalForRecipe.protein * factor),
      fat: round(totalForRecipe.fat * factor),
      carbs: round(totalForRecipe.carbs * factor),
    },
    baseWeightG: safeWeight,
  };
}

export function calculateRecipeNutrientDetails(
  recipe: Recipe,
  ingredients: RecipeIngredient[],
  foodsById: Map<string, Food>,
): RecipeNutrientDetailsResult {
  const totals = ingredients.reduce(
    (acc, ingredient) => {
      const food = foodsById.get(ingredient.foodId);
      if (!food) return acc;

      const details = resolveFoodNutrientDetails(food);
      return {
        micronutrients: addNutrientMaps(acc.micronutrients, scaleNutrientMap(details.micronutrientsPer100g, ingredient.weightG)),
        vitamins: addNutrientMaps(acc.vitamins, scaleNutrientMap(details.vitaminsPer100g, ingredient.weightG)),
      };
    },
    { micronutrients: {} as NutrientMap, vitamins: {} as NutrientMap },
  );

  const ingredientsWeightG = ingredients.reduce((acc, ingredient) => acc + ingredient.weightG, 0);
  const baseWeightG = recipe.cookedWeightG && recipe.cookedWeightG > 0 ? recipe.cookedWeightG : ingredientsWeightG;
  const safeWeight = baseWeightG > 0 ? baseWeightG : 100;

  return {
    micronutrientsPer100g: mapToPer100g(totals.micronutrients, safeWeight),
    vitaminsPer100g: mapToPer100g(totals.vitamins, safeWeight),
  };
}

export function pickPreferredFood(candidates: Food[]): Food | null {
  if (candidates.length === 0) {
    return null;
  }

  const customFood = candidates.find((food) => food.source === "custom");
  if (customFood) {
    return customFood;
  }

  const importedFood = candidates.find((food) => food.source === "imported");
  return importedFood ?? candidates[0];
}
