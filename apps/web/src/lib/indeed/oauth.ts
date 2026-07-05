// 2-legged OAuth token fetch + in-memory cache (employer_access, employer.hosted_job).
let cached: { token: string; expiresAt: number } | null = null;

const TOKEN_URL = "https://apis.indeed.com/oauth/v2/tokens";

export async function getIndeedAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.INDEED_CLIENT_ID || "",
    client_secret: process.env.INDEED_CLIENT_SECRET || "",
    scope: "employer_access employer.hosted_job",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Indeed OAuth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return json.access_token;
}

export function resetIndeedTokenCache() {
  cached = null;
}
