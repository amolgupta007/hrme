import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/clerk-expo";
import type { MobileMeResponse } from "@jambahr/shared/auth/types";
import { ApiError, useApi } from "@/lib/api";

type SessionState = {
  me: MobileMeResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionState>({
  me: null,
  loading: false,
  error: null,
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const apiFetch = useApi();
  const [me, setMe] = useState<MobileMeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMe(await apiFetch<MobileMeResponse>("/api/mobile/me"));
    } catch (e) {
      setMe(null);
      setError(e instanceof ApiError ? e.code : "network_error");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (isSignedIn) {
      // Fetch-on-auth-change is intentional: refresh() sets loading=true
      // synchronously so the spinner shows immediately, then resolves the
      // session asynchronously. Not a derived-state antipattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void refresh();
    } else {
      setMe(null);
      setError(null);
    }
  }, [isSignedIn, refresh]);

  return (
    <SessionContext.Provider value={{ me, loading, error, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
