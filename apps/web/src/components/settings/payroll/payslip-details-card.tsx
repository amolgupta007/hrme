"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Upload } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getPayslipDetails, savePayslipDetails, uploadPayslipLogo, type PayslipDetails } from "@/actions/payslip-settings";
import { PAYSLIP_EMPLOYEE_FIELDS } from "@jambahr/shared/payroll/payslip";
import { field } from "./styles";

/** Settings → Payroll → Pay slip details. Loads its own state. */
export function PayslipDetailsCard() {
  const [d, setD] = useState<PayslipDetails | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => getPayslipDetails().then((r) => (r.success ? setD(r.data) : toast.error(r.error)));
  useEffect(() => { void load(); }, []);

  if (!d) {
    return <p className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading pay slip details…</p>;
  }
  const set = <K extends keyof PayslipDetails>(k: K, v: PayslipDetails[K]) => setD((p) => (p ? { ...p, [k]: v } : p));
  const address = [...d.addressLines, "", "", ""].slice(0, 3);

  async function save() {
    if (!d) return;
    setSaving(true);
    const { logo: _l, orgName: _n, ...rest } = d;
    const res = await savePayslipDetails({ ...rest, addressLines: d.addressLines.filter((l) => l.trim()) });
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    toast.success("Pay slip details saved");
    void load();
  }

  async function upload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.set("logo", file);
    const res = await uploadPayslipLogo(form);
    setUploading(false);
    if (!res.success) return void toast.error(res.error);
    toast.success("Logo updated");
    void load();
  }

  const input = (label: string, k: "legalName" | "website" | "email" | "gstin" | "pan" | "tan" | "pfCode" | "esiCode" | "queryLine", placeholder = "") => (
    <div>
      <label className="text-sm font-medium" htmlFor={`psd-${k}`}>{label}</label>
      <input id={`psd-${k}`} className={field} value={d[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileText className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-semibold">Pay slip details</h3>
          <p className="text-sm text-muted-foreground">
            What appears at the top of every pay slip. Months already processed keep the details they were processed with.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-48 items-center justify-center rounded-md border bg-white p-2">
          {d.logo
            // eslint-disable-next-line @next/next/no-img-element -- data: URL from the server
            ? <img src={d.logo} alt={`${d.orgName} logo`} className="max-h-full max-w-full object-contain" />
            : <span className="text-xs text-muted-foreground">No logo</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {d.logo ? "Replace logo" : "Upload logo"}
        </button>
        <span className="text-xs text-muted-foreground">PNG or JPG, up to 1 MB. Crop away empty margins for the best fit.</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {input("Legal name on the pay slip", "legalName", d.orgName)}
        <div className="space-y-2 md:row-span-2">
          <p className="text-sm font-medium">Registered address</p>
          {address.map((l, i) => (
            <input
              key={i}
              aria-label={`Address line ${i + 1}`}
              className={field}
              value={l}
              onChange={(e) => {
                const next = [...address];
                next[i] = e.target.value;
                set("addressLines", next);
              }}
            />
          ))}
        </div>
        {input("Website", "website", "www.example.com")}
        {input("Email", "email", "payroll@example.com")}
        {input("GSTIN", "gstin")}
        {input("Company PAN", "pan")}
        {input("TAN", "tan")}
        {input("PF establishment code", "pfCode")}
        {input("ESI code", "esiCode")}
        {input("Line at the bottom of the slip", "queryLine", "e.g. For any queries about your pay, write to payroll@example.com")}
      </div>

      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium" htmlFor="psd-employer">Show employer contributions and CTC on the slip</label>
        <Switch id="psd-employer" checked={d.showEmployerContributions} onCheckedChange={(v) => set("showEmployerContributions", v)} />
      </div>

      <EmployeeFieldsEditor value={d.employeeFields} onChange={(v) => set("employeeFields", v)} />

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium" htmlFor="psd-aadhaar">Show employees their full Aadhaar number</label>
          <Switch id="psd-aadhaar" checked={d.showFullAadhaarToEmployee} onCheckedChange={(v) => set("showFullAadhaarToEmployee", v)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Employees always see their own full bank account number on slips they open or download. Admins and emailed
          slips only ever show the last 4 digits. Turning this on also shows employees their full Aadhaar. UIDAI asks
          organisations to show only the last 4 digits on documents, so leave this off unless you&apos;ve checked it&apos;s
          appropriate for you.
        </p>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
      >
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save pay slip details
      </button>
    </div>
  );
}

type FieldRow = PayslipDetails["employeeFields"][number];

/**
 * Which employee details the slip prints, and what each is called. Defaults
 * follow the October reference slip; a field with no value for a person is
 * left off that person's slip automatically.
 */
function EmployeeFieldsEditor({ value, onChange }: { value: FieldRow[]; onChange: (v: FieldRow[]) => void }) {
  const byKey = new Map(value.map((f) => [f.key, f]));
  const update = (key: FieldRow["key"], patch: Partial<FieldRow>) =>
    onChange(value.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const column = (col: "left" | "right", title: string) => (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {PAYSLIP_EMPLOYEE_FIELDS.filter((def) => def.column === col).map((def) => {
        const f = byKey.get(def.key) ?? { key: def.key, show: true, label: "" };
        return (
          <div key={def.key} className="flex items-center gap-3">
            <Switch
              id={`psf-${def.key}`}
              checked={f.show}
              onCheckedChange={(v) => update(def.key, { show: v })}
              aria-label={`Show ${def.source} on the pay slip`}
            />
            <div className="min-w-0 flex-1">
              <input
                className={`${field} h-8 font-mono text-xs uppercase ${f.show ? "" : "opacity-50"}`}
                value={f.label}
                placeholder={def.label}
                maxLength={30}
                disabled={!f.show}
                aria-label={`Label for ${def.source}`}
                onChange={(e) => update(def.key, { label: e.target.value })}
              />
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{def.source}</p>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div>
        <p className="text-sm font-medium">Employee details on the slip</p>
        <p className="text-xs text-muted-foreground">
          Switch off anything you don&apos;t want printed, or rename a label. Details a person doesn&apos;t have are
          left off their slip automatically. Aadhaar only ever shows the last 4 digits.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {column("left", "Left column")}
        {column("right", "Right column")}
      </div>
    </div>
  );
}
