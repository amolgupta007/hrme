import { useCallback } from "react";
import { useAuth } from "@clerk/clerk-expo";
import type { MobileApiError } from "@jambahr/shared/auth/types";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string
  ) {
    super(`API ${status}: ${code}`);
  }
}

/**
 * Authenticated fetch against the JambaHR BFF (/api/mobile/*).
 * Sends the Clerk session token as Bearer; optional orgId → X-Org-Id
 * (server validates it against real memberships — see active-org.ts).
 *
 * The returned function is memoized on `getToken` so callers (e.g.
 * SessionProvider's refresh effect) can safely depend on it without
 * triggering a re-fetch loop from a new identity every render.
 */
export function useApi() {
  const { getToken } = useAuth();

  return useCallback(
    async function apiFetch<T>(
      path: string,
      init?: RequestInit,
      orgId?: string | null
    ): Promise<T> {
      const token = await getToken();
      const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${token}`,
          ...(orgId ? { "X-Org-Id": orgId } : {}),
        },
      });
      if (!res.ok) {
        let code = "unknown";
        try {
          code = ((await res.json()) as MobileApiError).error ?? "unknown";
        } catch {
          /* non-JSON error body */
        }
        throw new ApiError(res.status, code);
      }
      return (await res.json()) as T;
    },
    [getToken]
  );
}
