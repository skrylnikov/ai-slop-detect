import { browser } from "wxt/browser";

const collapseKey = "local:collapseRed";

export async function getCollapseRed(): Promise<boolean> {
  const values = await browser.storage.local.get(collapseKey);
  return (values[collapseKey] as boolean | undefined) ?? false;
}

export function setCollapseRed(value: boolean): Promise<void> {
  return browser.storage.local.set({ [collapseKey]: value });
}

let databasePromise: Promise<IDBDatabase> | undefined;
const databaseName = "ai-slop-labels";

function database(): Promise<IDBDatabase> {
  return databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("tokens");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readSession(db: IDBDatabase): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const request = db.transaction("tokens").objectStore("tokens").get("session");
    request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

function writeSession(db: IDBDatabase, token: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db.transaction("tokens", "readwrite").objectStore("tokens").put(token, "session");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function readToken(): Promise<string | null> {
  const db = await database();
  return readSession(db);
}

export async function writeToken(token: string | null): Promise<void> {
  const db = await database();
  return writeSession(db, token);
}
