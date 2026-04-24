import { addNutrients, calculateRecipeNutrition, emptyNutrients, nutrientsForWeight } from "@/lib/data/nutrition";
import { resolveFoodNutrientDetails, type NutrientMap } from "@/lib/data/nutrient-note-parser";
import type {
  ClosedDayArchive,
  DayLog,
  DayTarget,
  Food,
  MealEntry,
  NutrientsTotal,
  Recipe,
  RecipeIngredient,
} from "@/lib/data/types";

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function scaleNutrientMap(per100g: NutrientMap | undefined, weightG: number): NutrientMap {
  if (!per100g) return {};
  const factor = weightG / 100;
  const out: NutrientMap = {};
  for (const [name, value] of Object.entries(per100g)) {
    out[name] = round(value * factor);
  }
  return out;
}

function addMaps(a: NutrientMap, b: NutrientMap): NutrientMap {
  const out: NutrientMap = { ...a };
  for (const [name, value] of Object.entries(b)) {
    out[name] = round((out[name] ?? 0) + value);
  }
  return out;
}

export type DaySnapshotInput = {
  dayLog: DayLog;
  mealEntries: MealEntry[];
  foodsById: Map<string, Food>;
  recipesById: Map<string, Recipe>;
  ingredientsByRecipeId: Map<string, RecipeIngredient[]>;
  target?: DayTarget | null;
  weightKg?: number;
};

export type DaySnapshotResult = {
  consumed: NutrientsTotal;
  netKcal: number;
  activeKcal: number;
  micronutrientsTotal: NutrientMap;
  vitaminsTotal: NutrientMap;
  micronutrientCoverage: number;
  entriesSnapshot: ClosedDayArchive["entriesSnapshot"];
};

export function buildDaySnapshot(input: DaySnapshotInput): DaySnapshotResult {
  const consumed = input.mealEntries.reduce<NutrientsTotal>((acc, entry) => {
    if (entry.sourceType === "food") {
      const food = input.foodsById.get(entry.sourceId);
      if (!food) return acc;
      return addNutrients(acc, nutrientsForWeight(food.nutrientsPer100g, entry.amountG));
    }
    const recipe = input.recipesById.get(entry.sourceId);
    if (!recipe) return acc;
    const ingredients = input.ingredientsByRecipeId.get(recipe.id) ?? [];
    const recipeData = calculateRecipeNutrition(recipe, ingredients, input.foodsById);
    return addNutrients(acc, nutrientsForWeight(recipeData.per100g, entry.amountG));
  }, emptyNutrients());

  let microTotals: NutrientMap = {};
  let vitaminTotals: NutrientMap = {};
  let entriesWithMicro = 0;
  const entriesSnapshot: ClosedDayArchive["entriesSnapshot"] = [];

  for (const entry of input.mealEntries) {
    if (entry.sourceType === "food") {
      const food = input.foodsById.get(entry.sourceId);
      if (!food) continue;
      const details = resolveFoodNutrientDetails(food);
      const microScaled = scaleNutrientMap(details.micronutrientsPer100g, entry.amountG);
      const vitaminScaled = scaleNutrientMap(details.vitaminsPer100g, entry.amountG);
      microTotals = addMaps(microTotals, microScaled);
      vitaminTotals = addMaps(vitaminTotals, vitaminScaled);
      if (Object.keys(microScaled).length > 0 || Object.keys(vitaminScaled).length > 0) {
        entriesWithMicro += 1;
      }
      entriesSnapshot.push({
        id: entry.id,
        title: food.name,
        mealType: entry.mealType,
        sourceType: "food",
        amountG: entry.amountG,
        nutrients: nutrientsForWeight(food.nutrientsPer100g, entry.amountG),
      });
    } else {
      const recipe = input.recipesById.get(entry.sourceId);
      if (!recipe) continue;
      const ingredients = input.ingredientsByRecipeId.get(recipe.id) ?? [];
      const totalIngredientWeight = ingredients.reduce((acc, item) => acc + item.weightG, 0);
      const baseWeight = recipe.cookedWeightG && recipe.cookedWeightG > 0 ? recipe.cookedWeightG : totalIngredientWeight;
      const safeBase = baseWeight > 0 ? baseWeight : 100;
      const portionFactor = entry.amountG / safeBase;

      let recipeMicro: NutrientMap = {};
      let recipeVitamins: NutrientMap = {};
      let hasAnyMicro = false;
      for (const ingredient of ingredients) {
        const ingFood = input.foodsById.get(ingredient.foodId);
        if (!ingFood) continue;
        const details = resolveFoodNutrientDetails(ingFood);
        const microScaled = scaleNutrientMap(details.micronutrientsPer100g, ingredient.weightG);
        const vitaminScaled = scaleNutrientMap(details.vitaminsPer100g, ingredient.weightG);
        recipeMicro = addMaps(recipeMicro, microScaled);
        recipeVitamins = addMaps(recipeVitamins, vitaminScaled);
        if (Object.keys(microScaled).length > 0 || Object.keys(vitaminScaled).length > 0) {
          hasAnyMicro = true;
        }
      }
      const portionMicro: NutrientMap = {};
      const portionVitamins: NutrientMap = {};
      for (const [k, v] of Object.entries(recipeMicro)) portionMicro[k] = round(v * portionFactor);
      for (const [k, v] of Object.entries(recipeVitamins)) portionVitamins[k] = round(v * portionFactor);
      microTotals = addMaps(microTotals, portionMicro);
      vitaminTotals = addMaps(vitaminTotals, portionVitamins);
      if (hasAnyMicro) entriesWithMicro += 1;

      const recipeData = calculateRecipeNutrition(recipe, ingredients, input.foodsById);
      entriesSnapshot.push({
        id: entry.id,
        title: recipe.name,
        mealType: entry.mealType,
        sourceType: "recipe",
        amountG: entry.amountG,
        nutrients: nutrientsForWeight(recipeData.per100g, entry.amountG),
      });
    }
  }

  const micronutrientCoverage = input.mealEntries.length > 0 ? round((entriesWithMicro / input.mealEntries.length) * 100) : 0;
  const netKcal = round(consumed.kcal - input.dayLog.activeKcal);

  return {
    consumed,
    netKcal,
    activeKcal: round(input.dayLog.activeKcal),
    micronutrientsTotal: microTotals,
    vitaminsTotal: vitaminTotals,
    micronutrientCoverage,
    entriesSnapshot,
  };
}
