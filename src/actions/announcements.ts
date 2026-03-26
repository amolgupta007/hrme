"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";

// ---- Types ----

export type Announcement = {
  id: string;
  org_id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

// ---- Schema ----

const announcementSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  body: z.string().min(1, "Body is required"),
  is_pinned: z.boolean().default(false),
});

// ---- Actions ----

export async function listAnnouncements(): Promise<ActionResult<Announcement[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .select("*, employees!created_by(first_name, last_name)")
    .eq("org_id", user.orgId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  const announcements = (data ?? []).map((a: any) => ({
    ...a,
    created_by_name: a.employees
      ? `${a.employees.first_name} ${a.employees.last_name}`
      : null,
    employees: undefined,
  }));

  return { success: true, data: announcements };
}

export async function createAnnouncement(
  formData: z.infer<typeof announcementSchema>
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can post announcements" };

  const validated = announcementSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("announcements")
    .insert({
      org_id: user.orgId,
      title: validated.data.title,
      body: validated.data.body,
      is_pinned: validated.data.is_pinned,
      created_by: user.employeeId,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/announcements");
  return { success: true, data: { id: (data as { id: string }).id } };
}

export async function updateAnnouncement(
  id: string,
  formData: z.infer<typeof announcementSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can edit announcements" };

  const validated = announcementSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("announcements")
    .update({
      title: validated.data.title,
      body: validated.data.body,
      is_pinned: validated.data.is_pinned,
    })
    .eq("id", id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/announcements");
  return { success: true, data: undefined };
}

export async function deleteAnnouncement(id: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can delete announcements" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/announcements");
  return { success: true, data: undefined };
}

export async function togglePin(id: string, pinned: boolean): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can pin announcements" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("announcements")
    .update({ is_pinned: pinned })
    .eq("id", id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/announcements");
  return { success: true, data: undefined };
}
