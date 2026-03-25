"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

// ---- Context helper ----

async function getOrgContext(): Promise<{ orgId: string; clerkUserId: string } | null> {
  const { orgId: sessionOrgId, userId } = auth();
  if (!userId) return null;

  let clerkOrgId = sessionOrgId ?? null;
  if (!clerkOrgId) {
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    clerkOrgId = memberships.data[0]?.organization.id ?? null;
  }
  if (!clerkOrgId) return null;

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!data) return null;
  return { orgId: data.id, clerkUserId: userId };
}

// ---- Types ----

export type DocumentWithUrl = {
  id: string;
  name: string;
  category: "policy" | "contract" | "id_proof" | "tax" | "certificate" | "other";
  file_url: string;
  signed_url: string;
  file_size: number;
  mime_type: string;
  is_company_wide: boolean;
  requires_acknowledgment: boolean;
  employee_id: string | null;
  employee_name: string | null;
  uploaded_by: string;
  created_at: string;
};

// ---- Actions ----

export async function listDocuments(): Promise<ActionResult<DocumentWithUrl[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data: docs, error } = await supabase
    .from("documents")
    .select("*, employees!employee_id(first_name, last_name)")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  // Generate signed URLs for each document (1 hour expiry)
  const withUrls = await Promise.all(
    (docs ?? []).map(async (doc: any) => {
      const path = doc.file_url;
      const { data: signed } = await supabase.storage
        .from("documents")
        .createSignedUrl(path, 3600);

      return {
        id: doc.id,
        name: doc.name,
        category: doc.category,
        file_url: doc.file_url,
        signed_url: signed?.signedUrl ?? "",
        file_size: doc.file_size,
        mime_type: doc.mime_type,
        is_company_wide: doc.is_company_wide,
        requires_acknowledgment: doc.requires_acknowledgment,
        employee_id: doc.employee_id,
        employee_name: doc.employees
          ? `${doc.employees.first_name} ${doc.employees.last_name}`
          : null,
        uploaded_by: doc.uploaded_by,
        created_at: doc.created_at,
      } satisfies DocumentWithUrl;
    })
  );

  return { success: true, data: withUrls };
}

export async function uploadDocument(formData: FormData): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { success: false, error: "No file provided" };

  const name = (formData.get("name") as string)?.trim() || file.name;
  const category = (formData.get("category") as string) || "other";
  const isCompanyWide = formData.get("is_company_wide") === "true";
  const employeeId = (formData.get("employee_id") as string) || null;
  const requiresAck = formData.get("requires_acknowledgment") === "true";

  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "File too large — maximum 10 MB" };
  }

  const supabase = createAdminSupabase();

  // Resolve uploader's employee UUID from their Clerk user ID
  const { data: uploader } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("clerk_user_id", ctx.clerkUserId)
    .single();

  if (!uploader) {
    return {
      success: false,
      error: "Your employee record was not found. Ask an admin to link your account in the Employees page.",
    };
  }

  // Build storage path: orgId/uuid-filename
  const ext = file.name.split(".").pop() ?? "";
  const uniqueName = `${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const storagePath = `${ctx.orgId}/${uniqueName}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, bytes, { contentType: file.type });

  if (uploadError) return { success: false, error: uploadError.message };

  const { error: dbError } = await supabase.from("documents").insert({
    org_id: ctx.orgId,
    name,
    category: category as any,
    file_url: storagePath,
    file_size: file.size,
    mime_type: file.type || "application/octet-stream",
    uploaded_by: uploader.id,
    is_company_wide: isCompanyWide,
    employee_id: isCompanyWide ? null : employeeId,
    requires_acknowledgment: requiresAck,
  });

  if (dbError) {
    // Clean up orphaned file
    await supabase.storage.from("documents").remove([storagePath]);
    return { success: false, error: dbError.message };
  }

  revalidatePath("/dashboard/documents");
  return { success: true, data: undefined };
}

export async function deleteDocument(id: string): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("file_url")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .single();

  if (fetchError || !doc) return { success: false, error: "Document not found" };

  // Delete from storage
  await supabase.storage.from("documents").remove([doc.file_url]);

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/documents");
  return { success: true, data: undefined };
}
