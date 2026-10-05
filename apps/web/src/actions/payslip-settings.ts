"use server";

// Settings → Payroll → Pay slip details: what the org's pay slips show at the
// top (logo, legal name, address, contact, GSTIN / PAN / TAN, PF and ESI
// codes) and at the bottom (query line), plus whether employer contributions
// are listed. Admin-only, Business plan, audited. Processed runs keep the
// details they were processed with (frozen on the run).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { writePayrollAudit } from "@/lib/payroll/engine-config";
import { loadOrgLogo, type PayslipSettings } from "@/lib/payroll/payslip-data";
import type { ActionResult } from "@/types";
import {
  PAYSLIP_EMPLOYEE_FIELDS,
  type PayslipEmployeeFieldKey,
  type PayslipEmployeeFieldSettings,
} from "@jambahr/shared/payroll/payslip";

const BUCKET = "documents";
const MAX_LOGO_BYTES = 1024 * 1024;

async function requirePayrollAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" } as const;
  if (!isAdmin(user.role)) return { error: "Only admins can change pay slip details" } as const;
  if (!hasFeature(user.plan ?? "starter", "payroll", user.customFeatures ?? null)) {
    return { error: "Payroll is available on the Business plan" } as const;
  }
  return { user } as const;
}

export interface PayslipDetails {
  legalName: string;
  addressLines: string[];
  website: string;
  email: string;
  gstin: string;
  pan: string;
  tan: string;
  pfCode: string;
  esiCode: string;
  queryLine: string;
  showEmployerContributions: boolean;
  /** Employee block: every catalogue field, in slip order, with the org's choice. */
  employeeFields: { key: PayslipEmployeeFieldKey; show: boolean; label: string }[];
  /** data: URL of the current logo, or null. */
  logo: string | null;
  orgName: string;
}

export async function getPayslipDetails(): Promise<ActionResult<PayslipDetails>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("organizations")
    .select("name, address, gstin, pan, tan, pf_establishment_code, esi_code, logo_url, settings")
    .eq("id", auth.user.orgId)
    .single();
  if (error) return { success: false, error: error.message };
  const o = data as any;
  const p: PayslipSettings = o.settings?.payslip ?? {};
  const logo = await loadOrgLogo(sb as any, o.logo_url ?? null);
  const lines = Array.isArray(o.address?.lines) ? o.address.lines : [];
  return {
    success: true,
    data: {
      orgName: o.name,
      legalName: p.legalName ?? "",
      addressLines: lines,
      website: p.website ?? "",
      email: p.email ?? "",
      gstin: o.gstin ?? "",
      pan: o.pan ?? "",
      tan: o.tan ?? "",
      pfCode: o.pf_establishment_code ?? "",
      esiCode: o.esi_code ?? "",
      queryLine: p.queryLine ?? "",
      showEmployerContributions: !!p.showEmployerContributions,
      employeeFields: PAYSLIP_EMPLOYEE_FIELDS.map((f) => ({
        key: f.key,
        show: p.employeeFields?.[f.key]?.show !== false,
        label: p.employeeFields?.[f.key]?.label ?? "",
      })),
      logo: logo ? `data:image/${logo.format === "jpg" ? "jpeg" : "png"};base64,${logo.data.toString("base64")}` : null,
    },
  };
}

const opt = (max: number) => z.string().trim().max(max);
const DetailsSchema = z.object({
  legalName: opt(120),
  addressLines: z.array(opt(120)).max(4),
  website: opt(120),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
  gstin: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, "GSTIN is 15 letters and digits")]),
  pan: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN looks like ABCDE1234F")]),
  tan: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^[A-Z]{4}[0-9]{5}[A-Z]$/, "TAN looks like ABCD12345E")]),
  pfCode: opt(40),
  esiCode: opt(40),
  queryLine: opt(200),
  showEmployerContributions: z.boolean(),
  employeeFields: z
    .array(z.object({
      key: z.enum(PAYSLIP_EMPLOYEE_FIELDS.map((f) => f.key) as [PayslipEmployeeFieldKey, ...PayslipEmployeeFieldKey[]]),
      show: z.boolean(),
      label: z.string().trim().max(30, "Keep labels to 30 characters"),
    }))
    .optional(),
});

export async function savePayslipDetails(input: z.input<typeof DetailsSchema>): Promise<ActionResult<void>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const parsed = DetailsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const d = parsed.data;
  const { orgId, employeeId } = auth.user;
  const sb = createAdminSupabase();

  const { data: before, error: readErr } = await sb
    .from("organizations").select("address, gstin, pan, tan, pf_establishment_code, esi_code, settings").eq("id", orgId).single();
  if (readErr) return { success: false, error: readErr.message };
  const b = before as any;
  // Only what differs from the catalogue default is stored (hidden, or relabelled).
  let employeeFields: PayslipEmployeeFieldSettings | null = b.settings?.payslip?.employeeFields ?? null;
  if (d.employeeFields) {
    employeeFields = {};
    for (const f of d.employeeFields) {
      if (!f.show || f.label) employeeFields[f.key] = { show: f.show, ...(f.label ? { label: f.label.toUpperCase() } : {}) };
    }
  }
  const payslip: PayslipSettings = {
    legalName: d.legalName || null,
    website: d.website || null,
    email: d.email || null,
    queryLine: d.queryLine || null,
    showEmployerContributions: d.showEmployerContributions,
    employeeFields,
  };
  const after = {
    address: { lines: d.addressLines.filter(Boolean) },
    gstin: d.gstin || null,
    pan: d.pan || null,
    tan: d.tan || null,
    pf_establishment_code: d.pfCode || null,
    esi_code: d.esiCode || null,
  };
  // Merge into settings so nothing else stored there is touched.
  const settings = { ...(b.settings ?? {}), payslip };
  const { error } = await sb.from("organizations").update({ ...after, settings } as any).eq("id", orgId);
  if (error) return { success: false, error: error.message };

  const auditErr = await writePayrollAudit(sb as any, orgId, employeeId ?? null, [{
    entity: "settings", action: "update", field: "payslip_details",
    oldValue: { address: b.address, gstin: b.gstin, pan: b.pan, tan: b.tan, pf: b.pf_establishment_code, esi: b.esi_code, payslip: b.settings?.payslip ?? null },
    newValue: { ...after, payslip },
  }]);
  if (auditErr) return { success: false, error: `Saved, but the change could not be logged: ${auditErr}` };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

/** Upload (or replace) the org logo used on pay slips. PNG or JPG, up to 1 MB. */
export async function uploadPayslipLogo(form: FormData): Promise<ActionResult<void>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0) return { success: false, error: "Choose an image" };
  if (file.size > MAX_LOGO_BYTES) return { success: false, error: "The logo must be 1 MB or smaller" };
  const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : null;
  if (!ext) return { success: false, error: "Use a PNG or JPG image" };

  const { orgId, employeeId } = auth.user;
  const sb = createAdminSupabase();
  const path = `${orgId}/branding/payslip-logo-${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (upErr) return { success: false, error: upErr.message };

  const { data: before } = await sb.from("organizations").select("logo_url").eq("id", orgId).single();
  const { error } = await sb.from("organizations").update({ logo_url: path } as any).eq("id", orgId);
  if (error) return { success: false, error: error.message };
  // The previous file is kept: processed pay slips may still point at it.
  const auditErr = await writePayrollAudit(sb as any, orgId, employeeId ?? null, [{
    entity: "settings", action: "update", field: "payslip_logo", oldValue: (before as any)?.logo_url ?? null, newValue: path,
  }]);
  if (auditErr) return { success: false, error: `Saved, but the change could not be logged: ${auditErr}` };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}
