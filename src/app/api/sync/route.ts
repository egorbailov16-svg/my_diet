import { NextResponse } from "next/server";
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

const DEFAULT_BLOB_URL = "https://jsonblob.com/api/jsonBlob/019dce45-3c11-71f2-9c58-266d7a471195";
const BLOB_URL = (process.env.SYNC_BLOB_URL?.trim() || DEFAULT_BLOB_URL);

const EMPTY_DOC = {
  syncedAt: "1970-01-01T00:00:00.000Z",
  shared: {
    foods: [],
    recipes: [],
    recipeIngredients: [],
    deleted: {},
  },
  users: {},
};

type SharedStoreName = "foods" | "recipes" | "recipeIngredients";
type UserStoreName = "mealEntries" | "dayLogs" | "dayTargets" | "weightLogs" | "closedDayArchives";
type SyncStoreName = SharedStoreName | UserStoreName;
type DeletedMap = Partial<Record<SyncStoreName, Record<string, string>>>;
type IdRecord = { id: string; updatedAt: string };

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
};

function parseTs(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDoc(raw: unknown): CloudDoc {
  const doc = (raw && typeof raw === "object" ? raw : {}) as Partial<CloudDoc>;
  const shared = doc.shared && typeof doc.shared === "object" ? doc.shared : EMPTY_DOC.shared;
  const usersRaw = doc.users && typeof doc.users === "object" ? doc.users : {};
  const users: CloudDoc["users"] = {};
  for (const [userId, bucketRaw] of Object.entries(usersRaw)) {
    const bucket = bucketRaw && typeof bucketRaw === "object" ? bucketRaw : {};
    users[userId] = {
      mealEntries: Array.isArray((bucket as { mealEntries?: unknown[] }).mealEntries) ? ((bucket as { mealEntries?: MealEntry[] }).mealEntries ?? []) : [],
      dayLogs: Array.isArray((bucket as { dayLogs?: unknown[] }).dayLogs) ? ((bucket as { dayLogs?: DayLog[] }).dayLogs ?? []) : [],
      dayTargets: Array.isArray((bucket as { dayTargets?: unknown[] }).dayTargets) ? ((bucket as { dayTargets?: DayTarget[] }).dayTargets ?? []) : [],
      weightLogs: Array.isArray((bucket as { weightLogs?: unknown[] }).weightLogs) ? ((bucket as { weightLogs?: WeightLog[] }).weightLogs ?? []) : [],
      profile: (bucket as { profile?: Profile | null }).profile ?? null,
      closedDayArchives: Array.isArray((bucket as { closedDayArchives?: unknown[] }).closedDayArchives)
        ? ((bucket as { closedDayArchives?: ClosedDayArchive[] }).closedDayArchives ?? [])
        : [],
      deleted: ((bucket as { deleted?: DeletedMap }).deleted ?? {}) as Partial<Record<UserStoreName, Record<string, string>>>,
    };
  }
  return {
    syncedAt: typeof doc.syncedAt === "string" ? doc.syncedAt : EMPTY_DOC.syncedAt,
    shared: {
      foods: Array.isArray(shared.foods) ? shared.foods : [],
      recipes: Array.isArray(shared.recipes) ? shared.recipes : [],
      recipeIngredients: Array.isArray(shared.recipeIngredients) ? shared.recipeIngredients : [],
      deleted: (shared.deleted ?? {}) as Partial<Record<SharedStoreName, Record<string, string>>>,
    },
    users,
  };
}

function mergeById<T extends IdRecord>(a: T[], b: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of a) byId.set(item.id, item);
  for (const item of b) {
    const existing = byId.get(item.id);
    if (!existing || parseTs(item.updatedAt) >= parseTs(existing.updatedAt)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

function mergeDeletedMaps(a: DeletedMap, b: DeletedMap): DeletedMap {
  const out: DeletedMap = {};
  const allStores = new Set<SyncStoreName>([...(Object.keys(a) as SyncStoreName[]), ...(Object.keys(b) as SyncStoreName[])]);
  for (const store of allStores) {
    const mapA = a[store] ?? {};
    const mapB = b[store] ?? {};
    const merged: Record<string, string> = { ...mapA };
    for (const [id, ts] of Object.entries(mapB)) {
      const prev = merged[id];
      if (!prev || parseTs(ts) > parseTs(prev)) merged[id] = ts;
    }
    if (Object.keys(merged).length > 0) out[store] = merged;
  }
  return out;
}

function mergeProfile(a: Profile | null, b: Profile | null): Profile | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return parseTs(a.updatedAt) >= parseTs(b.updatedAt) ? a : b;
}

function mergeCloudDocs(remoteRaw: unknown, incomingRaw: unknown): CloudDoc {
  const remote = normalizeDoc(remoteRaw);
  const incoming = normalizeDoc(incomingRaw);
  const mergedUsers: CloudDoc["users"] = { ...remote.users };
  const allUserIds = new Set<string>([...Object.keys(remote.users), ...Object.keys(incoming.users)]);

  for (const userId of allUserIds) {
    const r = remote.users[userId] ?? {
      mealEntries: [],
      dayLogs: [],
      dayTargets: [],
      weightLogs: [],
      profile: null,
      closedDayArchives: [],
      deleted: {},
    };
    const i = incoming.users[userId] ?? {
      mealEntries: [],
      dayLogs: [],
      dayTargets: [],
      weightLogs: [],
      profile: null,
      closedDayArchives: [],
      deleted: {},
    };
    mergedUsers[userId] = {
      mealEntries: mergeById(r.mealEntries, i.mealEntries),
      dayLogs: mergeById(r.dayLogs, i.dayLogs),
      dayTargets: mergeById(r.dayTargets, i.dayTargets),
      weightLogs: mergeById(r.weightLogs, i.weightLogs),
      profile: mergeProfile(r.profile, i.profile),
      closedDayArchives: mergeById(r.closedDayArchives, i.closedDayArchives),
      deleted: mergeDeletedMaps((r.deleted ?? {}) as DeletedMap, (i.deleted ?? {}) as DeletedMap) as Partial<Record<UserStoreName, Record<string, string>>>,
    };
  }

  return {
    syncedAt: new Date().toISOString(),
    shared: {
      foods: mergeById(remote.shared.foods, incoming.shared.foods),
      recipes: mergeById(remote.shared.recipes, incoming.shared.recipes),
      recipeIngredients: mergeById(remote.shared.recipeIngredients, incoming.shared.recipeIngredients),
      deleted: mergeDeletedMaps((remote.shared.deleted ?? {}) as DeletedMap, (incoming.shared.deleted ?? {}) as DeletedMap) as Partial<
        Record<SharedStoreName, Record<string, string>>
      >,
    },
    users: mergedUsers,
  };
}

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(BLOB_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(EMPTY_DOC, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const data = await response.json();
    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("sync GET failed", error);
    return NextResponse.json(EMPTY_DOC, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function PUT(request: Request) {
  try {
    const text = await request.text();
    let incomingDoc: unknown = {};
    try {
      incomingDoc = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const remoteResponse = await fetch(BLOB_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const remoteDoc = remoteResponse.ok ? await remoteResponse.json() : EMPTY_DOC;
    const mergedDoc = mergeCloudDocs(remoteDoc, incomingDoc);

    const response = await fetch(BLOB_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mergedDoc),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("jsonblob PUT failed", response.status, detail.slice(0, 200));
      return NextResponse.json({ ok: false, status: response.status }, { status: 502 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("sync PUT failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
