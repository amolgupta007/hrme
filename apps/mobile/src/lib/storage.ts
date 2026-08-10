/**
 * Storage adapter shared by the TanStack Query persister (`query.tsx`) and
 * the offline punch queue (`offline-queue.ts`).
 *
 * `react-native-mmkv` v4 is built on Nitro Modules — a native module that
 * simply does not exist inside Expo Go (and may be missing from a dev build
 * that hasn't been rebuilt after this install). `createMMKV()` throws
 * synchronously in that case, so we feature-detect via try/catch and fall
 * back to an in-memory `Map`. This must NEVER be a platform check
 * (`Platform.OS === ...`) — Expo Go runs on real iOS/Android devices, so the
 * only reliable signal is "did constructing the native module succeed".
 *
 * The in-memory fallback means no persistence across reloads in Expo Go —
 * that's expected and acceptable there; a real dev/production build gets
 * durable MMKV storage.
 */

export type AppStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  /** Wipe every key this adapter owns (DPDP: sign-out / org-change). */
  clearAll: () => void;
};

function createMemoryStorage(): AppStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clearAll: () => {
      map.clear();
    },
  };
}

/** MMKV instance ids are used as on-disk file names — keep them filesystem-safe. */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function createMmkvStorage(id: string): AppStorage | null {
  try {
    // Required (not statically imported) so a missing/incompatible native
    // module can only fail *here*, inside the try, rather than crashing the
    // whole bundle at eval time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require("react-native-mmkv") as typeof import("react-native-mmkv");
    const instance = createMMKV({ id: sanitizeId(id) });
    return {
      getItem: (key) => instance.getString(key) ?? null,
      setItem: (key, value) => instance.set(key, value),
      removeItem: (key) => {
        instance.remove(key);
      },
      clearAll: () => instance.clearAll(),
    };
  } catch {
    return null;
  }
}

/**
 * `namespace` should identify the owning storage scope — e.g. a Clerk user
 * id. Different namespaces never share data.
 *
 * MMKV instances with the same id map onto the same underlying file, so
 * calling `createAppStorage(ns)` twice yields two adapters over ONE store —
 * that sharing is what makes wipe-by-old-key (`wipeNamespaceStorage`) work.
 * The in-memory fallback does NOT share state between calls; acceptable
 * because the fallback has no at-rest persistence to wipe in the first
 * place (data dies with the adapter reference / the process).
 */
export function createAppStorage(namespace: string): AppStorage {
  const mmkv = createMmkvStorage(`jambahr-mobile-${namespace}`);
  if (mmkv) return mmkv;
  if (__DEV__) {
    console.log(
      "[storage] react-native-mmkv unavailable — using in-memory fallback (expected in Expo Go)"
    );
  }
  return createMemoryStorage();
}

/**
 * Storage namespace for an identity's offline punch queue. Defined here
 * (not in offline-queue.ts) so `wipeNamespaceStorage` can clear it without
 * a circular import.
 */
export function offlineQueueNamespace(identityNamespace: string): string {
  return `${identityNamespace}:offline-queue`;
}

/**
 * DPDP wipe for everything persisted under an identity namespace: the
 * query-cache storage AND its offline punch queue. Re-opens each store by
 * key, so it works no matter who currently holds an adapter for it (see the
 * shared-by-id note on `createAppStorage`) and independent of Clerk's
 * render timing. Queued-but-unsent punches from a departing identity are
 * deliberately dropped — DPDP wins over delivery.
 */
export function wipeNamespaceStorage(identityNamespace: string): void {
  createAppStorage(identityNamespace).clearAll();
  createAppStorage(offlineQueueNamespace(identityNamespace)).clearAll();
}
