"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FileText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { sendContractorAgreement } from "@/actions/contractor-agreements";
import { buildAgreementBody } from "@/lib/contractor/agreement-templates";
import {
  AGREEMENT_TYPE_LABELS,
  IP_OWNERSHIP_LABELS,
} from "@/lib/contractor/agreement-types";
import type { AgreementType, IpOwnership } from "@/lib/contractor/agreement-types";

// ---- Shared primitives (mirrors contractors-client.tsx style) ----

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
      <label className="text-sm font-medium leading-none">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

function SelectField({
  value,
  onValueChange,
  options,
  placeholder,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value || NONE}
      onChange={(e) => onValueChange(e.target.value === NONE ? "" : e.target.value)}
      className={cn(inputCn, "cursor-pointer")}
    >
      {placeholder && (
        <option value={NONE}>{placeholder}</option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ---- Dialog ----

const AGREEMENT_TYPE_OPTIONS = Object.entries(AGREEMENT_TYPE_LABELS).map(([v, l]) => ({
  value: v as AgreementType,
  label: l,
}));

const IP_OWNERSHIP_OPTIONS = Object.entries(IP_OWNERSHIP_LABELS).map(([v, l]) => ({
  value: v as IpOwnership,
  label: l,
}));

export interface SendAgreementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagementId: string;
  contractorName: string;
  orgName: string;
}

export function SendAgreementDialog({
  open,
  onOpenChange,
  engagementId,
  contractorName,
  orgName,
}: SendAgreementDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [agreementType, setAgreementType] = React.useState<AgreementType>("service");
  const [ipOwnership, setIpOwnership] = React.useState<IpOwnership>("work_for_hire");
  const [bodyText, setBodyText] = React.useState("");
  const [expiryDays, setExpiryDays] = React.useState("");
  const [bodyEdited, setBodyEdited] = React.useState(false);

  // Rebuild body whenever type or IP ownership changes, unless admin manually edited it
  React.useEffect(() => {
    if (!bodyEdited) {
      const effectiveIp = agreementType === "nda" ? "na" : ipOwnership;
      setBodyText(buildAgreementBody({ type: agreementType, orgName, contractorName, ipOwnership: effectiveIp }));
    }
  }, [agreementType, ipOwnership, orgName, contractorName, bodyEdited]);

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setAgreementType("service");
      setIpOwnership("work_for_hire");
      setBodyEdited(false);
      setExpiryDays("");
    }
  }, [open]);

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBodyText(e.target.value);
    setBodyEdited(true);
  }

  function handleTypeChange(v: string) {
    const t = v as AgreementType;
    setAgreementType(t);
    setBodyEdited(false); // reset so body regenerates
    if (t === "nda") setIpOwnership("na");
  }

  function handleIpChange(v: string) {
    setIpOwnership(v as IpOwnership);
    setBodyEdited(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const effectiveIp: IpOwnership = agreementType === "nda" ? "na" : ipOwnership;
      const result = await sendContractorAgreement({
        engagement_id: engagementId,
        agreement_type: agreementType,
        ip_ownership: effectiveIp,
        body_text: bodyText.trim() || undefined,
        expires_in_days: expiryDays ? parseInt(expiryDays, 10) : undefined,
      });

      if (result.success) {
        toast.success(
          <div className="space-y-1">
            <p className="font-medium">Agreement sent to {contractorName}</p>
            <p className="text-xs text-muted-foreground break-all">{result.data.url}</p>
          </div>
        );
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch (e) {
      toast.error("Something went wrong sending the agreement.");
    } finally {
      setLoading(false);
    }
  }

  const showIpField = agreementType !== "nda";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-y-auto">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              Send Agreement
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <p className="mb-5 text-sm text-muted-foreground">
            Sending to <span className="font-medium text-foreground">{contractorName}</span>. A
            signing link will be generated — share it directly or email it.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Agreement type" required>
              <SelectField
                value={agreementType}
                onValueChange={handleTypeChange}
                options={AGREEMENT_TYPE_OPTIONS}
              />
            </Field>

            {showIpField && (
              <Field label="IP ownership">
                <SelectField
                  value={ipOwnership}
                  onValueChange={handleIpChange}
                  options={IP_OWNERSHIP_OPTIONS}
                />
              </Field>
            )}

            <Field label="Agreement body">
              <textarea
                className={cn(
                  "flex min-h-[180px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-y",
                  "font-mono text-xs leading-relaxed"
                )}
                value={bodyText}
                onChange={handleBodyChange}
                placeholder="Agreement body will be pre-filled…"
              />
              {bodyEdited && (
                <p className="text-xs text-muted-foreground mt-1">
                  Manually edited.{" "}
                  <button
                    type="button"
                    className="underline hover:no-underline"
                    onClick={() => setBodyEdited(false)}
                  >
                    Reset to default
                  </button>
                </p>
              )}
            </Field>

            <Field label="Expiry (days from now)">
              <input
                type="number"
                min={1}
                max={365}
                className={inputCn}
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                placeholder="Leave blank — no expiry"
              />
            </Field>

            <div className="flex justify-end gap-3 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" disabled={loading}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                type="submit"
                disabled={loading || !bodyText.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {loading ? "Sending…" : "Send agreement"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
