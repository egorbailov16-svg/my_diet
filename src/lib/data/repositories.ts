import { deleteById, getAll, getById, putMany, putOne } from "@/lib/data/db";
import type {
  DayLog,
  DayTarget,
  Food,
  MealEntry,
  Profile,
  RecentItem,
  Recipe,
  RecipeIngredient,
  WeightLog,
} from "@/lib/data/types";

export const profileRepo = {
  get: () => getById("profile", "profile"),
  upsert: (profile: Profile) => putOne("profile", profile),
};

export const dayTargetRepo = {
  list: () => getAll("dayTargets"),
  upsertMany: (targets: DayTarget[]) => putMany("dayTargets", targets),
};

export const dayLogRepo = {
  list: () => getAll("dayLogs"),
  getByDate: (date: string) => getById("dayLogs", date),
  upsert: (dayLog: DayLog) => putOne("dayLogs", dayLog),
};

export const foodRepo = {
  list: () => getAll("foods"),
  getById: (id: string) => getById("foods", id),
  upsert: (food: Food) => putOne("foods", food),
  upsertMany: (foods: Food[]) => putMany("foods", foods),
  remove: (id: string) => deleteById("foods", id),
};

export const recipeRepo = {
  list: () => getAll("recipes"),
  getById: (id: string) => getById("recipes", id),
  upsert: (recipe: Recipe) => putOne("recipes", recipe),
  upsertMany: (recipes: Recipe[]) => putMany("recipes", recipes),
  remove: (id: string) => deleteById("recipes", id),
};

export const recipeIngredientRepo = {
  list: () => getAll("recipeIngredients"),
  listByRecipeId: async (recipeId: string) =>
    (await getAll("recipeIngredients")).filter((ingredient) => ingredient.recipeId === recipeId),
  upsertMany: (items: RecipeIngredient[]) => putMany("recipeIngredients", items),
  removeByRecipeId: async (recipeId: string) => {
    const items = await getAll("recipeIngredients");
    const toDelete = items.filter((ingredient) => ingredient.recipeId === recipeId);
    await Promise.all(toDelete.map((ingredient) => deleteById("recipeIngredients", ingredient.id)));
  },
};

export const mealEntryRepo = {
  list: () => getAll("mealEntries"),
  listByDayLogId: async (dayLogId: string) => (await getAll("mealEntries")).filter((entry) => entry.dayLogId === dayLogId),
  upsert: (entry: MealEntry) => putOne("mealEntries", entry),
  remove: (id: string) => deleteById("mealEntries", id),
};

export const weightLogRepo = {
  list: () => getAll("weightLogs"),
  getByDate: async (date: string) => (await getAll("weightLogs")).find((entry) => entry.date === date),
  upsert: (entry: WeightLog) => putOne("weightLogs", entry),
  remove: (id: string) => deleteById("weightLogs", id),
};

export const recentItemRepo = {
  list: () => getAll("recentItems"),
  upsert: (entry: RecentItem) => putOne("recentItems", entry),
};
