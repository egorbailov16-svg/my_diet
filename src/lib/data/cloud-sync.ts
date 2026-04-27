import { deleteById, getAll, openAppDB, putMany, putOne } from "@/lib/data/db";
import type {
  ClosedDayArchive,
  DayLog,
  DayTarget,
  Food,
  MealEntry,
  Profile,
  Recipe,
  RecipeIngredient,
  WeightLog,
} from "@/lib/data/types";
import { getActiveAccountId } from "@/lib/account/local-account";

const SYNC_ENDPOINT = "/api/sync";
const SYNC_COOLDOWN_MS = 2500;
const PUSH_DEBOUNCE_MS = 500;

type CloudDoc = {
  syncedAt: string;
  shared: {
    foods: Food[];
    recipes: Recipe[];
    recipeIngredients: RecipeIngredient[];
    deleted?: Partial<Record<SharedStoreName, Record<string, string>>>;
  };
  users: Record<
    string,
    {
      mealEntries: MealEntry[];
      dayLogs: DayLog[];
      dayTargets: DayTarget[];
      weightLogs: WeightLog[];
      profile: Profile | null;
      closedDayArchives: ClosedDayArchive[];
      deleted?: Partial<Record<UserStoreName, Record<string, string>>>;
    }
  >;
  // legacy fields kept for migration from older docs
  foods?: Food[];
  recipes?: Recipe[];
  recipeIngredients?: RecipeIngredient[];
  mealEntries?: MealEntry[];
  dayLogs?: DayLog[];
  dayTargets?: DayTarget[];
  weightLogs?: WeightLog[];
  profile?: Profile | null;
  deleted?: Partial<Record<SyncStoreName, Record<string, string>>>;
};

type IdRecord = { id: string; updatedAt: string };
type SharedStoreName = "foods" | "recipes" | "recipeIngredients";
type UserStoreName =
  | "mealEntries"
  | "dayLogs"
  | "dayTargets"
  | "weightLogs"
  | "closedDayArchives";
type SyncStoreName = SharedStoreName | UserStoreName;
type DeletedMap = Partial<Record<SyncStoreName, Record<string, string>>>;
const LOCAL_DELETED_KEY = "my-diet-sync-deleted-v1";
const DELETED_TTL_MS = 45 * 24 * 60 * 60 * 1000;

const EMPTY_DOC: CloudDoc = {
  syncedAt: "1970-01-01T00:00:00.000Z",
  shared: {
    foods: [],
    recipes: [],
    recipeIngredients: [],
    deleted: {},
  },
  users: {},
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
  const hasModernShape = raw.shared && typeof raw.shared === "object";
  if (!hasModernShape) {
    const legacyDeleted = raw.deleted && typeof raw.deleted === "object" ? (raw.deleted as DeletedMap) : {};
    const legacyUser = "admin";
    return {
      syncedAt: typeof raw.syncedAt === "string" ? raw.syncedAt : EMPTY_DOC.syncedAt,
      shared: {
        foods: Array.isArray(raw.foods) ? (raw.foods as Food[]) : [],
        recipes: Array.isArray(raw.recipes) ? (raw.recipes as Recipe[]) : [],
        recipeIngredients: Array.isArray(raw.recipeIngredients) ? (raw.recipeIngredients as RecipeIngredient[]) : [],
        deleted: {
          foods: legacyDeleted.foods,
          recipes: legacyDeleted.recipes,
          recipeIngredients: legacyDeleted.recipeIngredients,
        },
      },
      users: {
        [legacyUser]: {
          mealEntries: Array.isArray(raw.mealEntries) ? (raw.mealEntries as MealEntry[]) : [],
          dayLogs: Array.isArray(raw.dayLogs) ? (raw.dayLogs as DayLog[]) : [],
          dayTargets: Array.isArray(raw.dayTargets) ? (raw.dayTargets as DayTarget[]) : [],
          weightLogs: Array.isArray(raw.weightLogs) ? (raw.weightLogs as WeightLog[]) : [],
          profile: raw.profile && typeof raw.profile === "object" ? (raw.profile as Profile) : null,
          closedDayArchives: [],
          deleted: {
            mealEntries: legacyDeleted.mealEntries,
            dayLogs: legacyDeleted.dayLogs,
            dayTargets: legacyDeleted.dayTargets,
            weightLogs: legacyDeleted.weightLogs,
          },
        },
      },
    };
  }

  const normalizedShared = raw.shared as CloudDoc["shared"];
  const rawUsers = raw.users && typeof raw.users === "object" ? (raw.users as CloudDoc["users"]) : {};
  const users: CloudDoc["users"] = {};
  for (const [userId, bucket] of Object.entries(rawUsers)) {
    if (!bucket || typeof bucket !== "object") continue;
    users[userId] = {
      mealEntries: Array.isArray(bucket.mealEntries) ? bucket.mealEntries : [],
      dayLogs: Array.isArray(bucket.dayLogs) ? bucket.dayLogs : [],
      dayTargets: Array.isArray(bucket.dayTargets) ? bucket.dayTargets : [],
      weightLogs: Array.isArray(bucket.weightLogs) ? bucket.weightLogs : [],
      profile: bucket.profile && typeof bucket.profile === "object" ? bucket.profile : null,
      closedDayArchives: Array.isArray(bucket.closedDayArchives) ? bucket.closedDayArchives : [],
      deleted: bucket.deleted && typeof bucket.deleted === "object" ? bucket.deleted : {},
    };
  }

  return {
    syncedAt: typeof raw.syncedAt === "string" ? raw.syncedAt : EMPTY_DOC.syncedAt,
    shared: {
      foods: Array.isArray(normalizedShared.foods) ? normalizedShared.foods : [],
      recipes: Array.isArray(normalizedShared.recipes) ? normalizedShared.recipes : [],
      recipeIngredients: Array.isArray(normalizedShared.recipeIngredients) ? normalizedShared.recipeIngredients : [],
      deleted: normalizedShared.deleted && typeof normalizedShared.deleted === "object" ? normalizedShared.deleted : {},
    },
    users,
  };
}

function readLocalDeletedMap(): DeletedMap {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_DELETED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DeletedMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalDeletedMap(value: DeletedMap): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LOCAL_DELETED_KEY, JSON.stringify(value));
  } catch {
    // ignore storage write errors
  }
}

function mergeDeletedMaps(a: DeletedMap, b: DeletedMap): DeletedMap {
  const out: DeletedMap = {};
  const stores = new Set<SyncStoreName>([
    ...(Object.keys(a) as SyncStoreName[]),
    ...(Object.keys(b) as SyncStoreName[]),
  ]);
  for (const store of stores) {
    const mapA = a[store] ?? {};
    const mapB = b[store] ?? {};
    const merged: Record<string, string> = { ...mapA };
    for (const [id, ts] of Object.entries(mapB)) {
      const prev = merged[id];
      if (!prev || parseTs(ts) > parseTs(prev)) {
        merged[id] = ts;
      }
    }
    if (Object.keys(merged).length > 0) {
      out[store] = merged;
    }
  }
  return out;
}

function pruneDeletedMap(deleted: DeletedMap): DeletedMap {
  const now = Date.now();
  const out: DeletedMap = {};
  for (const store of Object.keys(deleted) as SyncStoreName[]) {
    const src = deleted[store] ?? {};
    const dst: Record<string, string> = {};
    for (const [id, ts] of Object.entries(src)) {
      if (now - parseTs(ts) <= DELETED_TTL_MS) {
        dst[id] = ts;
      }
    }
    if (Object.keys(dst).length > 0) {
      out[store] = dst;
    }
  }
  return out;
}

function applyDeletedForStore<T extends IdRecord>(
  store: SyncStoreName,
  items: T[],
  deleted: DeletedMap,
): { items: T[]; deleted: DeletedMap } {
  const storeDeleted = deleted[store] ?? {};
  if (Object.keys(storeDeleted).length === 0) return { items, deleted };
  const nextDeleted = { ...deleted };
  const nextStoreDeleted: Record<string, string> = { ...storeDeleted };
  const filtered: T[] = [];
  for (const item of items) {
    const deletedAt = storeDeleted[item.id];
    if (!deletedAt) {
      filtered.push(item);
      continue;
    }
    if (parseTs(item.updatedAt) > parseTs(deletedAt)) {
      filtered.push(item);
      delete nextStoreDeleted[item.id];
      continue;
    }
  }
  if (Object.keys(nextStoreDeleted).length > 0) {
    nextDeleted[store] = nextStoreDeleted;
  } else {
    delete nextDeleted[store];
  }
  return { items: filtered, deleted: nextDeleted };
}

function mergeById<T extends IdRecord>(local: T[], remote: T[], _remoteSyncedAtMs: number): T[] {
  const byId = new Map<string, T>();
  for (const item of remote) {
    byId.set(item.id, item);
  }
  for (const item of local) {
    const remoteItem = byId.get(item.id);
    if (!remoteItem) {
      // Keep local-only records; explicit deletions are handled via tombstones.
      // This prevents accidental loss of products/recipes when cloud doc is stale/empty.
      byId.set(item.id, item);
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
  storeName:
    | "foods"
    | "recipes"
    | "recipeIngredients"
    | "mealEntries"
    | "dayLogs"
    | "weightLogs"
    | "closedDayArchives",
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
  const accountId = getActiveAccountId();
  const remoteSyncedAtMs = parseTs(remoteDoc.syncedAt);
  const localDeleted = readLocalDeletedMap();
  const remoteSharedDeleted: DeletedMap = {
    foods: remoteDoc.shared.deleted?.foods ?? {},
    recipes: remoteDoc.shared.deleted?.recipes ?? {},
    recipeIngredients: remoteDoc.shared.deleted?.recipeIngredients ?? {},
  };
  const remoteUserDeleted: DeletedMap = remoteDoc.users[accountId]?.deleted ?? {};
  let mergedSharedDeleted = pruneDeletedMap(
    mergeDeletedMaps(remoteSharedDeleted, {
      foods: localDeleted.foods,
      recipes: localDeleted.recipes,
      recipeIngredients: localDeleted.recipeIngredients,
    }),
  );
  let mergedUserDeleted = pruneDeletedMap(
    mergeDeletedMaps(remoteUserDeleted, {
      mealEntries: localDeleted.mealEntries,
      dayLogs: localDeleted.dayLogs,
      dayTargets: localDeleted.dayTargets,
      weightLogs: localDeleted.weightLogs,
      closedDayArchives: localDeleted.closedDayArchives,
    }),
  );

  const [
    localFoods,
    localRecipes,
    localRecipeIngredients,
    localMealEntries,
    localDayLogs,
    localDayTargets,
    localWeightLogs,
    localClosedDayArchives,
    localProfileArr,
  ] = await Promise.all([
    getAll("foods"),
    getAll("recipes"),
    getAll("recipeIngredients"),
    getAll("mealEntries"),
    getAll("dayLogs"),
    getAll("dayTargets"),
    getAll("weightLogs"),
    getAll("closedDayArchives"),
    getAll("profile"),
  ]);
  const localProfile = localProfileArr[0];
  const remoteUser = remoteDoc.users[accountId] ?? {
    mealEntries: [],
    dayLogs: [],
    dayTargets: [],
    weightLogs: [],
    profile: null,
    closedDayArchives: [],
    deleted: {},
  };

  const mergedFoods = mergeById(localFoods, remoteDoc.shared.foods, remoteSyncedAtMs);
  const mergedRecipes = mergeById(localRecipes, remoteDoc.shared.recipes, remoteSyncedAtMs);
  const mergedRecipeIngredients = mergeById(localRecipeIngredients, remoteDoc.shared.recipeIngredients, remoteSyncedAtMs);
  const mergedMealEntries = mergeById(localMealEntries, remoteUser.mealEntries, remoteSyncedAtMs);
  const mergedDayLogs = mergeById(localDayLogs, remoteUser.dayLogs, remoteSyncedAtMs);
  const mergedDayTargets = mergeById(localDayTargets, remoteUser.dayTargets, remoteSyncedAtMs);
  const mergedWeightLogs = mergeById(localWeightLogs, remoteUser.weightLogs, remoteSyncedAtMs);
  const mergedClosedDayArchives = mergeById(localClosedDayArchives, remoteUser.closedDayArchives, remoteSyncedAtMs);
  const mergedProfile = mergeProfile(localProfile, remoteUser.profile);

  const foodsWithDeleteApplied = applyDeletedForStore("foods", mergedFoods, mergedSharedDeleted);
  mergedSharedDeleted = foodsWithDeleteApplied.deleted;
  const recipesWithDeleteApplied = applyDeletedForStore("recipes", mergedRecipes, mergedSharedDeleted);
  mergedSharedDeleted = recipesWithDeleteApplied.deleted;
  const recipeIngredientsWithDeleteApplied = applyDeletedForStore("recipeIngredients", mergedRecipeIngredients, mergedSharedDeleted);
  mergedSharedDeleted = recipeIngredientsWithDeleteApplied.deleted;
  const mealEntriesWithDeleteApplied = applyDeletedForStore("mealEntries", mergedMealEntries, mergedUserDeleted);
  mergedUserDeleted = mealEntriesWithDeleteApplied.deleted;
  const dayLogsWithDeleteApplied = applyDeletedForStore("dayLogs", mergedDayLogs, mergedUserDeleted);
  mergedUserDeleted = dayLogsWithDeleteApplied.deleted;
  const dayTargetsWithDeleteApplied = applyDeletedForStore("dayTargets", mergedDayTargets, mergedUserDeleted);
  mergedUserDeleted = dayTargetsWithDeleteApplied.deleted;
  const weightLogsWithDeleteApplied = applyDeletedForStore("weightLogs", mergedWeightLogs, mergedUserDeleted);
  mergedUserDeleted = weightLogsWithDeleteApplied.deleted;
  const closedDayArchivesWithDeleteApplied = applyDeletedForStore("closedDayArchives", mergedClosedDayArchives, mergedUserDeleted);
  mergedUserDeleted = closedDayArchivesWithDeleteApplied.deleted;

  await Promise.all([
    replaceStoreContents("foods", localFoods, foodsWithDeleteApplied.items),
    replaceStoreContents("recipes", localRecipes, recipesWithDeleteApplied.items),
    replaceStoreContents("recipeIngredients", localRecipeIngredients, recipeIngredientsWithDeleteApplied.items),
    replaceStoreContents("mealEntries", localMealEntries, mealEntriesWithDeleteApplied.items),
    replaceStoreContents("dayLogs", localDayLogs, dayLogsWithDeleteApplied.items),
    replaceStoreContents("weightLogs", localWeightLogs, weightLogsWithDeleteApplied.items),
    replaceStoreContents("closedDayArchives", localClosedDayArchives, closedDayArchivesWithDeleteApplied.items),
    replaceDayTargets(localDayTargets, dayTargetsWithDeleteApplied.items),
    replaceProfile(localProfile, mergedProfile),
  ]);

  const now = new Date().toISOString();
  const outDoc: CloudDoc = {
    syncedAt: now,
    shared: {
      foods: foodsWithDeleteApplied.items,
      recipes: recipesWithDeleteApplied.items,
      recipeIngredients: recipeIngredientsWithDeleteApplied.items,
      deleted: {
        foods: mergedSharedDeleted.foods,
        recipes: mergedSharedDeleted.recipes,
        recipeIngredients: mergedSharedDeleted.recipeIngredients,
      },
    },
    users: {
      ...remoteDoc.users,
      [accountId]: {
        mealEntries: mealEntriesWithDeleteApplied.items,
        dayLogs: dayLogsWithDeleteApplied.items,
        dayTargets: dayTargetsWithDeleteApplied.items,
        weightLogs: weightLogsWithDeleteApplied.items,
        profile: mergedProfile,
        closedDayArchives: closedDayArchivesWithDeleteApplied.items,
        deleted: mergedUserDeleted,
      },
    },
  };

  const pushed = await pushCloudDoc(outDoc);
  if (pushed) {
    writeLocalDeletedMap({});
  } else {
    writeLocalDeletedMap({
      ...mergedSharedDeleted,
      ...mergedUserDeleted,
    });
  }
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

export function markDeletedInSync(store: SyncStoreName, id: string): void {
  if (!isBrowser()) return;
  const deleted = readLocalDeletedMap();
  const storeDeleted = { ...(deleted[store] ?? {}) };
  storeDeleted[id] = new Date().toISOString();
  writeLocalDeletedMap({
    ...deleted,
    [store]: storeDeleted,
  });
}
