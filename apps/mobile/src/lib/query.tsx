import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "@clerk/clerk-expo";
import {
  focusManager,
  onlineManager,
  QueryClient,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type {
  Persister,
  PersistedClient,
} from "@tanstack/react-query-persist-client";
import { useApi } from "@/lib/api";
import {
  createAppStorage,
  wipeNamespaceStorage,
  type AppStorage,
} from "@/lib/storage";

/**
 * Standard TanStack Query React Native recipe, wired once at module load
 * (this module is imported exactly once for the app's lifetime, same as the
 * `queryClient` singleton below). Without this, `refetchOnReconnect` /
 * `refetchOnWindowFocus` are inert on RN — TanStack's default browser
 * `navigator.onLine` / `visibilitychange` detection never fires.
 */
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

function onAppStateChange(status: AppStateStatus) {
  // Guard mirrors the TanStack RN recipe — a no-op on web, where the
  // default browser focus detection already applies.
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
}
AppState.addEventListener("change", onAppStateChange);

/**
 * Bump whenever a cached query's shape changes incompatibly — the persister
 * discards anything restored under a different buster.
 */
const CACHE_BUSTER = "mobile-v1";

const PERSIST_STORAGE_KEY = "rq-cache";
const ACTIVE_ORG_STORAGE_KEY = "rq-active-org";

/**
 * Identity-independent bookkeeping store. Holds ONLY the last identity
 * namespace seen on this device (no user data), so an identity change —
 * sign-out, or a switch to a different Clerk account — can wipe the
 * DEPARTING namespace by its OLD key. This must be persisted (not a ref):
 * Clerk clears `userId` in the same render that flips `isSignedIn`, so by
 * the time any effect runs, the current `storage` already points at the NEW
 * namespace — the old one is only reachable by re-opening it by key. Being
 * persisted also covers the crash-before-wipe window across app restarts
 * (MMKV builds; the in-memory fallback loses the marker with the process,
 * but it also loses all data with the process — nothing at rest to wipe).
 */
const LAST_IDENTITY_KEY = "last-identity";
let metaStorageSingleton: AppStorage | null = null;
function getMetaStorage(): AppStorage {
  metaStorageSingleton ??= createAppStorage("meta");
  return metaStorageSingleton;
}

function createPersister(storage: AppStorage): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      storage.setItem(PERSIST_STORAGE_KEY, JSON.stringify(client));
    },
    restoreClient: async () => {
      const raw = storage.getItem(PERSIST_STORAGE_KEY);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw) as PersistedClient;
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      storage.removeItem(PERSIST_STORAGE_KEY);
    },
  };
}

type QueryIdentityApi = {
  /**
   * SessionProvider calls this once `/api/mobile/me` resolves successfully.
   *
   * The on-disk storage namespace is keyed by Clerk user id alone — `orgId`
   * can't be known until the /me query itself runs, which needs a
   * QueryClient to already exist (chicken/egg). Org isolation is therefore
   * wipe-based rather than key-based: when the org this user resolves to
   * differs from the last org recorded for them on this device, the query
   * cache and this identity's persisted storage (including the offline
   * punch queue) are cleared before the new org's data populates. That
   * approximates the `${clerkUserId}:${orgId}` namespace requirement — one
   * caveat: data cached between the org actually changing server-side and
   * this callback firing lives in the old org's namespace-less window, so
   * the wipe here is the boundary, not a physical key separation.
   */
  noteActiveOrg: (orgId: string) => void;
};

const QueryIdentityContext = createContext<QueryIdentityApi>({
  noteActiveOrg: () => {},
});

export function useQueryIdentity() {
  return useContext(QueryIdentityContext);
}

// Single QueryClient for the app's lifetime — identity changes clear its
// contents (see below) rather than replacing the instance.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

export function QueryProvider({ children }: { children: ReactNode }) {
  const { isLoaded, userId, isSignedIn } = useAuth();

  // Gate on Clerk having finished reading its persisted session (same idiom
  // as index.tsx / (auth)/_layout.tsx) so `userId` is settled *before* we
  // pick a storage namespace — otherwise every cold boot would transition
  // "signed-out" -> "<real user id>" and look like an account switch.
  if (!isLoaded) return null;

  return <IdentityScopedProvider userId={userId} isSignedIn={isSignedIn === true}>{children}</IdentityScopedProvider>;
}

function IdentityScopedProvider({
  children,
  userId,
  isSignedIn,
}: {
  children: ReactNode;
  userId: string | null | undefined;
  isSignedIn: boolean;
}) {
  const storageNamespace = userId ?? "signed-out";

  const storage = useMemo(
    () => createAppStorage(storageNamespace),
    [storageNamespace]
  );
  const persister = useMemo(() => createPersister(storage), [storage]);

  // Identity changed (sign-out, or a different Clerk account signed in) —
  // DPDP: wipe the DEPARTING identity's persisted data. Crucially this is
  // wipe-by-OLD-key via the persisted `meta` marker: in the render where
  // Clerk drops the user, `storageNamespace` has ALREADY become
  // "signed-out" (userId and isSignedIn come from one context read), so
  // the memoized `storage` above points at the new empty namespace — the
  // departing user's store is only reachable by re-opening it under its
  // old key. `wipeNamespaceStorage` clears both the query-cache store and
  // that identity's offline punch queue. The persisted marker also covers
  // a crash between sign-out and this effect: the wipe re-fires on next
  // boot when the marker disagrees with the current identity.
  //
  // The new namespace's `key` on PersistQueryClientProvider below forces a
  // remount + fresh restore — TanStack's provider only runs restore once
  // per mounted instance and ignores a changed `persister` prop, so a
  // remount is required to actually switch namespaces.
  useEffect(() => {
    const meta = getMetaStorage();
    const prevNamespace = meta.getItem(LAST_IDENTITY_KEY);
    if (prevNamespace && prevNamespace !== storageNamespace) {
      queryClient.clear();
      wipeNamespaceStorage(prevNamespace);
    }
    meta.setItem(LAST_IDENTITY_KEY, storageNamespace);
  }, [storageNamespace]);

  // Belt-and-braces: drop in-memory query state the moment isSignedIn flips
  // false. Disk cleanup is owned by the wipe-by-old-key effect above — by
  // this point `storage` already points at the fresh "signed-out"
  // namespace, so clearing IT would be wiping the wrong store.
  useEffect(() => {
    if (!isSignedIn) {
      queryClient.clear();
    }
  }, [isSignedIn]);

  const identityApi = useMemo<QueryIdentityApi>(
    () => ({
      noteActiveOrg: (orgId: string) => {
        const lastOrgId = storage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (lastOrgId && lastOrgId !== orgId) {
          // Same Clerk user, different org than last seen — never let one
          // org's cached data leak into another's. `storage.clearAll()`
          // covers the held adapter (works for both MMKV and the
          // in-memory fallback); `wipeNamespaceStorage` additionally
          // clears this identity's offline punch queue (MMKV shares by
          // id, so re-opening by key hits the same store).
          queryClient.clear();
          storage.clearAll();
          wipeNamespaceStorage(storageNamespace);
        }
        storage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId);
      },
    }),
    [storage, storageNamespace]
  );

  return (
    <PersistQueryClientProvider
      key={storageNamespace}
      client={queryClient}
      persistOptions={{ persister, buster: CACHE_BUSTER }}
    >
      <QueryIdentityContext.Provider value={identityApi}>
        {children}
      </QueryIdentityContext.Provider>
    </PersistQueryClientProvider>
  );
}

/** Re-exported so screens don't need a second import for cache invalidation etc. */
export { useQueryClient };

/**
 * Typed GET convenience over `useApi()` + TanStack Query.
 *
 * `key` is the query key; `path` is the BFF path fetched via the existing
 * Bearer + X-Org-Id transport. Per-screen callers set `staleTime` per the
 * Phase D addendum (60s home, 0 attendance-today, 5min for static-ish data)
 * — this helper intentionally has no opinion beyond the QueryClient's 60s
 * baseline default.
 *
 * `orgId` is threaded through as the `X-Org-Id` header. Screens fetching
 * org-scoped data should pass `useSession().me.orgId` AND include it in
 * `key` — omitting it makes the BFF fall back to the caller's first
 * membership, which is wrong for multi-org users. (`/api/mobile/me` itself
 * is the one query that legitimately omits it: it's what resolves the
 * active org in the first place.)
 */
export function useMobileQuery<T>(
  key: readonly unknown[],
  path: string,
  options?: Partial<
    Pick<UseQueryOptions<T, Error>, "staleTime" | "enabled" | "gcTime">
  > & { orgId?: string | null }
) {
  const apiFetch = useApi();
  const { orgId, ...queryOptions } = options ?? {};
  return useQuery<T>({
    queryKey: key,
    queryFn: () => apiFetch<T>(path, undefined, orgId),
    ...queryOptions,
  });
}
