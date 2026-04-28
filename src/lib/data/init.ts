import { dayTargetRepo, foodRepo, profileRepo, recipeIngredientRepo, recipeRepo } from "@/lib/data/repositories";
import { seedDayTargets, seedFoods, seedProfile, seedRecipeIngredients, seedRecipes } from "@/lib/data/seed";

let initialized = false;

export async function initializeSeedData(): Promise<void> {
  if (initialized) {
    return;
  }

  const existingProfile = await profileRepo.get();
  const [existingFoods, existingRecipes] = await Promise.all([foodRepo.list(), recipeRepo.list()]);

  if (existingProfile) {
    const missingFoods = seedFoods.filter((food) => !existingFoods.some((current) => current.id === food.id));
    if (missingFoods.length > 0) {
      await foodRepo.upsertMany(missingFoods);
    }
    const missingRecipes = seedRecipes.filter((recipe) => !existingRecipes.some((current) => current.id === recipe.id));
    if (missingRecipes.length > 0) {
      await recipeRepo.upsertMany(missingRecipes);
      const newRecipeIds = new Set(missingRecipes.map((recipe) => recipe.id));
      const missingIngredients = seedRecipeIngredients.filter((ingredient) => newRecipeIds.has(ingredient.recipeId));
      if (missingIngredients.length > 0) {
        await recipeIngredientRepo.upsertMany(missingIngredients);
      }
    }
    initialized = true;
    return;
  }

  await profileRepo.upsert(seedProfile);
  await dayTargetRepo.upsertMany(seedDayTargets);
  await foodRepo.upsertMany(seedFoods);
  await recipeRepo.upsertMany(seedRecipes);
  await recipeIngredientRepo.upsertMany(seedRecipeIngredients);

  initialized = true;
}
