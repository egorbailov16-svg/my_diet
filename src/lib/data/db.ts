import type { DBSchema } from "@/lib/data/types";

const DB_NAME = "my-diet-db";
const DB_VERSION = 2;
const OPEN_DB_TIMEOUT_MS = 4000;

type StoreName = keyof DBSchema;

const stores: StoreName[] = [
  "profile",
  "dayTargets",
  "dayLogs",
  "foods",
  "recipes",
  "recipeIngredients",
  "mealEntries",
  "weightLogs",
  "recentItems",
  "periodAnalyses",
];

let openPromise: Promise<IDBDatabase> | null = null;

function ensureBrowserSupport() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    throw new Error("IndexedDB is available only in browser environment");
  }
}

export function openAppDB(): Promise<IDBDatabase> {
  ensureBrowserSupport();

  if (openPromise) {
    return openPromise;
  }

  openPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    const timeoutId = window.setTimeout(() => {
      reject(new Error("IndexedDB open timed out"));
    }, OPEN_DB_TIMEOUT_MS);

    request.onupgradeneeded = () => {
      const db = request.result;

      for (const store of stores) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
    };

    request.onsuccess = () => {
      window.clearTimeout(timeoutId);
      resolve(request.result);
    };
    request.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    };
    request.onblocked = () => {
      window.clearTimeout(timeoutId);
      reject(new Error("IndexedDB open blocked"));
    };
  });

  return openPromise.catch((error) => {
    openPromise = null;
    throw error;
  });
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export async function getById<K extends StoreName>(store: K, id: string): Promise<DBSchema[K] | undefined> {
  const db = await openAppDB();
  const tx = db.transaction(store, "readonly");
  const objectStore = tx.objectStore(store);
  return runRequest(objectStore.get(id));
}

export async function getAll<K extends StoreName>(store: K): Promise<DBSchema[K][]> {
  const db = await openAppDB();
  const tx = db.transaction(store, "readonly");
  const objectStore = tx.objectStore(store);
  return runRequest(objectStore.getAll());
}

export async function putOne<K extends StoreName>(store: K, value: DBSchema[K]): Promise<void> {
  const db = await openAppDB();
  const tx = db.transaction(store, "readwrite");
  const objectStore = tx.objectStore(store);
  objectStore.put(value);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function putMany<K extends StoreName>(store: K, values: DBSchema[K][]): Promise<void> {
  const db = await openAppDB();
  const tx = db.transaction(store, "readwrite");
  const objectStore = tx.objectStore(store);

  for (const value of values) {
    objectStore.put(value);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function deleteById<K extends StoreName>(store: K, id: string): Promise<void> {
  const db = await openAppDB();
  const tx = db.transaction(store, "readwrite");
  const objectStore = tx.objectStore(store);
  objectStore.delete(id);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}
