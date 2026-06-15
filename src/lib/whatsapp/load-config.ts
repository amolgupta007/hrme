import { createAdminSupabase } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto/aes-gcm";
import type { ProviderConfig } from "@/lib/whatsapp";

/**
 * Server-internal: load + decrypt an org's WhatsApp provider config.
 * NOT a server action — must never be exported from a "use server" file
 * (it returns a decrypted API secret).
 */
export async function loadProviderConfig(orgId: string): Promise<ProviderConfig | null> {
  const sb = createAdminSupabase();
  const { data } = await sb
    .from("org_whatsapp_credentials")
    .select("provider, api_key_encrypted, endpoint, template_map, active")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return null;
  const row = data as any;
  return {
    provider: row.provider,
    apiKey: row.api_key_encrypted ? decrypt(row.api_key_encrypted) : null,
    endpoint: row.endpoint,
    templateMap: row.template_map ?? {},
    active: row.active,
  };
}
