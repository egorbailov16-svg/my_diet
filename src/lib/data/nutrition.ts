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

export function pickPreferredFood(candidates: Food[]): Food | null {
  if (candidates.length === 0) {
    return null;
  }

  const customFood = candidates.find((food) => food.source === "custom");
  return customFood ?? candidates[0];
}
