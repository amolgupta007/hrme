import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/clerk-expo";
import {
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
import { createAppStorage, type AppStorage } from "@/lib/storage";

/**
 * Bump whenever a cached query's shape changes incompatibly — the persister
 * discards anything restored under a different buster.
 */
const CACHE_BUSTER = "mobile-v1";

const PERSIST_STORAGE_KEY = "rq-cache";
const ACTIVE_ORG_STORAGE_KEY = "rq-active-org";

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
   * The on-disk storage namespace below is keyed by Clerk user id alone —
   * `orgId` can't be known until this query itself runs, which needs a
   * QueryClient to already exist (chicken/egg). Org isolation is instead
   * enforced here: if the org this user resolves to differs from the last
   * org seen for them on this device, the cache is wiped before the new
   * org's data populates it. Net effect matches the
   * `${clerkUserId}:${orgId}` cache-key namespace requirement even though
   * the physical storage id is just `${clerkUserId}`.
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

  const prevNamespaceRef = useRef<string | null>(null);

  const storage = useMemo(
    () => createAppStorage(storageNamespace),
    [storageNamespace]
  );
  const persister = useMemo(() => createPersister(storage), [storage]);

  // Identity actually changed (not the first render under this namespace) —
  // DPDP: wipe the OLD namespace's cache. The new namespace's `key` below
  // forces PersistQueryClientProvider to remount and restore fresh from the
  // (independent) new storage — see gotcha note in the module comment above
  // `createPersister`: TanStack's provider only runs restore once per
  // mounted instance and doesn't react to a changed `persister` prop, so a
  // remount (via `key`) is required to actually pick up a new namespace.
  useEffect(() => {
    const prevNamespace = prevNamespaceRef.current;
    if (prevNamespace !== null && prevNamespace !== storageNamespace) {
      queryClient.clear();
    }
    prevNamespaceRef.current = storageNamespace;
  }, [storageNamespace]);

  // Sign-out: DPDP wipe, independent of the effect above (isSignedIn can
  // flip to false slightly before/after `userId` clears depending on the
  // Clerk transition). Idempotent — safe to double-fire.
  useEffect(() => {
    if (!isSignedIn) {
      queryClient.clear();
      storage.clearAll();
    }
  }, [isSignedIn, storage]);

  const identityApi = useMemo<QueryIdentityApi>(
    () => ({
      noteActiveOrg: (orgId: string) => {
        const lastOrgId = storage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (lastOrgId && lastOrgId !== orgId) {
          // Same Clerk user, different org than last seen — never let one
          // org's cached data leak into another's.
          queryClient.clear();
          storage.clearAll();
        }
        storage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId);
      },
    }),
    [storage]
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
 */
export function useMobileQuery<T>(
  key: readonly unknown[],
  path: string,
  options?: Partial<
    Pick<UseQueryOptions<T, Error>, "staleTime" | "enabled" | "gcTime">
  >
) {
  const apiFetch = useApi();
  return useQuery<T>({
    queryKey: key,
    queryFn: () => apiFetch<T>(path),
    ...options,
  });
}
