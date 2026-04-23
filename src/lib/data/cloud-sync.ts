import { deleteById, getAll, openAppDB, putMany, putOne } from "@/lib/data/db";
import type {
  DayLog,
  DayTarget,
  Food,
  MealEntry,
  Profile,
  Recipe,
  RecipeIngredient,
  WeightLog,
} from "@/lib/data/types";

const SYNC_ENDPOINT = "/api/sync";
const SYNC_COOLDOWN_MS = 2500;
const PUSH_DEBOUNCE_MS = 500;

type CloudDoc = {
  syncedAt: string;
  foods: Food[];
  recipes: Recipe[];
  recipeIngredients: RecipeIngredient[];
  mealEntries: MealEntry[];
  dayLogs: DayLog[];
  dayTargets: DayTarget[];
  weightLogs: WeightLog[];
  profile: Profile | null;
};

type IdRecord = { id: string; updatedAt: string };

const EMPTY_DOC: CloudDoc = {
  syncedAt: "1970-01-01T00:00:00.000Z",
  foods: [],
  recipes: [],
  recipeIngredients: [],
  mealEntries: [],
  dayLogs: [],
  dayTargets: [],
  weightLogs: [],
  profile: null,
};

function isBrowser() {
  return typeof window !== "undefined";
}

function parseTs(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function pullCloudDoc(): Promise<CloudDoc | null> {
  if (!isBrowser()) return null;
  try {
    const response = await fetch(SYNC_ENDPOINT, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const json = (await response.json()) as Partial<CloudDoc>;
    return normalizeDoc(json);
  } catch (error) {
    console.error("Cloud pull failed", error);
    return null;
  }
}

async function pushCloudDoc(doc: CloudDoc): Promise<boolean> {
  if (!isBrowser()) return false;
  try {
    const response = await fetch(SYNC_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    return response.ok;
  } catch (error) {
    console.error("Cloud push failed", error);
    return false;
  }
}

function normalizeDoc(raw: Partial<CloudDoc> | null): CloudDoc {
  if (!raw || typeof raw !== "object") return { ...EMPTY_DOC };
  return {
    syncedAt: typeof raw.syncedAt === "string" ? raw.syncedAt : EMPTY_DOC.syncedAt,
    foods: Array.isArray(raw.foods) ? (raw.foods as Food[]) : [],
    recipes: Array.isArray(raw.recipes) ? (raw.recipes as Recipe[]) : [],
    recipeIngredients: Array.isArray(raw.recipeIngredients)
      ? (raw.recipeIngredients as RecipeIngredient[])
      : [],
    mealEntries: Array.isArray(raw.mealEntries) ? (raw.mealEntries as MealEntry[]) : [],
    dayLogs: Array.isArray(raw.dayLogs) ? (raw.dayLogs as DayLog[]) : [],
    dayTargets: Array.isArray(raw.dayTargets) ? (raw.dayTargets as DayTarget[]) : [],
    weightLogs: Array.isArray(raw.weightLogs) ? (raw.weightLogs as WeightLog[]) : [],
    profile: raw.profile && typeof raw.profile === "object" ? (raw.profile as Profile) : null,
  };
}

const CLOCK_SKEW_MS = 5 * 60 * 1000;

function mergeById<T extends IdRecord>(local: T[], remote: T[], remoteSyncedAtMs: number): T[] {
  const byId = new Map<string, T>();
  for (const item of remote) {
    byId.set(item.id, item);
  }
  const deletionThreshold = remoteSyncedAtMs - CLOCK_SKEW_MS;
  for (const item of local) {
    const remoteItem = byId.get(item.id);
    if (!remoteItem) {
      // only local — keep it if local change happened recently enough to still be un-pushed
      if (parseTs(item.updatedAt) > deletionThreshold) {
        byId.set(item.id, item);
      }
      // otherwise: remote was updated long after local item was touched -> assume deleted elsewhere
      continue;
    }
    const localTs = parseTs(item.updatedAt);
    const remoteTs = parseTs(remoteItem.updatedAt);
    if (localTs > remoteTs) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

function mergeProfile(local: Profile | undefined, remote: Profile | null): Profile | null {
  if (!local && !remote) return null;
  if (!local) return remote;
  if (!remote) return local;
  return parseTs(local.updatedAt) >= parseTs(remote.updatedAt) ? local : remote;
}

async function replaceStoreContents<T extends IdRecord>(
  storeName: "foods" | "recipes" | "recipeIngredients" | "mealEntries" | "dayLogs" | "weightLogs",
  localItems: T[],
  mergedItems: T[],
): Promise<void> {
  const mergedIds = new Set(mergedItems.map((item) => item.id));
  const toDelete = localItems.filter((item) => !mergedIds.has(item.id));
  await Promise.all(toDelete.map((item) => deleteById(storeName, item.id)));
  if (mergedItems.length > 0) {
    // @ts-expect-error — runtime store keys align with union typing
    await putMany(storeName, mergedItems);
  }
}

async function replaceDayTargets(
  local: DayTarget[],
  merged: DayTarget[],
): Promise<void> {
  const mergedIds = new Set(merged.map((item) => item.id));
  const toDelete = local.filter((item) => !mergedIds.has(item.id));
  await Promise.all(toDelete.map((item) => deleteById("dayTargets", item.id)));
  if (merged.length > 0) {
    await putMany("dayTargets", merged);
  }
}

async function replaceProfile(current: Profile | undefined, merged: Profile | null): Promise<void> {
  if (!merged) {
    if (current) {
      await deleteById("profile", current.id);
    }
    return;
  }
  await putOne("profile", merged);
}

let activeSync: Promise<CloudDoc | null> | null = null;
let lastSyncAt = 0;

async function runFullSync(): Promise<CloudDoc | null> {
  try {
    await openAppDB();
  } catch (error) {
    console.error("IDB unavailable for sync", error);
    return null;
  }

  const remote = await pullCloudDoc();
  const remoteDoc = remote ?? { ...EMPTY_DOC };
  const remoteSyncedAtMs = parseTs(remoteDoc.syncedAt);

  const [
    localFoods,
    localRecipes,
    localRecipeIngredients,
    localMealEntries,
    localDayLogs,
    localDayTargets,
    localWeightLogs,
    localProfileArr,
  ] = await Promise.all([
    getAll("foods"),
    getAll("recipes"),
    getAll("recipeIngredients"),
    getAll("mealEntries"),
    getAll("dayLogs"),
    getAll("dayTargets"),
    getAll("weightLogs"),
    getAll("profile"),
  ]);
  const localProfile = localProfileArr[0];

  const mergedFoods = mergeById(localFoods, remoteDoc.foods, remoteSyncedAtMs);
  const mergedRecipes = mergeById(localRecipes, remoteDoc.recipes, remoteSyncedAtMs);
  const mergedRecipeIngredients = mergeById(
    localRecipeIngredients,
    remoteDoc.recipeIngredients,
    remoteSyncedAtMs,
  );
  const mergedMealEntries = mergeById(localMealEntries, remoteDoc.mealEntries, remoteSyncedAtMs);
  const mergedDayLogs = mergeById(localDayLogs, remoteDoc.dayLogs, remoteSyncedAtMs);
  const mergedDayTargets = mergeById(localDayTargets, remoteDoc.dayTargets, remoteSyncedAtMs);
  const mergedWeightLogs = mergeById(localWeightLogs, remoteDoc.weightLogs, remoteSyncedAtMs);
  const mergedProfile = mergeProfile(localProfile, remoteDoc.profile);

  await Promise.all([
    replaceStoreContents("foods", localFoods, mergedFoods),
    replaceStoreContents("recipes", localRecipes, mergedRecipes),
    replaceStoreContents("recipeIngredients", localRecipeIngredients, mergedRecipeIngredients),
    replaceStoreContents("mealEntries", localMealEntries, mergedMealEntries),
    replaceStoreContents("dayLogs", localDayLogs, mergedDayLogs),
    replaceStoreContents("weightLogs", localWeightLogs, mergedWeightLogs),
    replaceDayTargets(localDayTargets, mergedDayTargets),
    replaceProfile(localProfile, mergedProfile),
  ]);

  const now = new Date().toISOString();
  const outDoc: CloudDoc = {
    syncedAt: now,
    foods: mergedFoods,
    recipes: mergedRecipes,
    recipeIngredients: mergedRecipeIngredients,
    mealEntries: mergedMealEntries,
    dayLogs: mergedDayLogs,
    dayTargets: mergedDayTargets,
    weightLogs: mergedWeightLogs,
    profile: mergedProfile,
  };

  void pushCloudDoc(outDoc);
  return outDoc;
}

export async function ensureFreshSync(): Promise<void> {
  if (!isBrowser()) return;
  if (activeSync) {
    await activeSync.catch(() => null);
    return;
  }
  if (Date.now() - lastSyncAt < SYNC_COOLDOWN_MS) return;
  activeSync = runFullSync().finally(() => {
    lastSyncAt = Date.now();
    activeSync = null;
  });
  await activeSync.catch(() => null);
}

export async function forceSync(): Promise<void> {
  if (!isBrowser()) return;
  if (activeSync) {
    await activeSync.catch(() => null);
    return;
  }
  activeSync = runFullSync().finally(() => {
    lastSyncAt = Date.now();
    activeSync = null;
  });
  await activeSync.catch(() => null);
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleCloudPush(): void {
  if (!isBrowser()) return;
  if (pushTimer) {
    clearTimeout(pushTimer);
  }
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void forceSync();
  }, PUSH_DEBOUNCE_MS);
}

export async function pushNow(): Promise<void> {
  if (!isBrowser()) return;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  await forceSync();
}
