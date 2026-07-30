import { openDB, type IDBPDatabase } from "idb";
import type { StateStorage } from "zustand/middleware";

const DB_NAME = "cuarenta-offline";
const STORE_NAME = "zustand-cache";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

export const idbStorage: StateStorage = {
  async getItem(name) {
    const db = await getDb();
    if (!db) return null;
    const value = await db.get(STORE_NAME, name);
    return value ?? null;
  },
  async setItem(name, value) {
    const db = await getDb();
    if (!db) return;
    await db.put(STORE_NAME, value, name);
  },
  async removeItem(name) {
    const db = await getDb();
    if (!db) return;
    await db.delete(STORE_NAME, name);
  },
};
