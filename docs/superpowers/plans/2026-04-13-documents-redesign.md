# Documents Module Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat documents list with a role-aware space-based system (Company Wide / Personal Files / Owner Vault / Signed Records) and add two acknowledgment methods: type-your-name (method A) and audit trail click (method C).

**Architecture:** Two SQL migrations add `space` and `ack_method` columns to existing tables. Server actions are updated to filter documents by role and record rich acknowledgment data. The UI is reorganised into four tabs gated by role, with a new AcknowledgeDialog for type-your-name signing and a new SignedRecordsTab for admin oversight.

**Tech Stack:** Next.js 14 App Router, Supabase (SQL Editor for migrations), Radix UI, Tailwind CSS, TypeScript strict, sonner toasts, lucide-react icons.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/actions/documents.ts` | Modify | Types, listDocuments (role filter), uploadDocument (space), acknowledgeDocument (method + IP), getSignedRecords |
| `src/app/dashboard/documents/page.tsx` | Modify | Fetch signed records for admins, pass employeeId to client |
| `src/components/documents/documents-client.tsx` | Modify | Space tabs, role-gated tab rendering, wire AcknowledgeDialog |
| `src/components/documents/upload-dialog.tsx` | Modify | Space selector, conditional ack method selector |
| `src/components/documents/acknowledge-dialog.tsx` | Create | Type-your-name modal for method A |
| `src/components/documents/signed-records-tab.tsx` | Create | Admin ack log grouped by document |

---

## Task 1: DB Migrations

**Files:** None (Supabase SQL Editor only)

- [ ] **Step 1: Run Migration 1 in Supabase SQL Editor**

Open Supabase Dashboard → SQL Editor → New Query. Paste and run:

```sql
ALTER TABLE documents
  ADD COLUMN space TEXT NOT NULL DEFAULT 'company_wide'
    CHECK (space IN ('owner_vault', 'company_wide', 'personal')),
  ADD COLUMN ack_method TEXT NOT NULL DEFAULT 'none'
    CHECK (ack_method IN ('type_name', 'audit_trail', 'none'));

UPDATE documents SET space = 'company_wide' WHERE is_company_wide = true;
UPDATE documents SET space = 'personal'     WHERE is_company_wide = false AND employee_id IS NOT NULL;
UPDATE documents SET space = 'owner_vault'  WHERE is_company_wide = false AND employee_id IS NULL;
```

- [ ] **Step 2: Run Migration 2 in Supabase SQL Editor**

New Query. Paste and run:

```sql
ALTER TABLE document_acknowledgments
  ADD COLUMN method TEXT NOT NULL DEFAULT 'audit_trail'
    CHECK (method IN ('type_name', 'audit_trail')),
  ADD COLUMN signature_text TEXT,
  ADD COLUMN ip_address TEXT,
  ADD COLUMN user_agent TEXT;
```

- [ ] **Step 3: Verify in Supabase Table Editor**

Open the `documents` table — confirm `space` and `ack_method` columns exist with correct values on existing rows.
Open `document_acknowledgments` — confirm `method`, `signature_text`, `ip_address`, `user_agent` columns exist.

---

## Task 2: Update `documents.ts` — types + `listDocuments()`

**Files:**
- Modify: `src/actions/documents.ts`

- [ ] **Step 1: Update `DocumentWithUrl` type**

Replace the existing `DocumentWithUrl` type (lines 36–52) with:

```typescript
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
```

- [ ] **Step 2: Add new exported types for Signed Records**

Add these types directly after `DocumentWithUrl`:

```typescript
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
```

- [ ] **Step 3: Update `listDocuments()` with role-based space filtering**

Replace the entire `listDocuments` function with:

```typescript
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
```

- [ ] **Step 4: Verify build compiles**

```bash
cd C:/Users/amolg/Downloads/hr-portal && npm run build 2>&1 | tail -20
```

Expected: no new TypeScript errors related to `DocumentWithUrl`.

---

## Task 3: Update `documents.ts` — `uploadDocument()`

**Files:**
- Modify: `src/actions/documents.ts`

- [ ] **Step 1: Replace formData parsing and DB insert in `uploadDocument()`**

Replace lines from `const file = formData.get("file")` through the `supabase.from("documents").insert({...})` call with:

```typescript
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
```

And update the `supabase.from("documents").insert({...})` to include the new columns:

```typescript
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
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build 2>&1 | tail -20
```

---

## Task 4: Update `documents.ts` — `acknowledgeDocument()` + add `getSignedRecords()`

**Files:**
- Modify: `src/actions/documents.ts`

- [ ] **Step 1: Update `acknowledgeDocument()` signature and body**

Replace the entire `acknowledgeDocument` function with:

```typescript
export async function acknowledgeDocument(
  documentId: string,
  method: "type_name" | "audit_trail",
  signatureText?: string
): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const { headers } = await import("next/headers");
  const headersList = headers();
  const ip =
    headersList.get("x-forwarded-for") ??
    headersList.get("x-real-ip") ??
    "unknown";
  const userAgent = headersList.get("user-agent") ?? "unknown";

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
        method,
        signature_text: signatureText ?? null,
        ip_address: ip,
        user_agent: userAgent,
      },
      { onConflict: "document_id,employee_id" }
    );

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/documents");
  return { success: true, data: undefined };
}
```

- [ ] **Step 2: Add `getSignedRecords()` at the end of the file**

```typescript
export async function getSignedRecords(): Promise<ActionResult<SignedRecord[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const [{ data: docs }, { data: employees }, { data: acks }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, name, ack_method")
      .eq("org_id", ctx.orgId)
      .eq("requires_acknowledgment", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("org_id", ctx.orgId)
      .eq("status", "active"),
    supabase
      .from("document_acknowledgments")
      .select("document_id, employee_id, acknowledged_at, signature_text")
      .eq("org_id", ctx.orgId),
  ]);

  const allEmployees = (employees ?? []) as {
    id: string;
    first_name: string;
    last_name: string;
  }[];
  const totalEmployees = allEmployees.length;

  const records: SignedRecord[] = (docs ?? []).map((doc: any) => {
    const docAcks = (acks ?? []).filter((a: any) => a.document_id === doc.id);
    const ackedIds = new Set(docAcks.map((a: any) => a.employee_id));

    const acknowledgments: AckEntry[] = docAcks.map((a: any) => {
      const emp = allEmployees.find((e) => e.id === a.employee_id);
      return {
        employeeId: a.employee_id,
        employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "Unknown",
        acknowledgedAt: a.acknowledged_at,
        signatureText: a.signature_text ?? null,
      };
    });

    const pendingNames = allEmployees
      .filter((e) => !ackedIds.has(e.id))
      .map((e) => `${e.first_name} ${e.last_name}`);

    return {
      documentId: doc.id,
      documentName: doc.name,
      ackMethod: doc.ack_method as "type_name" | "audit_trail",
      totalEmployees,
      acknowledgments,
      pendingNames,
    };
  });

  return { success: true, data: records };
}
```

- [ ] **Step 3: Verify build compiles**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/actions/documents.ts
git commit -m "feat: update documents actions with space filtering, ack methods, and signed records"
```

---

## Task 5: Create `acknowledge-dialog.tsx`

**Files:**
- Create: `src/components/documents/acknowledge-dialog.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { PenLine, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acknowledgeDocument } from "@/actions/documents";
import type { DocumentWithUrl } from "@/actions/documents";

interface AcknowledgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DocumentWithUrl;
}

const inputCn =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

export function AcknowledgeDialog({
  open,
  onOpenChange,
  document: doc,
}: AcknowledgeDialogProps) {
  const [signatureName, setSignatureName] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) setSignatureName("");
  }, [open]);

  async function handleSign() {
    if (!signatureName.trim()) return;
    setLoading(true);
    const result = await acknowledgeDocument(doc.id, "type_name", signatureName.trim());
    setLoading(false);
    if (result.success) {
      toast.success(`"${doc.name}" signed`);
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <PenLine className="h-5 w-5 text-primary" />
              Sign Document
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 px-4 py-3">
              <p className="text-sm font-medium truncate">{doc.name}</p>
            </div>

            <p className="text-sm text-muted-foreground">
              By signing, you confirm you have read and agree to this document.
            </p>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Full name</label>
              <input
                className={inputCn}
                placeholder="Type your full name"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && signatureName.trim() && handleSign()}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                onClick={handleSign}
                disabled={!signatureName.trim() || loading}
              >
                {loading ? "Signing..." : "I Agree & Sign"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build 2>&1 | tail -20
```

---

## Task 6: Create `signed-records-tab.tsx`

**Files:**
- Create: `src/components/documents/signed-records-tab.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import * as React from "react";
import { CheckCircle2, Clock, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { SignedRecord } from "@/actions/documents";

interface SignedRecordsTabProps {
  records: SignedRecord[];
}

export function SignedRecordsTab({ records }: SignedRecordsTabProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="font-medium text-sm">No acknowledgment requests yet</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload a Company Wide document and enable acknowledgment to see records here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record) => {
        const isExpanded = expanded.has(record.documentId);
        const ackCount = record.acknowledgments.length;
        const isComplete = ackCount === record.totalEmployees;

        return (
          <div
            key={record.documentId}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* Header row */}
            <button
              onClick={() => toggle(record.documentId)}
              className="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{record.documentName}</p>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      record.ackMethod === "type_name"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    )}
                  >
                    {record.ackMethod === "type_name" ? "type-your-name" : "audit trail"}
                  </span>
                </div>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isComplete ? "bg-green-500" : "bg-primary"
                    )}
                    style={{
                      width: record.totalEmployees > 0
                        ? `${(ackCount / record.totalEmployees) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
                <span
                  className={cn(
                    "text-xs font-medium tabular-nums",
                    isComplete ? "text-green-600" : "text-muted-foreground"
                  )}
                >
                  {ackCount} / {record.totalEmployees}
                </span>
              </div>
            </button>

            {/* Expanded rows */}
            {isExpanded && (
              <div className="border-t border-border divide-y divide-border">
                {record.acknowledgments.map((ack) => (
                  <div
                    key={ack.employeeId}
                    className="flex items-center gap-3 px-4 py-2.5 bg-muted/20"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-sm font-medium flex-1">{ack.employeeName}</span>
                    {ack.signatureText && (
                      <span className="text-xs text-muted-foreground italic">
                        &ldquo;{ack.signatureText}&rdquo;
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDate(ack.acknowledgedAt)}
                    </span>
                  </div>
                ))}
                {record.pendingNames.map((name) => (
                  <div
                    key={name}
                    className="flex items-center gap-3 px-4 py-2.5 bg-muted/10"
                  >
                    <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-sm text-muted-foreground flex-1">{name}</span>
                    <span className="text-xs text-muted-foreground">pending</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build 2>&1 | tail -20
```

---

## Task 7: Update `upload-dialog.tsx`

**Files:**
- Modify: `src/components/documents/upload-dialog.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import * as Select from "@radix-ui/react-select";
import { Upload, X, ChevronDown, FileUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { uploadDocument } from "@/actions/documents";
import type { Employee } from "@/types";

const CATEGORIES = [
  { value: "policy", label: "Policy" },
  { value: "contract", label: "Contract" },
  { value: "id_proof", label: "ID Proof" },
  { value: "tax", label: "Tax" },
  { value: "certificate", label: "Certificate" },
  { value: "other", label: "Other" },
];

const SPACES = [
  { value: "company_wide", label: "Company Wide", description: "Visible to all employees" },
  { value: "personal", label: "Personal Files", description: "Visible to one employee + admins" },
  { value: "owner_vault", label: "Owner Vault", description: "Visible to admins only" },
] as const;

type SpaceValue = "company_wide" | "personal" | "owner_vault";

const ACK_METHODS = [
  { value: "type_name", label: "Type-your-name", description: "For NDA, Code of Conduct" },
  { value: "audit_trail", label: "Audit trail", description: "For Leave Policy, general policies" },
] as const;

const inputCn =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

const NONE = "__none__";

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
}

export function UploadDialog({ open, onOpenChange, employees }: UploadDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("other");
  const [space, setSpace] = React.useState<SpaceValue>("company_wide");
  const [employeeId, setEmployeeId] = React.useState("");
  const [requiresAck, setRequiresAck] = React.useState(false);
  const [ackMethod, setAckMethod] = React.useState<"type_name" | "audit_trail">("audit_trail");
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setFile(null);
      setName("");
      setCategory("other");
      setSpace("company_wide");
      setEmployeeId("");
      setRequiresAck(false);
      setAckMethod("audit_trail");
    }
  }, [open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ""));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { toast.error("Please select a file"); return; }
    if (space === "personal" && !employeeId) { toast.error("Please select an employee"); return; }

    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name || file.name);
    fd.append("category", category);
    fd.append("space", space);
    if (space === "personal") fd.append("employee_id", employeeId);
    fd.append(
      "ack_method",
      space === "company_wide" && requiresAck ? ackMethod : "none"
    );

    setLoading(true);
    const result = await uploadDocument(fd);
    setLoading(false);

    if (result.success) {
      toast.success("Document uploaded");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold">Upload Document</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* File drop zone */}
            <div
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors",
                file ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40"
              )}
            >
              <FileUp className={cn("h-8 w-8", file ? "text-primary" : "text-muted-foreground/50")} />
              {file ? (
                <div>
                  <p className="text-sm font-medium truncate max-w-xs">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium">Click to select a file</p>
                  <p className="text-xs text-muted-foreground">PDF, DOCX, images — max 10 MB</p>
                </div>
              )}
              <input ref={inputRef} type="file" className="hidden" onChange={handleFileChange} />
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Document Name</Label.Root>
              <input
                className={inputCn}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Employment Contract"
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Category</Label.Root>
              <Select.Root value={category} onValueChange={setCategory}>
                <Select.Trigger className={cn(inputCn, "flex items-center justify-between cursor-pointer")}>
                  <Select.Value />
                  <Select.Icon><ChevronDown className="h-4 w-4 opacity-50" /></Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="z-50 min-w-[8rem] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
                    <Select.Viewport className="p-1">
                      {CATEGORIES.map((c) => (
                        <Select.Item key={c.value} value={c.value} className="relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent">
                          <Select.ItemText>{c.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            </div>

            {/* Space selector */}
            <div className="space-y-2">
              <Label.Root className="text-sm font-medium">Space</Label.Root>
              <div className="space-y-1.5">
                {SPACES.map((s) => (
                  <label
                    key={s.value}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                      space === s.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    <input
                      type="radio"
                      name="space"
                      value={s.value}
                      checked={space === s.value}
                      onChange={() => {
                        setSpace(s.value);
                        setEmployeeId("");
                        setRequiresAck(false);
                      }}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium leading-none">{s.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Employee picker — Personal Files only */}
            {space === "personal" && (
              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">Employee</Label.Root>
                <Select.Root
                  value={employeeId || NONE}
                  onValueChange={(v) => setEmployeeId(v === NONE ? "" : v)}
                >
                  <Select.Trigger className={cn(inputCn, "flex items-center justify-between cursor-pointer")}>
                    <Select.Value placeholder="Select employee" />
                    <Select.Icon><ChevronDown className="h-4 w-4 opacity-50" /></Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="z-50 max-h-48 min-w-[8rem] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
                      <Select.Viewport className="p-1">
                        <Select.Item value={NONE} className="relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent">
                          <Select.ItemText>Select employee</Select.ItemText>
                        </Select.Item>
                        {employees.map((emp) => (
                          <Select.Item key={emp.id} value={emp.id} className="relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent">
                            <Select.ItemText>{emp.first_name} {emp.last_name}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>
            )}

            {/* Acknowledgment — Company Wide only */}
            {space === "company_wide" && (
              <>
                <div className="flex items-center gap-3">
                  <input
                    id="requires_ack"
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={requiresAck}
                    onChange={(e) => setRequiresAck(e.target.checked)}
                  />
                  <Label.Root htmlFor="requires_ack" className="text-sm font-medium cursor-pointer">
                    Requires employee acknowledgment
                  </Label.Root>
                </div>

                {requiresAck && (
                  <div className="space-y-2 pl-7">
                    <p className="text-sm font-medium">Acknowledgment method</p>
                    <div className="space-y-1.5">
                      {ACK_METHODS.map((m) => (
                        <label
                          key={m.value}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                            ackMethod === m.value
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40"
                          )}
                        >
                          <input
                            type="radio"
                            name="ack_method"
                            value={m.value}
                            checked={ackMethod === m.value}
                            onChange={() => setAckMethod(m.value)}
                            className="mt-0.5 accent-primary"
                          />
                          <div>
                            <p className="text-sm font-medium leading-none">{m.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </Dialog.Close>
              <Button type="submit" disabled={loading || !file}>
                {loading ? "Uploading..." : (
                  <><Upload className="mr-2 h-4 w-4" />Upload</>
                )}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/documents/acknowledge-dialog.tsx src/components/documents/signed-records-tab.tsx src/components/documents/upload-dialog.tsx
git commit -m "feat: add acknowledge dialog, signed records tab, and updated upload dialog"
```

---

## Task 8: Update `documents-client.tsx`

**Files:**
- Modify: `src/components/documents/documents-client.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
"use client";

import * as React from "react";
import {
  Search, Upload, FileText, FileImage, File, Trash2,
  Download, Building2, User, AlertCircle, CheckCircle2,
  Lock, Users, PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { deleteDocument, acknowledgeDocument } from "@/actions/documents";
import { UploadDialog } from "./upload-dialog";
import { AcknowledgeDialog } from "./acknowledge-dialog";
import { SignedRecordsTab } from "./signed-records-tab";
import type { DocumentWithUrl, SignedRecord } from "@/actions/documents";
import type { Employee, UserRole } from "@/types";
import { hasPermission } from "@/types";

const CATEGORY_LABELS: Record<string, string> = {
  policy: "Policy",
  contract: "Contract",
  id_proof: "ID Proof",
  tax: "Tax",
  certificate: "Certificate",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  policy: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  contract: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  id_proof: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  tax: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  certificate: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  other: "bg-muted text-muted-foreground",
};

type SpaceTab = "company_wide" | "personal" | "owner_vault" | "signed_records";

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImage className="h-5 w-5 text-blue-500" />;
  if (mime === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentsClientProps {
  documents: DocumentWithUrl[];
  employees: Employee[];
  role: UserRole;
  signedRecords: SignedRecord[];
}

export function DocumentsClient({
  documents,
  employees,
  role,
  signedRecords,
}: DocumentsClientProps) {
  const canManage = hasPermission(role, "admin");
  const [activeTab, setActiveTab] = React.useState<SpaceTab>("company_wide");
  const [search, setSearch] = React.useState("");
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [acknowledging, setAcknowledging] = React.useState<string | null>(null);
  const [signDoc, setSignDoc] = React.useState<DocumentWithUrl | null>(null);

  const tabs: { id: SpaceTab; label: string; icon: React.ReactNode }[] = [
    { id: "company_wide", label: "Company Wide", icon: <Users className="h-4 w-4" /> },
    { id: "personal", label: "Personal Files", icon: <User className="h-4 w-4" /> },
    ...(canManage
      ? [
          { id: "owner_vault" as SpaceTab, label: "Owner Vault", icon: <Lock className="h-4 w-4" /> },
          { id: "signed_records" as SpaceTab, label: "Signed Records", icon: <PenLine className="h-4 w-4" /> },
        ]
      : []),
  ];

  const filtered = documents.filter((doc) => {
    if (activeTab === "signed_records") return false;
    if (doc.space !== activeTab) return false;
    const q = search.toLowerCase();
    return (
      doc.name.toLowerCase().includes(q) ||
      (doc.employee_name ?? "").toLowerCase().includes(q) ||
      CATEGORY_LABELS[doc.category]?.toLowerCase().includes(q)
    );
  });

  async function handleDelete(doc: DocumentWithUrl) {
    if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    setDeleting(doc.id);
    const result = await deleteDocument(doc.id);
    setDeleting(null);
    if (result.success) {
      toast.success("Document deleted");
    } else {
      toast.error(result.error);
    }
  }

  async function handleAuditAcknowledge(doc: DocumentWithUrl) {
    setAcknowledging(doc.id);
    const result = await acknowledgeDocument(doc.id, "audit_trail");
    setAcknowledging(null);
    if (result.success) {
      toast.success(`"${doc.name}" acknowledged`);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSearch(""); }}
            className={cn(
              "flex items-center gap-1.5 shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Signed Records tab */}
      {activeTab === "signed_records" ? (
        <SignedRecordsTab records={signedRecords} />
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                placeholder="Search documents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {canManage && (
              <Button onClick={() => setUploadOpen(true)} className="ml-auto shrink-0">
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "document" : "documents"}
          </p>

          {/* Document list */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="font-medium text-sm">No documents found</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {documents.filter((d) => d.space === activeTab).length === 0
                    ? "Upload your first document to get started."
                    : "Try adjusting your search."}
                </p>
              </div>
              {documents.filter((d) => d.space === activeTab).length === 0 && canManage && (
                <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Document
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="divide-y divide-border">
                {filtered.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <FileIcon mime={doc.mime_type} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", CATEGORY_COLORS[doc.category])}>
                          {CATEGORY_LABELS[doc.category]}
                        </span>
                        {doc.requires_acknowledgment && (
                          doc.acknowledged_by_me ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 text-xs font-medium">
                              <CheckCircle2 className="h-3 w-3" />
                              {doc.ack_method === "type_name" ? "Signed" : "Acknowledged"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 text-xs font-medium">
                              <AlertCircle className="h-3 w-3" />
                              {doc.ack_method === "type_name" ? "Signature required" : "Ack required"}
                            </span>
                          )
                        )}
                        {canManage && doc.requires_acknowledgment && doc.acknowledgment_count > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {doc.acknowledgment_count} acknowledged
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {doc.is_company_wide ? (
                            <><Building2 className="h-3 w-3" /> Company-wide</>
                          ) : (
                            <><User className="h-3 w-3" /> {doc.employee_name ?? "Employee"}</>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatSize(doc.file_size)}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {doc.requires_acknowledgment && !doc.acknowledged_by_me && (
                        doc.ack_method === "type_name" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setSignDoc(doc)}
                          >
                            <PenLine className="mr-1.5 h-3.5 w-3.5" />
                            Sign
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => handleAuditAcknowledge(doc)}
                            disabled={acknowledging === doc.id}
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            {acknowledging === doc.id ? "Saving..." : "Acknowledge"}
                          </Button>
                        )
                      )}
                      {doc.signed_url && (
                        <a href={doc.signed_url} target="_blank" rel="noopener noreferrer" download>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      )}
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(doc)}
                          disabled={deleting === doc.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {canManage && (
        <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} employees={employees} />
      )}
      {signDoc && (
        <AcknowledgeDialog
          open={!!signDoc}
          onOpenChange={(v) => { if (!v) setSignDoc(null); }}
          document={signDoc}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build 2>&1 | tail -20
```

---

## Task 9: Update `documents/page.tsx` + final build + commit

**Files:**
- Modify: `src/app/dashboard/documents/page.tsx`

- [ ] **Step 1: Replace the page**

```typescript
import { listDocuments, getSignedRecords } from "@/actions/documents";
import { listEmployees } from "@/actions/employees";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { DocumentsClient } from "@/components/documents/documents-client";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { hasFeature } from "@/config/plans";

export default async function DocumentsPage() {
  const userCtx = await getCurrentUser();
  const plan = userCtx?.plan ?? "starter";

  if (!hasFeature(plan, "documents")) {
    return <UpgradeGate feature="Documents" requiredPlan="growth" currentPlan={plan} />;
  }

  const role = userCtx?.role ?? "employee";

  const [docsResult, empsResult, signedResult] = await Promise.all([
    listDocuments(),
    listEmployees(),
    isAdmin(role) ? getSignedRecords() : Promise.resolve({ success: true as const, data: [] }),
  ]);

  const documents = docsResult.success ? docsResult.data : [];
  const employees = empsResult.success ? empsResult.data : [];
  const signedRecords = signedResult.success ? signedResult.data : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="mt-1 text-muted-foreground">
          Company policies, contracts, and employee files.
        </p>
      </div>

      <DocumentsClient
        documents={documents}
        employees={employees}
        role={role}
        signedRecords={signedRecords}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run full production build**

```bash
npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` with no errors. TypeScript errors in other modules are pre-existing (`ignoreBuildErrors: true` is set in next.config.js) — only fail if errors are in documents-related files.

- [ ] **Step 3: Commit everything**

```bash
git add src/actions/documents.ts src/app/dashboard/documents/page.tsx src/components/documents/documents-client.tsx src/components/documents/upload-dialog.tsx src/components/documents/acknowledge-dialog.tsx src/components/documents/signed-records-tab.tsx
git commit -m "feat: documents module — spaces, role-based visibility, and acknowledgment methods"
```

- [ ] **Step 4: Push to GitHub (triggers Vercel deploy)**

```bash
git push origin main
```

---

## Manual Test Checklist

After deploy, verify:

- [ ] **As employee:** Documents page shows only Company Wide tab + Personal Files tab (own docs only). Owner Vault and Signed Records tabs are not visible.
- [ ] **As admin:** All 4 tabs visible.
- [ ] **Upload (admin):** Upload a Company Wide doc with type-your-name ack → appears in Company Wide tab.
- [ ] **Upload (admin):** Upload a doc to Owner Vault → not visible when logged in as employee.
- [ ] **Sign (employee):** Company Wide doc with `type_name` method shows "Sign" button → modal opens → typing name enables "I Agree & Sign" → after submit, badge changes to "Signed".
- [ ] **Acknowledge (employee):** Company Wide doc with `audit_trail` method shows "Acknowledge" button → one click → badge changes to "Acknowledged".
- [ ] **Signed Records (admin):** After employee signs, Signed Records tab shows the doc with employee name, typed signature (for type_name), and pending list.
