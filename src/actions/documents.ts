"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
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
  return { orgId: (data as { id: string }).id, clerkUserId: userId };
}

// ---- Types ----

export type DocumentWithUrl = {
  id: string;
  name: string;
  category: "policy" | "contract" | "id_proof" | "tax" | "certificate" | "other";
  space: "owner_vault" | "company_wide" | "personal";
  ack_method: "type_name" | "audit_trail" | "none";
  file_url: string;
  signed_url: string;
  file_size: number;
  mime_type: string;
  is_company_wide: boolean;
  requires_acknowledgment: boolean;
  acknowledged_by_me: boolean;
  acknowledgment_count: number;
  employee_id: string | null;
  employee_name: string | null;
  uploaded_by: string;
  created_at: string;
};

export type AckEntry = {
  employeeId: string;
  employeeName: string;
  acknowledgedAt: string;
  signatureText: string | null;
};

export type SignedRecord = {
  documentId: string;
  documentName: string;
  ackMethod: "type_name" | "audit_trail";
  totalEmployees: number;
  acknowledgments: AckEntry[];
  pendingNames: string[];
};

// ---- Actions ----

export async function listDocuments(): Promise<ActionResult<DocumentWithUrl[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data: me } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("clerk_user_id", ctx.clerkUserId)
    .single();
  const myEmployeeId = (me as { id: string } | null)?.id ?? null;

  let query = supabase
    .from("documents")
    .select("*, employees!employee_id(first_name, last_name)")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (!isAdmin(user.role)) {
    if (myEmployeeId) {
      query = query.or(
        `space.eq.company_wide,and(space.eq.personal,employee_id.eq.${myEmployeeId})`
      );
    } else {
      query = query.eq("space", "company_wide");
    }
  }

  const [{ data: docs, error }, { data: myAcks }, { data: allAcks }] = await Promise.all([
    query,
    myEmployeeId
      ? supabase
          .from("document_acknowledgments")
          .select("document_id")
          .eq("org_id", ctx.orgId)
          .eq("employee_id", myEmployeeId)
      : Promise.resolve({ data: [] }),
    supabase
      .from("document_acknowledgments")
      .select("document_id")
      .eq("org_id", ctx.orgId),
  ]);

  if (error) return { success: false, error: error.message };

  const ackedByMe = new Set((myAcks ?? []).map((a: any) => a.document_id));
  const ackCountByDoc: Record<string, number> = {};
  for (const a of allAcks ?? []) {
    ackCountByDoc[a.document_id] = (ackCountByDoc[a.document_id] ?? 0) + 1;
  }

  const withUrls = await Promise.all(
    (docs ?? []).map(async (doc: any) => {
      const { data: signed } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_url, 3600);

      return {
        id: doc.id,
        name: doc.name,
        category: doc.category,
        space: doc.space ?? "company_wide",
        ack_method: doc.ack_method ?? "none",
        file_url: doc.file_url,
        signed_url: signed?.signedUrl ?? "",
        file_size: doc.file_size,
        mime_type: doc.mime_type,
        is_company_wide: doc.is_company_wide,
        requires_acknowledgment: doc.requires_acknowledgment,
        acknowledged_by_me: ackedByMe.has(doc.id),
        acknowledgment_count: ackCountByDoc[doc.id] ?? 0,
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

export async function acknowledgeDocument(documentId: string): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("clerk_user_id", ctx.clerkUserId)
    .single();

  if (!employee) return { success: false, error: "Employee record not found" };

  const employeeId = (employee as { id: string }).id;

  const { error } = await supabase
    .from("document_acknowledgments")
    .upsert(
      {
        org_id: ctx.orgId,
        document_id: documentId,
        employee_id: employeeId,
        acknowledged_at: new Date().toISOString(),
      },
      { onConflict: "document_id,employee_id" }
    );

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/documents");
  return { success: true, data: undefined };
}

export async function uploadDocument(formData: FormData): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can upload documents" };
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { success: false, error: "No file provided" };

  const name = (formData.get("name") as string)?.trim() || file.name;
  const category = (formData.get("category") as string) || "other";
  const space = ((formData.get("space") as string) || "company_wide") as
    | "owner_vault"
    | "company_wide"
    | "personal";
  const ackMethod = ((formData.get("ack_method") as string) || "none") as
    | "type_name"
    | "audit_trail"
    | "none";
  const employeeId = space === "personal"
    ? (formData.get("employee_id") as string) || null
    : null;
  const requiresAck = ackMethod !== "none";
  const isCompanyWide = space === "company_wide";

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

  const uploaderId = (uploader as { id: string }).id;

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
    space,
    ack_method: ackMethod,
    file_url: storagePath,
    file_size: file.size,
    mime_type: file.type || "application/octet-stream",
    uploaded_by: uploaderId,
    is_company_wide: isCompanyWide,
    employee_id: employeeId,
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
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can delete documents" };
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

  const typedDoc = doc as { file_url: string };

  // Delete from storage
  await supabase.storage.from("documents").remove([typedDoc.file_url]);

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/documents");
  return { success: true, data: undefined };
}
