import type { Food } from "@/lib/data/types";

const DEFAULT_SYNC_URL = "https://jsonblob.com/api/jsonBlob/019db9ae-4b13-77bd-b5d6-7b092e472a16";
const CLOUD_SYNC_URL = process.env.NEXT_PUBLIC_FOODS_SYNC_URL?.trim() || DEFAULT_SYNC_URL;

function isEnabled() {
  return typeof window !== "undefined" && CLOUD_SYNC_URL.length > 0;
}

function safeFoods(value: unknown): Food[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Food => {
    if (!item || typeof item !== "object") return false;
    const maybe = item as Partial<Food>;
    return typeof maybe.id === "string" && typeof maybe.name === "string" && !!maybe.nutrientsPer100g;
  });
}

export async function pullFoodsFromCloud(): Promise<Food[] | null> {
  if (!isEnabled()) return null;

  try {
    const response = await fetch(CLOUD_SYNC_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const json = (await response.json()) as unknown;
    return safeFoods(json);
  } catch (error) {
    console.error("Cloud foods pull failed", error);
    return null;
  }
}

export async function pushFoodsToCloud(foods: Food[]): Promise<void> {
  if (!isEnabled()) return;

  try {
    await fetch(CLOUD_SYNC_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(foods),
    });
  } catch (error) {
    console.error("Cloud foods push failed", error);
  }
}

export function mergeFoodsByUpdatedAt(local: Food[], remote: Food[]): Food[] {
  const byId = new Map<string, Food>();

  for (const item of remote) {
    byId.set(item.id, item);
  }

  for (const item of local) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }

    const localTime = Date.parse(item.updatedAt);
    const remoteTime = Date.parse(existing.updatedAt);
    if (Number.isFinite(localTime) && Number.isFinite(remoteTime) ? localTime >= remoteTime : true) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values());
}
