import {
  calculateDayTotals,
  calculateFoodNutrientsForWeight,
  calculateRecipePer100g,
  calculateRecipePortionNutrients,
  calculateRemainingToDayTarget,
  calculateWeeklyAverageWeight,
  calculateWeeklyAverages,
} from "@/lib/data/calculations";
import { seedDayTargets, seedFoods, seedRecipeIngredients, seedRecipes } from "@/lib/data/seed";
import type { DayLog, MealEntry, RecipeIngredient, WeightLog } from "@/lib/data/types";

export function runCalculationExamples() {
  const foodsById = new Map(seedFoods.map((food) => [food.id, food]));
  const recipesById = new Map(seedRecipes.map((recipe) => [recipe.id, recipe]));
  const recipeIngredientsByRecipeId = new Map<string, RecipeIngredient[]>();
  recipeIngredientsByRecipeId.set("recipe_chicken_rice_bowl", seedRecipeIngredients);

  const foodFor250g = calculateFoodNutrientsForWeight(seedFoods[0].nutrientsPer100g, 250);
  const recipePer100g = calculateRecipePer100g(seedRecipes[0], seedRecipeIngredients, foodsById);
  const recipePortion180g = calculateRecipePortionNutrients(seedRecipes[0], seedRecipeIngredients, foodsById, 180);

  const dayLog: DayLog = {
    id: "2026-04-21",
    date: "2026-04-21",
    dayType: "normal",
    activeKcal: 450,
    createdAt: "2026-04-21T08:00:00.000Z",
    updatedAt: "2026-04-21T08:00:00.000Z",
  };

  const mealEntries: MealEntry[] = [
    {
      id: "meal_1",
      dayLogId: dayLog.id,
      mealType: "lunch",
      sourceType: "recipe",
      sourceId: "recipe_chicken_rice_bowl",
      amountG: 180,
      consumedAt: "2026-04-21T12:00:00.000Z",
      createdAt: "2026-04-21T12:00:00.000Z",
      updatedAt: "2026-04-21T12:00:00.000Z",
    },
    {
      id: "meal_2",
      dayLogId: dayLog.id,
      mealType: "dinner",
      sourceType: "food",
      sourceId: "food_cottage_cheese_5",
      amountG: 200,
      consumedAt: "2026-04-21T19:00:00.000Z",
      createdAt: "2026-04-21T19:00:00.000Z",
      updatedAt: "2026-04-21T19:00:00.000Z",
    },
  ];

  const dayTotals = calculateDayTotals({
    dayLog,
    mealEntries,
    foodsById,
    recipesById,
    recipeIngredientsByRecipeId,
  });

  const dayRemaining = calculateRemainingToDayTarget(dayTotals.consumed, seedDayTargets[0]);

  const weeklyAverages = calculateWeeklyAverages([
    dayTotals,
    { ...dayTotals, consumed: { kcal: 1500, protein: 180, fat: 50, carbs: 60 }, netKcal: 1000, activeKcal: 500 },
  ]);

  const weightLogs: WeightLog[] = [
    {
      id: "w1",
      date: "2026-04-20",
      weightKg: 82.5,
      createdAt: "2026-04-20T08:00:00.000Z",
      updatedAt: "2026-04-20T08:00:00.000Z",
    },
    {
      id: "w2",
      date: "2026-04-21",
      weightKg: 82.2,
      createdAt: "2026-04-21T08:00:00.000Z",
      updatedAt: "2026-04-21T08:00:00.000Z",
    },
  ];

  const weeklyAverageWeight = calculateWeeklyAverageWeight(weightLogs);

  return {
    foodFor250g,
    recipePer100g,
    recipePortion180g,
    dayTotals,
    dayRemaining,
    weeklyAverages,
    weeklyAverageWeight,
  };
}
