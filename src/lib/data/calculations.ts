import { addNutrients, calculateRecipeNutrition, emptyNutrients, nutrientsForWeight } from "@/lib/data/nutrition";
import type {
  DayLog,
  DayTarget,
  Food,
  MealEntry,
  NutrientsPer100g,
  NutrientsTotal,
  Recipe,
  RecipeIngredient,
  WeightLog,
} from "@/lib/data/types";

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateFoodNutrientsForWeight(nutrientsPer100g: NutrientsPer100g, weightG: number): NutrientsTotal {
  return nutrientsForWeight(nutrientsPer100g, weightG);
}

export function calculateRecipePer100g(recipe: Recipe, ingredients: RecipeIngredient[], foodsById: Map<string, Food>) {
  return calculateRecipeNutrition(recipe, ingredients, foodsById);
}

export function calculateRecipePortionNutrients(
  recipe: Recipe,
  ingredients: RecipeIngredient[],
  foodsById: Map<string, Food>,
  portionWeightG: number,
): NutrientsTotal {
  const recipeNutrition = calculateRecipeNutrition(recipe, ingredients, foodsById);
  return nutrientsForWeight(recipeNutrition.per100g, portionWeightG);
}

export type DayTotals = {
  consumed: NutrientsTotal;
  activeKcal: number;
  netKcal: number;
};

export function calculateDayTotals(params: {
  dayLog: DayLog;
  mealEntries: MealEntry[];
  foodsById: Map<string, Food>;
  recipesById: Map<string, Recipe>;
  recipeIngredientsByRecipeId: Map<string, RecipeIngredient[]>;
}): DayTotals {
  const { dayLog, mealEntries, foodsById, recipesById, recipeIngredientsByRecipeId } = params;

  const consumed = mealEntries.reduce<NutrientsTotal>((acc, entry) => {
    if (entry.sourceType === "food") {
      const food = foodsById.get(entry.sourceId);
      if (!food) return acc;

      return addNutrients(acc, nutrientsForWeight(food.nutrientsPer100g, entry.amountG));
    }

    const recipe = recipesById.get(entry.sourceId);
    if (!recipe) return acc;

    const ingredients = recipeIngredientsByRecipeId.get(recipe.id) ?? [];
    return addNutrients(acc, calculateRecipePortionNutrients(recipe, ingredients, foodsById, entry.amountG));
  }, emptyNutrients());

  const netKcal = round(consumed.kcal - dayLog.activeKcal);

  return {
    consumed,
    activeKcal: round(dayLog.activeKcal),
    netKcal,
  };
}

export type DayRemaining = {
  kcalMin: number;
  kcalMax: number;
  protein: number;
  fatMin: number;
  fatMax: number;
  carbsMin: number;
  carbsMax: number;
};

export function calculateRemainingToDayTarget(consumed: NutrientsTotal, target: DayTarget): DayRemaining {
  return {
    kcalMin: round(target.kcalMin - consumed.kcal),
    kcalMax: round(target.kcalMax - consumed.kcal),
    protein: round(target.proteinTarget - consumed.protein),
    fatMin: round(target.fatMin - consumed.fat),
    fatMax: round(target.fatMax - consumed.fat),
    carbsMin: round(target.carbsMin - consumed.carbs),
    carbsMax: round(target.carbsMax - consumed.carbs),
  };
}

export type WeeklyAverages = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  activeKcal: number;
  netKcal: number;
  daysCount: number;
};

export function calculateWeeklyAverages(dayTotals: DayTotals[]): WeeklyAverages {
  if (dayTotals.length === 0) {
    return {
      kcal: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      activeKcal: 0,
      netKcal: 0,
      daysCount: 0,
    };
  }

  const sum = dayTotals.reduce(
    (acc, day) => ({
      kcal: acc.kcal + day.consumed.kcal,
      protein: acc.protein + day.consumed.protein,
      fat: acc.fat + day.consumed.fat,
      carbs: acc.carbs + day.consumed.carbs,
      activeKcal: acc.activeKcal + day.activeKcal,
      netKcal: acc.netKcal + day.netKcal,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0, activeKcal: 0, netKcal: 0 },
  );

  return {
    kcal: round(sum.kcal / dayTotals.length),
    protein: round(sum.protein / dayTotals.length),
    fat: round(sum.fat / dayTotals.length),
    carbs: round(sum.carbs / dayTotals.length),
    activeKcal: round(sum.activeKcal / dayTotals.length),
    netKcal: round(sum.netKcal / dayTotals.length),
    daysCount: dayTotals.length,
  };
}

export function calculateWeeklyAverageWeight(weightLogs: WeightLog[]): number {
  if (weightLogs.length === 0) {
    return 0;
  }

  const totalWeight = weightLogs.reduce((acc, log) => acc + log.weightKg, 0);
  return round(totalWeight / weightLogs.length);
}
