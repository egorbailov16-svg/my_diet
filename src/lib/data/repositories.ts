import { deleteById, getAll, getById, putMany, putOne } from "@/lib/data/db";
import { mergeFoodsByUpdatedAt, pullFoodsFromCloud, pushFoodsToCloud } from "@/lib/data/food-cloud-sync";
import type {
  DayLog,
  DayTarget,
  Food,
  MealEntry,
  Profile,
  PeriodAnalysis,
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
  list: async () => {
    const localFoods = await getAll("foods");
    const remoteFoods = await pullFoodsFromCloud();

    if (remoteFoods === null) {
      return localFoods;
    }

    if (remoteFoods.length === 0 && localFoods.length > 0) {
      void pushFoodsToCloud(localFoods);
      return localFoods;
    }

    const mergedFoods = mergeFoodsByUpdatedAt(localFoods, remoteFoods);
    await putMany("foods", mergedFoods);

    const mergedIds = new Set(mergedFoods.map((item) => item.id));
    const staleLocalIds = localFoods.filter((item) => !mergedIds.has(item.id)).map((item) => item.id);
    await Promise.all(staleLocalIds.map((id) => deleteById("foods", id)));

    void pushFoodsToCloud(mergedFoods);
    return mergedFoods;
  },
  getById: (id: string) => getById("foods", id),
  upsert: async (food: Food) => {
    await putOne("foods", food);
    const allFoods = await getAll("foods");
    void pushFoodsToCloud(allFoods);
  },
  upsertMany: async (foods: Food[]) => {
    await putMany("foods", foods);
    const allFoods = await getAll("foods");
    void pushFoodsToCloud(allFoods);
  },
  remove: async (id: string) => {
    await deleteById("foods", id);
    const allFoods = await getAll("foods");
    void pushFoodsToCloud(allFoods);
  },
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

export const periodAnalysisRepo = {
  list: () => getAll("periodAnalyses"),
  getById: (id: string) => getById("periodAnalyses", id),
  upsert: (entry: PeriodAnalysis) => putOne("periodAnalyses", entry),
};
