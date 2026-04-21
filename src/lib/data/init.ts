import { dayTargetRepo, foodRepo, profileRepo, recipeIngredientRepo, recipeRepo } from "@/lib/data/repositories";
import { seedDayTargets, seedFoods, seedProfile, seedRecipeIngredients, seedRecipes } from "@/lib/data/seed";

let initialized = false;

export async function initializeSeedData(): Promise<void> {
  if (initialized) {
    return;
  }

  const existingProfile = await profileRepo.get();

  if (existingProfile) {
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
