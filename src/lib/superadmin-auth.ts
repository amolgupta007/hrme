import { cookies } from "next/headers";

/**
 * Verify the superadmin session cookie. Mirrors the middleware check.
 * Use in server actions invoked from /superadmin pages.
 */
export function isSuperadminAuthenticated(): boolean {
  const cookieStore = cookies();
  const cookie = cookieStore.get("superadmin_session");
  const sessionToken = process.env.SUPERADMIN_SESSION_TOKEN ?? process.env.SUPERADMIN_SECRET;
  if (!sessionToken) return false;
  return cookie?.value === sessionToken;
}
