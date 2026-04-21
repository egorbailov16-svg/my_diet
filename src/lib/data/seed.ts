import type { DayTarget, Food, Profile, Recipe, RecipeIngredient } from "@/lib/data/types";

function now(): string {
  return new Date().toISOString();
}

const createdAt = now();

export const seedProfile: Profile = {
  id: "profile",
  name: "User",
  heightCm: 180,
  currentWeightKg: 82,
  goalWeightKg: 78,
  createdAt,
  updatedAt: createdAt,
};

export const seedDayTargets: DayTarget[] = [
  {
    id: "normal",
    dayType: "normal",
    kcalMin: 1400,
    kcalMax: 1500,
    proteinTarget: 190,
    fatMin: 50,
    fatMax: 55,
    carbsMin: 55,
    carbsMax: 65,
    updatedAt: createdAt,
  },
  {
    id: "strength",
    dayType: "strength",
    kcalMin: 1800,
    kcalMax: 1900,
    proteinTarget: 200,
    fatMin: 55,
    fatMax: 60,
    carbsMin: 130,
    carbsMax: 150,
    updatedAt: createdAt,
  },
];

export const seedFoods: Food[] = [
  {
    id: "food_chicken_breast",
    name: "Chicken breast",
    source: "custom",
    nutrientsPer100g: { kcal: 165, protein: 31, fat: 3.6, carbs: 0 },
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: "food_rice_boiled",
    name: "Rice boiled",
    source: "custom",
    nutrientsPer100g: { kcal: 130, protein: 2.4, fat: 0.3, carbs: 28 },
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: "food_olive_oil",
    name: "Olive oil",
    source: "custom",
    nutrientsPer100g: { kcal: 884, protein: 0, fat: 100, carbs: 0 },
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: "food_cottage_cheese_5",
    name: "Cottage cheese 5%",
    source: "custom",
    nutrientsPer100g: { kcal: 121, protein: 17, fat: 5, carbs: 3 },
    createdAt,
    updatedAt: createdAt,
  },
];

export const seedRecipes: Recipe[] = [
  {
    id: "recipe_chicken_rice_bowl",
    name: "Chicken Rice Bowl",
    cookedWeightG: 470,
    createdAt,
    updatedAt: createdAt,
  },
];

export const seedRecipeIngredients: RecipeIngredient[] = [
  {
    id: "ri_1",
    recipeId: "recipe_chicken_rice_bowl",
    foodId: "food_chicken_breast",
    weightG: 250,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: "ri_2",
    recipeId: "recipe_chicken_rice_bowl",
    foodId: "food_rice_boiled",
    weightG: 200,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: "ri_3",
    recipeId: "recipe_chicken_rice_bowl",
    foodId: "food_olive_oil",
    weightG: 20,
    createdAt,
    updatedAt: createdAt,
  },
];
