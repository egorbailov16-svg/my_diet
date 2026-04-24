import { deleteById, getAll, getById, putMany, putOne } from "@/lib/data/db";
import { ensureFreshSync, markDeletedInSync, scheduleCloudPush } from "@/lib/data/cloud-sync";
import type {
  ClosedDayArchive,
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

async function withFreshSync<T>(fn: () => Promise<T>): Promise<T> {
  try {
    await ensureFreshSync();
  } catch (error) {
    console.error("Sync before read failed", error);
  }
  return fn();
}

export const profileRepo = {
  get: () => withFreshSync(() => getById("profile", "profile")),
  upsert: async (profile: Profile) => {
    await putOne("profile", profile);
    scheduleCloudPush();
  },
};

export const dayTargetRepo = {
  list: () => withFreshSync(() => getAll("dayTargets")),
  upsertMany: async (targets: DayTarget[]) => {
    await putMany("dayTargets", targets);
    scheduleCloudPush();
  },
};

export const dayLogRepo = {
  list: () => withFreshSync(() => getAll("dayLogs")),
  getByDate: (date: string) => withFreshSync(() => getById("dayLogs", date)),
  upsert: async (dayLog: DayLog) => {
    await putOne("dayLogs", dayLog);
    scheduleCloudPush();
  },
};

export const foodRepo = {
  list: () => withFreshSync(() => getAll("foods")),
  getById: (id: string) => withFreshSync(() => getById("foods", id)),
  upsert: async (food: Food) => {
    await putOne("foods", food);
    scheduleCloudPush();
  },
  upsertMany: async (foods: Food[]) => {
    await putMany("foods", foods);
    scheduleCloudPush();
  },
  remove: async (id: string) => {
    await deleteById("foods", id);
    markDeletedInSync("foods", id);
    scheduleCloudPush();
  },
};

export const recipeRepo = {
  list: () => withFreshSync(() => getAll("recipes")),
  getById: (id: string) => withFreshSync(() => getById("recipes", id)),
  upsert: async (recipe: Recipe) => {
    await putOne("recipes", recipe);
    scheduleCloudPush();
  },
  upsertMany: async (recipes: Recipe[]) => {
    await putMany("recipes", recipes);
    scheduleCloudPush();
  },
  remove: async (id: string) => {
    await deleteById("recipes", id);
    markDeletedInSync("recipes", id);
    scheduleCloudPush();
  },
};

export const recipeIngredientRepo = {
  list: () => withFreshSync(() => getAll("recipeIngredients")),
  listByRecipeId: async (recipeId: string) => {
    await ensureFreshSync();
    return (await getAll("recipeIngredients")).filter((ingredient) => ingredient.recipeId === recipeId);
  },
  upsertMany: async (items: RecipeIngredient[]) => {
    await putMany("recipeIngredients", items);
    scheduleCloudPush();
  },
  removeByRecipeId: async (recipeId: string) => {
    const items = await getAll("recipeIngredients");
    const toDelete = items.filter((ingredient) => ingredient.recipeId === recipeId);
    await Promise.all(
      toDelete.map((ingredient) =>
        deleteById("recipeIngredients", ingredient.id).then(() => markDeletedInSync("recipeIngredients", ingredient.id)),
      ),
    );
    scheduleCloudPush();
  },
};

export const mealEntryRepo = {
  list: () => withFreshSync(() => getAll("mealEntries")),
  listByDayLogId: async (dayLogId: string) => {
    await ensureFreshSync();
    return (await getAll("mealEntries")).filter((entry) => entry.dayLogId === dayLogId);
  },
  upsert: async (entry: MealEntry) => {
    await putOne("mealEntries", entry);
    scheduleCloudPush();
  },
  remove: async (id: string) => {
    await deleteById("mealEntries", id);
    markDeletedInSync("mealEntries", id);
    scheduleCloudPush();
  },
};

export const weightLogRepo = {
  list: () => withFreshSync(() => getAll("weightLogs")),
  getByDate: async (date: string) => {
    await ensureFreshSync();
    return (await getAll("weightLogs")).find((entry) => entry.date === date);
  },
  upsert: async (entry: WeightLog) => {
    await putOne("weightLogs", entry);
    scheduleCloudPush();
  },
  remove: async (id: string) => {
    await deleteById("weightLogs", id);
    markDeletedInSync("weightLogs", id);
    scheduleCloudPush();
  },
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

export const closedDayArchiveRepo = {
  list: () => getAll("closedDayArchives"),
  getById: (id: string) => getById("closedDayArchives", id),
  upsert: (entry: ClosedDayArchive) => putOne("closedDayArchives", entry),
  remove: (id: string) => deleteById("closedDayArchives", id),
};
