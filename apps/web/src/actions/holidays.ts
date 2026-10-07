"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { presetFor, type HolidayPreset, type HolidayRegion } from "@jambahr/shared/holidays/presets";
import { isValidIsoDate, mergeHolidayDrafts, type HolidayDraft } from "@jambahr/shared/holidays/import";
import type { ActionResult } from "@/types";

export type HolidaySource = "seed" | "preset" | "manual" | "csv";
export type HolidayRow = { id: string; name: string; date: string; is_optional: boolean; source: HolidaySource };
export type HolidayPresetRow = HolidayPreset & { alreadyAdded: boolean };

const draftSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name must be 80 characters or fewer"),
  date: z
    .string()
    .refine(isValidIsoDate, "Enter a real date")
    .refine((d) => {
      const y = Number(d.slice(0, 4));
      return y >= 2000 && y <= 2100;
    }, "Enter a date between 2000 and 2100"),
  isOptional: z.boolean(),
});

const REVALIDATE = ["/dashboard/settings", "/dashboard/leaves", "/dashboard", "/dashboard/attendance"];
const revalidateAll = () => REVALIDATE.forEach((p) => revalidatePath(p));

/** "8 Nov 2026" — matches how dates read elsewhere in Settings. */
function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

const clashMessage = (date: string) => `There's already a holiday on ${prettyDate(date)}`;

const toRow = (r: any): HolidayRow => ({
  id: r.id, name: r.name, date: r.date, is_optional: !!r.is_optional, source: (r.source ?? "seed") as HolidaySource,
});

type AdminAuth =
  | { error: string; user?: undefined }
  | { error?: undefined; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> };

async function requireAdmin(): Promise<AdminAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  if (!isAdmin(user.role)) return { error: "Unauthorized" };
  return { user };
}

export async function listHolidays(year: number): Promise<ActionResult<HolidayRow[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { success: false, error: "Invalid year" };
  const { data, error } = await createAdminSupabase()
    .from("holidays")
    .select("id, name, date, is_optional, source")
    .eq("org_id", user.orgId)
    .gte("date", `${year}-01-01`)
    .lte("date", `${year}-12-31`)
    .order("date", { ascending: true });
  if (error) return { success: false, error: "Couldn't load holidays" };
  return { success: true, data: ((data ?? []) as any[]).map(toRow).sort((a, b) => a.date.localeCompare(b.date)) };
}

export async function createHoliday(input: HolidayDraft): Promise<ActionResult<HolidayRow>> {
  const auth = await requireAdmin();
  if (!auth.user) return { success: false, error: auth.error };
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const { name, date, isOptional } = parsed.data;
  const { data, error } = await createAdminSupabase()
    .from("holidays")
    .insert({ org_id: auth.user.orgId, name, date, is_optional: isOptional, source: "manual", created_by: auth.user.employeeId ?? null })
    .select("id, name, date, is_optional, source")
    .single();
  if (error) return { success: false, error: error.code === "23505" ? clashMessage(date) : "Couldn't add the holiday" };
  revalidateAll();
  return { success: true, data: toRow(data) };
}

export async function updateHoliday(id: string, input: HolidayDraft): Promise<ActionResult<void>> {
  const auth = await requireAdmin();
  if (!auth.user) return { success: false, error: auth.error };
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const { name, date, isOptional } = parsed.data;
  const sb = createAdminSupabase();
  const { data: clash, error: clashErr } = await sb
    .from("holidays").select("id").eq("org_id", auth.user.orgId).eq("date", date).neq("id", id).maybeSingle();
  if (clashErr) return { success: false, error: "Couldn't save the holiday" };
  if (clash) return { success: false, error: clashMessage(date) };
  const { data, error } = await sb
    .from("holidays")
    .update({ name, date, is_optional: isOptional })
    .eq("id", id)
    .eq("org_id", auth.user.orgId)
    .select("id");
  if (error) return { success: false, error: error.code === "23505" ? clashMessage(date) : "Couldn't save the holiday" };
  if (!data || data.length === 0) return { success: false, error: "Holiday not found" };
  revalidateAll();
  return { success: true, data: undefined };
}

export async function deleteHoliday(id: string): Promise<ActionResult<void>> {
  const auth = await requireAdmin();
  if (!auth.user) return { success: false, error: auth.error };
  const sb = createAdminSupabase();
  const { data, error } = await sb.from("holidays").delete().eq("id", id).eq("org_id", auth.user.orgId).select("id");
  if (error) return { success: false, error: "Couldn't delete the holiday" };
  if (!data || data.length === 0) return { success: false, error: "Holiday not found" };
  revalidateAll();
  return { success: true, data: undefined };
}

async function existingDates(orgId: string, from: string, to: string): Promise<Set<string> | null> {
  const { data, error } = await createAdminSupabase()
    .from("holidays").select("date").eq("org_id", orgId).gte("date", from).lte("date", to);
  if (error) return null;
  return new Set(((data ?? []) as { date: string }[]).map((r) => r.date));
}

export async function getHolidayPreset(year: number, region: HolidayRegion): Promise<ActionResult<HolidayPresetRow[]>> {
  const auth = await requireAdmin();
  if (!auth.user) return { success: false, error: auth.error };
  const have = await existingDates(auth.user.orgId, `${year}-01-01`, `${year}-12-31`);
  if (!have) return { success: false, error: "Couldn't load your holidays" };
  return { success: true, data: presetFor(year, region).map((p) => ({ ...p, alreadyAdded: have.has(p.date) })) };
}

export async function importHolidays(
  drafts: HolidayDraft[],
  sourceInput: "preset" | "csv",
): Promise<ActionResult<{ added: number; skipped: string[] }>> {
  const auth = await requireAdmin();
  if (!auth.user) return { success: false, error: auth.error };
  const srcParsed = z.enum(["preset", "csv"]).safeParse(sourceInput);
  if (!srcParsed.success) return { success: false, error: "Unknown import source" };
  const source = srcParsed.data;
  const parsed = z.array(draftSchema).max(400, "Import at most 400 holidays at a time").safeParse(drafts);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  if (parsed.data.length === 0) return { success: true, data: { added: 0, skipped: [] } };

  const dates = parsed.data.map((d) => d.date).sort();
  const have = await existingDates(auth.user.orgId, dates[0], dates[dates.length - 1]);
  if (!have) return { success: false, error: "Couldn't load your holidays" };
  const { rows, skipped } = mergeHolidayDrafts(parsed.data, have);
  if (rows.length === 0) return { success: true, data: { added: 0, skipped } };

  const { error } = await createAdminSupabase()
    .from("holidays")
    .insert(rows.map((r) => ({
      org_id: auth.user.orgId, name: r.name, date: r.date, is_optional: r.isOptional, source, created_by: auth.user.employeeId ?? null,
    })));
  if (error) {
    return {
      success: false,
      error: error.code === "23505"
        ? "Someone added holidays on some of these dates just now. Refresh and try again."
        : "Couldn't import the holidays",
    };
  }
  revalidateAll();
  return { success: true, data: { added: rows.length, skipped } };
}
