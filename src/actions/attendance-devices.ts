"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { enqueueUpsertForDevice } from "@/lib/attendance/device-provisioning";
import type { ActionResult } from "@/types";

export type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
};

export type DeviceRow = {
  id: string;
  device_serial: string;
  label: string | null;
  location_id: string | null;
  location_name: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  last_punch_at: string | null;
};

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" as const };
  if (!isAdmin(user.role)) return { error: "Unauthorized" as const };
  return { user };
}

// ---------------- Locations ----------------

export async function listLocations(): Promise<ActionResult<LocationRow[]>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, address, is_active")
    .eq("org_id", ctx.user.orgId)
    .order("created_at", { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as LocationRow[] };
}

const locationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  address: z.string().trim().max(300).optional().nullable(),
});

export async function createLocation(input: {
  name: string;
  address?: string | null;
}): Promise<ActionResult<LocationRow>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("locations")
    .insert({
      org_id: ctx.user.orgId,
      name: parsed.data.name,
      address: parsed.data.address || null,
    })
    .select("id, name, address, is_active")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: data as LocationRow };
}

export async function deleteLocation(id: string): Promise<ActionResult<void>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const supabase = createAdminSupabase();
  // Devices keep working — their location_id FK is ON DELETE SET NULL.
  const { error } = await supabase
    .from("locations")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

// ---------------- Devices ----------------

export async function listDevices(): Promise<ActionResult<DeviceRow[]>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("devices")
    .select("id, device_serial, label, location_id, is_active, last_seen_at, last_punch_at, locations(name)")
    .eq("org_id", ctx.user.orgId)
    .order("created_at", { ascending: true });

  if (error) return { success: false, error: error.message };
  const rows: DeviceRow[] = (data ?? []).map((d: any) => ({
    id: d.id,
    device_serial: d.device_serial,
    label: d.label,
    location_id: d.location_id,
    location_name: d.locations?.name ?? null,
    is_active: d.is_active,
    last_seen_at: d.last_seen_at,
    last_punch_at: d.last_punch_at,
  }));
  return { success: true, data: rows };
}

const deviceSchema = z.object({
  device_serial: z
    .string()
    .trim()
    .min(3, "Serial number is required")
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Serial can only contain letters, numbers, - and _"),
  location_id: z.string().uuid().optional().nullable(),
  label: z.string().trim().max(120).optional().nullable(),
});

export async function registerDevice(input: {
  device_serial: string;
  location_id?: string | null;
  label?: string | null;
}): Promise<ActionResult<DeviceRow>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const parsed = deviceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("devices")
    .insert({
      org_id: ctx.user.orgId,
      device_serial: parsed.data.device_serial,
      location_id: parsed.data.location_id || null,
      label: parsed.data.label || null,
    })
    .select("id, device_serial, label, location_id, is_active, last_seen_at, last_punch_at, locations(name)")
    .single();

  if (error) {
    if ((error as any).code === "23505") {
      return { success: false, error: "A device with that serial is already registered" };
    }
    return { success: false, error: error.message };
  }

  // Backfill existing active employees (with PINs) onto the new device. Best-effort.
  await enqueueUpsertForDevice(ctx.user.orgId, (data as any).id, (data as any).device_serial);

  revalidatePath("/dashboard/settings");
  return {
    success: true,
    data: {
      id: (data as any).id,
      device_serial: (data as any).device_serial,
      label: (data as any).label,
      location_id: (data as any).location_id,
      location_name: (data as any).locations?.name ?? null,
      is_active: (data as any).is_active,
      last_seen_at: (data as any).last_seen_at,
      last_punch_at: (data as any).last_punch_at,
    },
  };
}

export async function updateDevice(
  id: string,
  patch: { location_id?: string | null; label?: string | null; is_active?: boolean },
): Promise<ActionResult<void>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const update: Record<string, unknown> = {};
  if ("location_id" in patch) update.location_id = patch.location_id || null;
  if ("label" in patch) update.label = patch.label?.trim() || null;
  if ("is_active" in patch) update.is_active = !!patch.is_active;
  if (Object.keys(update).length === 0) return { success: true, data: undefined };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("devices")
    .update(update)
    .eq("id", id)
    .eq("org_id", ctx.user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

export async function deleteDevice(id: string): Promise<ActionResult<void>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };

  const supabase = createAdminSupabase();
  // Past punch_events keep their device_id FK (ON DELETE SET NULL) — history preserved.
  const { error } = await supabase
    .from("devices")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

// ---------------- Ingest security (per-org token) ----------------

export type IngestSecurity = {
  token: string | null;
  requireToken: boolean;
};

async function readSettings(orgId: string) {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .single();
  return { supabase, settings: ((data as any)?.settings ?? {}) as Record<string, any> };
}

export async function getIngestSecurity(): Promise<ActionResult<IngestSecurity>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { settings } = await readSettings(ctx.user.orgId);
  return {
    success: true,
    data: {
      token: settings.device_ingest_token ?? null,
      requireToken: settings.device_ingest_require_token === true,
    },
  };
}

export async function regenerateIngestToken(): Promise<ActionResult<string>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase, settings } = await readSettings(ctx.user.orgId);
  const token = `dit_${randomBytes(18).toString("hex")}`;
  const { error } = await supabase
    .from("organizations")
    .update({ settings: { ...settings, device_ingest_token: token } })
    .eq("id", ctx.user.orgId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: token };
}

export async function setRequireIngestToken(
  required: boolean,
): Promise<ActionResult<void>> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { supabase, settings } = await readSettings(ctx.user.orgId);
  // Guard: can't require a token that doesn't exist yet.
  if (required && !settings.device_ingest_token) {
    return { success: false, error: "Generate a token first, then require it." };
  }
  const { error } = await supabase
    .from("organizations")
    .update({ settings: { ...settings, device_ingest_require_token: required } })
    .eq("id", ctx.user.orgId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}
