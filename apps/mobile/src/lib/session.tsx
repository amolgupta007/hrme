import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileMeResponse } from "@jambahr/shared/auth/types";
import { ApiError } from "@/lib/api";
import { useMobileQuery, useQueryIdentity } from "@/lib/query";
import { registerForPush, unregisterPush } from "@/lib/push";

type SessionState = {
  me: MobileMeResponse | null;
  loading: boolean;
  /**
   * Error codes returned by the BFF (`"no_membership"`, etc.) or the client
   * (`"network_error"`). `"unauthenticated"` is a distinct case — the BFF's
   * own 401 body already says `{ error: "unauthenticated" }` — callers
   * should show a sign-out CTA rather than a retry button for it, since
   * retrying a dead/invalid session will never succeed.
   */
  error: string | null;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionState>({
  me: null,
  loading: false,
  error: null,
  refresh: async () => {},
});

const ME_QUERY_KEY = ["mobile", "me"] as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const { noteActiveOrg } = useQueryIdentity();

  const meQuery = useMobileQuery<MobileMeResponse>(ME_QUERY_KEY, "/api/mobile/me", {
    enabled: isSignedIn === true,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (meQuery.data) noteActiveOrg(meQuery.data.orgId);
  }, [meQuery.data, noteActiveOrg]);

  // Push registration (D3 Stage D). Guarded by orgId rather than firing on
  // every `meQuery.data` reference change (react-query structurally shares
  // unchanged data, but a background refetch can still hand back a fresh
  // object) — only (re-)registers when the resolved org actually changes,
  // which also naturally re-registers on an org switch. `registerForPush`
  // itself is a no-op when the device has the push toggle off or permission
  // was denied, so this is safe to call eagerly.
  const registeredOrgRef = useRef<string | null>(null);
  useEffect(() => {
    if (meQuery.data && registeredOrgRef.current !== meQuery.data.orgId) {
      registeredOrgRef.current = meQuery.data.orgId;
      void registerForPush(meQuery.data.orgId);
    }
  }, [meQuery.data]);

  // Sign-out: drop the cached /me result immediately instead of waiting for
  // `enabled` to flip false. This also structurally removes the Phase C
  // sign-out-mid-fetch race (an in-flight fetch resolving into local state
  // after a manual reset) — TanStack owns the query lifecycle, keyed off
  // `enabled`/`isSignedIn`, so there's no component-owned setState left for
  // a stale in-flight response to land in.
  useEffect(() => {
    if (isSignedIn === false) {
      queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
      registeredOrgRef.current = null;
      void unregisterPush();
    }
  }, [isSignedIn, queryClient]);

  const error = meQuery.isError
    ? meQuery.error instanceof ApiError
      ? meQuery.error.code
      : "network_error"
    : null;

  const value: SessionState = {
    me: meQuery.data ?? null,
    // True only for the first, uncached fetch (no data yet + actively
    // fetching) — a persisted-cache warm start renders immediately while
    // revalidating quietly in the background instead of re-showing a
    // spinner on every app open.
    loading: meQuery.isLoading,
    error,
    refresh: async () => {
      await meQuery.refetch();
    },
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
