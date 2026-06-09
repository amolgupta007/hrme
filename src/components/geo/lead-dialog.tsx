"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_STAGES, stageLabel, type LeadStage } from "@/lib/geo/stages";
import { createLead, updateLead } from "@/actions/geo-leads";

interface AssigneeOption {
  id: string;
  name: string;
}

export interface LeadDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  lead?: {
    id: string;
    name: string;
    company: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    address: string | null;
    value_inr: number | null;
    source: string | null;
    stage: LeadStage;
    assigned_to: string | null;
  };
  assigneeOptions?: AssigneeOption[];
}

const EMPTY_FORM = {
  name: "",
  company: "",
  contact_phone: "",
  contact_email: "",
  address: "",
  value_inr: "",
  source: "",
  stage: "new" as LeadStage,
  assigned_to: "",
};

export function LeadDialog(props: LeadDialogProps) {
  const { open, onOpenChange, mode, lead, assigneeOptions = [] } = props;
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(EMPTY_FORM);

  // Auto-fill form when dialog opens: populate from lead (edit) or reset (create).
  // Depends on `open` so that opening the same create dialog twice in a row
  // (lead=undefined both times) still resets the form on the second open.
  useEffect(() => {
    if (!open) return; // skip work when closing
    if (lead) {
      setForm({
        name: lead.name ?? "",
        company: lead.company ?? "",
        contact_phone: lead.contact_phone ?? "",
        contact_email: lead.contact_email ?? "",
        address: lead.address ?? "",
        value_inr: lead.value_inr?.toString() ?? "",
        source: lead.source ?? "",
        stage: lead.stage,
        assigned_to: lead.assigned_to ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, lead]);

  function handleSave() {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      toast.error("Name is required");
      return;
    }

    const payload = {
      name: trimmedName,
      company: form.company.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      address: form.address.trim() || null,
      value_inr: form.value_inr ? Number(form.value_inr) : null,
      source: form.source.trim() || null,
      stage: form.stage,
      assigned_to: form.assigned_to || null,
    };

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createLead(payload)
          : await updateLead(lead!.id, payload);

      if (res.success) {
        toast.success(mode === "create" ? "Lead created" : "Lead updated");
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Something went wrong");
      }
    });
  }

  function patch(field: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...field }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New lead" : "Edit lead"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {/* Name */}
          <Field label="Name *">
            <Input
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Contact or business name"
              disabled={pending}
            />
          </Field>

          {/* Company */}
          <Field label="Company">
            <Input
              value={form.company}
              onChange={(e) => patch({ company: e.target.value })}
              placeholder="Company name"
              disabled={pending}
            />
          </Field>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                value={form.contact_phone}
                onChange={(e) => patch({ contact_phone: e.target.value })}
                placeholder="+91 98765 43210"
                disabled={pending}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.contact_email}
                onChange={(e) => patch({ contact_email: e.target.value })}
                placeholder="name@company.com"
                disabled={pending}
              />
            </Field>
          </div>

          {/* Address */}
          <Field label="Address">
            <Textarea
              value={form.address}
              onChange={(e) => patch({ address: e.target.value })}
              placeholder="Street, city, state"
              rows={2}
              disabled={pending}
            />
          </Field>

          {/* Value + Source */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimated value (₹)">
              <Input
                type="number"
                min={0}
                value={form.value_inr}
                onChange={(e) => patch({ value_inr: e.target.value })}
                placeholder="0"
                disabled={pending}
              />
            </Field>
            <Field label="Source">
              <Input
                value={form.source}
                onChange={(e) => patch({ source: e.target.value })}
                placeholder="Referral, Walk-in…"
                disabled={pending}
              />
            </Field>
          </div>

          {/* Stage + Assignee */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stage">
              <select
                value={form.stage}
                onChange={(e) => patch({ stage: e.target.value as LeadStage })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                disabled={pending}
              >
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {stageLabel(s)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Assigned to">
              <select
                value={form.assigned_to}
                onChange={(e) => patch({ assigned_to: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                disabled={pending}
              >
                <option value="">Unassigned</option>
                {assigneeOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {mode === "create" ? "Create lead" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
