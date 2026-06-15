"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/crypto/aes-gcm";
import { resolveProvider, type ProviderConfig } from "@/lib/whatsapp";
import type { ActionResult } from "@/types";

const CredsSchema = z.object({
  provider: z.enum(["omni", "aisensy", "wati", "meta", "centralized"]),
  apiKey: z.string().max(2000).nullable(),
  endpoint: z.string().url().max(500).nullable(),
  templateMap: z.record(z.string(), z.string()),
  active: z.boolean(),
});

export type WhatsAppCredsView = {
  provider: ProviderConfig["provider"] | null;
  hasApiKey: boolean;
  endpoint: string | null;
  templateMap: Record<string, string>;
  active: boolean;
};

export async function getWhatsAppCredentials(): Promise<ActionResult<WhatsAppCredsView | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const sb = createAdminSupabase();
  const { data } = await sb
    .from("org_whatsapp_credentials")
    .select("provider, api_key_encrypted, endpoint, template_map, active")
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!data) return { success: true, data: null };
  const row = data as any;
  return {
    success: true,
    data: {
      provider: row.provider,
      hasApiKey: !!row.api_key_encrypted,
      endpoint: row.endpoint,
      templateMap: row.template_map ?? {},
      active: row.active,
    },
  };
}

export async function upsertWhatsAppCredentials(input: z.infer<typeof CredsSchema>): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can configure WhatsApp" };
  const parsed = CredsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const sb = createAdminSupabase();

  const update: Record<string, any> = {
    org_id: user.orgId,
    provider: parsed.data.provider,
    endpoint: parsed.data.endpoint,
    template_map: parsed.data.templateMap,
    active: parsed.data.active,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.apiKey) update.api_key_encrypted = encrypt(parsed.data.apiKey);

  const { error } = await sb.from("org_whatsapp_credentials").upsert(update as any, { onConflict: "org_id" });
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

/** Load + decrypt the org's provider config for the dispatcher (server-internal). */
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

export async function sendTestWhatsApp(toPhone: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const cfg = await loadProviderConfig(user.orgId);
  const provider = resolveProvider(cfg);
  if (!provider) return { success: false, error: "No active WhatsApp provider configured" };
  const res = await provider.sendTemplate({
    to: toPhone,
    templateKey: "late_punch_alert",
    variables: { name: "Test", time: "09:25", count: "1", threshold: "3" },
  });
  if (!res.ok) return { success: false, error: res.error ?? "Send failed" };
  return { success: true, data: undefined };
}
