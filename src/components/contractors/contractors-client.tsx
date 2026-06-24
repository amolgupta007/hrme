"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import * as Select from "@radix-ui/react-select";
import { Briefcase, ChevronDown, Plus, Pencil, CreditCard, X, FileText, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createContractorEngagement,
  updateContractorEngagement,
} from "@/actions/contractors";
import { approveDisbursement } from "@/actions/disbursement";
import { PayContractorsDialog } from "./pay-contractors-dialog";
import { SendAgreementDialog } from "./send-agreement-dialog";
import {
  RATE_TYPE_LABELS,
  TDS_SECTION_LABELS,
} from "@/lib/contractor/types";
import type { RateType, TdsSection, PayeeType, EngagementStatus } from "@/lib/contractor/types";
import type { ContractorBatchRow } from "@/actions/contractors";
import {
  AGREEMENT_TYPE_LABELS,
} from "@/lib/contractor/agreement-types";
import type { AgreementType, AgreementStatus } from "@/lib/contractor/agreement-types";

// Shape returned by listContractorEngagements
export interface ContractorEngagement {
  id: string;
  employee_id: string;
  employee_name: string;
  email: string | null;
  rate_type: RateType;
  rate_amount: number;
  tds_section: TdsSection;
  payee_type: PayeeType;
  has_pan: boolean;
  contract_start: string | null;
  contract_end: string | null;
  renewal_date: string | null;
  status: EngagementStatus;
  bank_verified: boolean;
}

// Shape returned by listAssignableContractors
export interface AssignableContractor {
  id: string;
  name: string;
  email: string | null;
}

// Shape returned by listEngagementAgreements (latest per engagement+type)
export interface EngagementAgreement {
  id: string;
  contractor_engagement_id: string;
  agreement_type: AgreementType;
  status: AgreementStatus;
  signed_at: string | null;
  sent_at: string | null;
  expires_at: string | null;
}

interface ContractorsClientProps {
  engagements: ContractorEngagement[];
  assignableContractors: AssignableContractor[];
  batches: ContractorBatchRow[];
  agreements: EngagementAgreement[];
  orgName: string;
}

const inputCn =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50";

const NONE = "__none__";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label.Root className="text-sm font-medium leading-none">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label.Root>
      {children}
    </div>
  );
}

function SelectField({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  disabled,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Select.Root
      value={value || NONE}
      onValueChange={(v) => onValueChange(v === NONE ? "" : v)}
      disabled={disabled}
    >
      <Select.Trigger
        className={cn(
          inputCn,
          "flex items-center justify-between cursor-pointer",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 max-h-60 min-w-[8rem] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
          <Select.Viewport className="p-1">
            {placeholder && (
              <Select.Item
                value={NONE}
                className="relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent"
              >
                <Select.ItemText>{placeholder}</Select.ItemText>
              </Select.Item>
            )}
            {options.map((opt) => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className="relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent"
              >
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

// ---- Engagement form dialog ----

const EMPTY_FORM = {
  employee_id: "",
  rate_type: "monthly" as RateType,
  rate_amount: "",
  tds_section: "194J" as TdsSection,
  payee_type: "individual_huf" as PayeeType,
  has_pan: true,
  contract_start: "",
  contract_end: "",
  renewal_date: "",
};

interface EngagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ContractorEngagement | null;
  assignableContractors: AssignableContractor[];
  onSuccess: () => void;
}

function EngagementDialog({
  open,
  onOpenChange,
  editing,
  assignableContractors,
  onSuccess,
}: EngagementDialogProps) {
  const isEdit = !!editing;
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);

  React.useEffect(() => {
    if (editing) {
      setForm({
        employee_id: editing.employee_id,
        rate_type: editing.rate_type,
        rate_amount: String(editing.rate_amount),
        tds_section: editing.tds_section,
        payee_type: editing.payee_type,
        has_pan: editing.has_pan,
        contract_start: editing.contract_start ?? "",
        contract_end: editing.contract_end ?? "",
        renewal_date: editing.renewal_date ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editing, open]);

  function set<K extends keyof typeof EMPTY_FORM>(
    field: K,
    value: (typeof EMPTY_FORM)[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rate = parseFloat(form.rate_amount);
    if (!form.employee_id) {
      toast.error("Select a contractor");
      return;
    }
    if (isNaN(rate) || rate <= 0) {
      toast.error("Enter a valid rate amount");
      return;
    }

    setLoading(true);
    const payload = {
      employee_id: form.employee_id,
      rate_type: form.rate_type,
      rate_amount: rate,
      tds_section: form.tds_section,
      payee_type: form.payee_type,
      has_pan: form.has_pan,
      contract_start: form.contract_start || null,
      contract_end: form.contract_end || null,
      renewal_date: form.renewal_date || null,
    };

    const result = isEdit
      ? await updateContractorEngagement(editing!.id, payload)
      : await createContractorEngagement(payload);

    setLoading(false);

    if (result.success) {
      toast.success(isEdit ? "Engagement updated" : "Engagement created");
      onOpenChange(false);
      onSuccess();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">
              {isEdit ? "Edit Engagement" : "Add Contractor Engagement"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Contractor" required>
              {isEdit ? (
                <input
                  className={cn(inputCn, "bg-muted text-muted-foreground")}
                  value={editing?.employee_name ?? ""}
                  disabled
                />
              ) : (
                <SelectField
                  value={form.employee_id}
                  onValueChange={(v) => set("employee_id", v)}
                  placeholder="Select contractor..."
                  options={assignableContractors.map((c) => ({
                    value: c.id,
                    label: c.email ? `${c.name} (${c.email})` : c.name,
                  }))}
                />
              )}
              {!isEdit && assignableContractors.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No unengaged contractors found. Add an employee with employment type
                  &ldquo;Contract&rdquo; first.
                </p>
              )}
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Rate Type" required>
                <SelectField
                  value={form.rate_type}
                  onValueChange={(v) => set("rate_type", v as RateType)}
                  options={Object.entries(RATE_TYPE_LABELS).map(([v, l]) => ({
                    value: v,
                    label: l,
                  }))}
                />
              </Field>
              <Field label="Rate Amount (₹)" required>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputCn}
                  value={form.rate_amount}
                  onChange={(e) => set("rate_amount", e.target.value)}
                  placeholder="e.g. 50000"
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="TDS Section" required>
                <SelectField
                  value={form.tds_section}
                  onValueChange={(v) => set("tds_section", v as TdsSection)}
                  options={Object.entries(TDS_SECTION_LABELS).map(([v, l]) => ({
                    value: v,
                    label: l,
                  }))}
                />
              </Field>
              <Field label="Payee Type" required>
                <SelectField
                  value={form.payee_type}
                  onValueChange={(v) => set("payee_type", v as PayeeType)}
                  options={[
                    { value: "individual_huf", label: "Individual / HUF" },
                    { value: "other", label: "Other (Firm/Company)" },
                  ]}
                />
              </Field>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="has_pan"
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={form.has_pan}
                onChange={(e) => set("has_pan", e.target.checked)}
              />
              <Label.Root htmlFor="has_pan" className="text-sm font-medium">
                Has PAN (unchecked = 20% §206AA rate applies)
              </Label.Root>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Contract Start">
                <input
                  type="date"
                  className={inputCn}
                  value={form.contract_start}
                  onChange={(e) => set("contract_start", e.target.value)}
                />
              </Field>
              <Field label="Contract End">
                <input
                  type="date"
                  className={inputCn}
                  value={form.contract_end}
                  onChange={(e) => set("contract_end", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Renewal Date">
              <input
                type="date"
                className={inputCn}
                value={form.renewal_date}
                onChange={(e) => set("renewal_date", e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-3 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Engagement"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---- Main client component ----

function formatINR(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

const BATCH_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  awaiting_approval: { label: "Awaiting Approval", className: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-700" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700" },
  partial_failed: { label: "Partial Failed", className: "bg-orange-100 text-orange-700" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  preflight: { label: "Preflight", className: "bg-muted text-muted-foreground" },
};

interface ApproveBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batch: ContractorBatchRow | null;
  onSuccess: () => void;
}

function ApproveBatchDialog({ open, onOpenChange, batch, onSuccess }: ApproveBatchDialogProps) {
  const [loading, setLoading] = React.useState(false);

  async function handleApprove() {
    if (!batch) return;
    setLoading(true);
    const result = await approveDisbursement(batch.id);
    setLoading(false);
    if (result.success) {
      const { pushed, failed } = result.data;
      toast.success(
        failed > 0
          ? `Approved — ${pushed} paid, ${failed} failed`
          : `Approved — ${pushed} payout${pushed !== 1 ? "s" : ""} queued`
      );
      onOpenChange(false);
      onSuccess();
    } else {
      toast.error(result.error);
      onOpenChange(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">Approve & Pay</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {batch && (
            <p className="text-sm text-muted-foreground mb-5">
              Approve disbursement of{" "}
              <span className="font-semibold text-foreground">{formatINR(batch.total_amount)}</span>{" "}
              to {batch.item_count} contractor{batch.item_count !== 1 ? "s" : ""}? This will
              initiate RazorpayX payouts immediately.
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Dialog.Close asChild>
              <Button type="button" variant="outline" disabled={loading}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleApprove}
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? "Approving..." : "Approve & Pay"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Short labels for chips
const AGREEMENT_TYPE_SHORT: Record<AgreementType, string> = {
  service: "Service",
  nda: "NDA",
  ip_assignment: "IP",
};

const AGREEMENT_STATUS_CHIP: Record<AgreementStatus, { label: string; className: string }> = {
  sent: { label: "Sent", className: "bg-blue-100 text-blue-700" },
  signed: { label: "Signed", className: "bg-emerald-100 text-emerald-700" },
  declined: { label: "Declined", className: "bg-red-100 text-red-700" },
  expired: { label: "Expired", className: "bg-muted text-muted-foreground" },
  superseded: { label: "Superseded", className: "bg-muted text-muted-foreground" },
};

export function ContractorsClient({
  engagements,
  assignableContractors,
  batches,
  agreements,
  orgName,
}: ContractorsClientProps) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingEngagement, setEditingEngagement] =
    React.useState<ContractorEngagement | null>(null);
  const [payOpen, setPayOpen] = React.useState(false);
  const [approvingBatch, setApprovingBatch] = React.useState<ContractorBatchRow | null>(null);
  const [sendAgreementFor, setSendAgreementFor] =
    React.useState<ContractorEngagement | null>(null);

  // Group agreements by engagement id for O(1) lookup in the table
  const agreementsByEngagement = React.useMemo(() => {
    const map = new Map<string, EngagementAgreement[]>();
    for (const a of agreements) {
      const existing = map.get(a.contractor_engagement_id) ?? [];
      existing.push(a);
      map.set(a.contractor_engagement_id, existing);
    }
    return map;
  }, [agreements]);

  function handleEdit(eng: ContractorEngagement) {
    setEditingEngagement(eng);
    setFormOpen(true);
  }

  function handleAddNew() {
    setEditingEngagement(null);
    setFormOpen(true);
  }

  function handleSuccess() {
    router.refresh();
  }

  const activeEngagements = engagements.filter((e) => e.status === "active");

  return (
    <>
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {engagements.length} engagement{engagements.length !== 1 ? "s" : ""}
          {activeEngagements.length !== engagements.length
            ? ` (${activeEngagements.length} active)`
            : ""}
        </p>
        <div className="flex gap-2">
          {activeEngagements.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setPayOpen(true)}
              className="gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Pay Contractors
            </Button>
          )}
          <Button
            onClick={handleAddNew}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Engagement
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {engagements.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Briefcase className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">No contractor engagements yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add an employee with employment type &ldquo;Contract&rdquo;, then create an
            engagement to track TDS and process payments.
          </p>
          <Button
            className="mt-4 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleAddNew}
          >
            <Plus className="h-4 w-4" />
            Add Engagement
          </Button>
        </div>
      ) : (
        /* Engagements table */
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Contractor
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Rate
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  TDS Section
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Bank
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Dates
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Agreements
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {engagements.map((eng) => (
                <tr key={eng.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{eng.employee_name}</p>
                    {eng.email && (
                      <p className="text-xs text-muted-foreground">{eng.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p>₹{eng.rate_amount.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-muted-foreground">
                      {RATE_TYPE_LABELS[eng.rate_type]}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs">{eng.tds_section}</span>
                    {!eng.has_pan && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        No PAN
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {eng.bank_verified ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-amber-700 bg-amber-100 hover:bg-amber-100">
                        Unverified
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {eng.contract_start ? (
                      <span>
                        {eng.contract_start}
                        {eng.contract_end ? ` → ${eng.contract_end}` : " →"}
                      </span>
                    ) : (
                      <span className="italic">Not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={eng.status === "active" ? "default" : "secondary"}
                      className={
                        eng.status === "active"
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                          : undefined
                      }
                    >
                      {eng.status === "active" ? "Active" : "Ended"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const engAgreements = agreementsByEngagement.get(eng.id) ?? [];
                      const hasSignedAgreement = engAgreements.some((a) => a.status === "signed");
                      return (
                        <div className="flex flex-col gap-1.5 min-w-[140px]">
                          {/* Per-agreement chips */}
                          {engAgreements.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {engAgreements.map((a) => {
                                const chip = AGREEMENT_STATUS_CHIP[a.status] ?? {
                                  label: a.status,
                                  className: "bg-muted text-muted-foreground",
                                };
                                return (
                                  <span
                                    key={a.id}
                                    className={cn(
                                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                      chip.className
                                    )}
                                    title={AGREEMENT_TYPE_LABELS[a.agreement_type]}
                                  >
                                    {AGREEMENT_TYPE_SHORT[a.agreement_type]} · {chip.label}
                                  </span>
                                );
                              })}
                            </div>
                          ) : null}

                          {/* Soft amber signal when no signed agreement exists */}
                          {!hasSignedAgreement && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              No signed agreement
                            </span>
                          )}

                          {/* Send agreement button */}
                          <button
                            type="button"
                            onClick={() => setSendAgreementFor(eng)}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <FileText className="h-3 w-3" />
                            Send agreement
                          </button>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(eng)}
                      className="gap-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Contractor payouts section */}
      {batches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Contractor payouts</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contractors</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {batches.map((batch) => {
                  const statusInfo = BATCH_STATUS_LABELS[batch.status] ?? {
                    label: batch.status,
                    className: "bg-muted text-muted-foreground",
                  };
                  return (
                    <tr key={batch.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(batch.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 font-medium">{formatINR(batch.total_amount)}</td>
                      <td className="px-4 py-3">
                        {batch.item_count} contractor{batch.item_count !== 1 ? "s" : ""}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={cn("hover:opacity-100", statusInfo.className)}>
                          {statusInfo.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {batch.status === "awaiting_approval" && (
                          <Button
                            size="sm"
                            onClick={() => setApprovingBatch(batch)}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            Approve &amp; pay
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit dialog */}
      <EngagementDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditingEngagement(null);
        }}
        editing={editingEngagement}
        assignableContractors={assignableContractors}
        onSuccess={handleSuccess}
      />

      {/* Pay dialog */}
      <PayContractorsDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        engagements={activeEngagements}
      />

      {/* Approve batch dialog */}
      <ApproveBatchDialog
        open={approvingBatch !== null}
        onOpenChange={(o) => { if (!o) setApprovingBatch(null); }}
        batch={approvingBatch}
        onSuccess={() => { setApprovingBatch(null); router.refresh(); }}
      />

      {/* Send agreement dialog */}
      {sendAgreementFor && (
        <SendAgreementDialog
          open={sendAgreementFor !== null}
          onOpenChange={(o) => { if (!o) setSendAgreementFor(null); }}
          engagementId={sendAgreementFor.id}
          contractorName={sendAgreementFor.employee_name}
          orgName={orgName}
        />
      )}
    </>
  );
}
