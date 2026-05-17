"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getHirePrefillData,
  convertOfferToHire,
  type HirePrefillData,
  type ConvertOfferToHirePayload,
} from "@/actions/hire";

interface Props {
  applicationId: string | null;
  candidateName: string;
  open: boolean;
  onClose: () => void;
  onHired: () => void; // refresh parent after successful conversion
}

const EMPLOYMENT_TYPES: ConvertOfferToHirePayload["employmentType"][] = [
  "full_time", "part_time", "contract", "intern",
];
const ROLES: ConvertOfferToHirePayload["role"][] = ["employee", "manager", "admin"];

export function ConvertToEmployeeDialog({
  applicationId,
  candidateName,
  open,
  onClose,
  onHired,
}: Props) {
  const [prefill, setPrefill] = useState<HirePrefillData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [startDate, setStartDate] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [designation, setDesignation] = useState("");
  const [employmentType, setEmploymentType] = useState<ConvertOfferToHirePayload["employmentType"]>("full_time");
  const [reportingManagerId, setReportingManagerId] = useState<string>("");
  const [role, setRole] = useState<ConvertOfferToHirePayload["role"]>("employee");
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    if (!open || !applicationId) return;
    let cancelled = false;
    setPrefill(null);
    setLoadError(null);
    getHirePrefillData(applicationId).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setLoadError(result.error);
        return;
      }
      const d = result.data;
      setPrefill(d);
      // Sensible defaults from the offer + candidate
      setStartDate(d.offer?.joining_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
      setDepartmentId(d.offer?.department_id ?? "");
      setDesignation(d.offer?.role_title ?? "");
      setEmploymentType("full_time");
      setReportingManagerId(d.offer?.reporting_manager_id ?? "");
      setRole("employee");
      setInviteEmail(d.candidate.email);
    });
    return () => { cancelled = true; };
  }, [open, applicationId]);

  async function handleSubmit() {
    if (!applicationId) return;
    setSubmitting(true);
    try {
      const payload: ConvertOfferToHirePayload = {
        startDate,
        departmentId: departmentId || null,
        designation: designation.trim() || null,
        employmentType,
        reportingManagerId: reportingManagerId || null,
        role,
        clerkInviteEmail: inviteEmail.trim(),
      };
      const result = await convertOfferToHire(applicationId, payload);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${candidateName} is now an employee 🎉`);
      onHired();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  if (!applicationId) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Convert to employee
          </DialogTitle>
          <DialogDescription>
            Creating <strong>{candidateName}</strong> as an active employee. We&rsquo;ll send a
            Clerk org invite to their email and a welcome message. Fields are prefilled from the
            accepted offer — adjust before saving.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <div className="text-sm text-red-600 py-6 text-center">{loadError}</div>
        ) : !prefill ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading offer details…</div>
        ) : (
          <div className="grid gap-3 mt-1">
            <Field label="Start date">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Designation">
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Senior Engineer"
                />
              </Field>
              <Field label="Employment type">
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value as typeof employmentType)}
                  className={inputCls}
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Department">
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— None —</option>
                  {prefill.departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Role">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  className={inputCls}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Reporting manager">
              <select
                value={reportingManagerId}
                onChange={(e) => setReportingManagerId(e.target.value)}
                className={inputCls}
              >
                <option value="">— None —</option>
                {prefill.potentialManagers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Invite email">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className={inputCls}
                required
              />
            </Field>

            {prefill.offer && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5 mt-1">
                <strong className="text-foreground">From offer:</strong>{" "}
                CTC ₹{(prefill.offer.ctc / 100000).toFixed(2)} LPA · Joining{" "}
                {prefill.offer.joining_date?.slice(0, 10)}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2 justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !prefill || !startDate || !inviteEmail}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? "Hiring…" : "Hire & invite"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";
