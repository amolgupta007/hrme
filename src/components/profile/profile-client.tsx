"use client";

import * as React from "react";
import * as Label from "@radix-ui/react-label";
import * as Select from "@radix-ui/react-select";
import { Pencil, X, ChevronDown, User, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn, getInitials, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { updateMyProfile } from "@/actions/profile";
import { maskPAN, maskAadhar, calcAge } from "@/lib/profile-utils";
import type { EmployeeProfile, Address } from "@/actions/profile";

const inputCn =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50";

const EMPTY_ADDRESS: Address = { line1: "", line2: "", city: "", state: "", pincode: "" };

function toAddress(v: unknown): Address {
  if (!v || typeof v !== "object") return EMPTY_ADDRESS;
  const a = v as Partial<Address>;
  return {
    line1: a.line1 ?? "",
    line2: a.line2 ?? "",
    city: a.city ?? "",
    state: a.state ?? "",
    pincode: a.pincode ?? "",
  };
}

export function ProfileClient({ profile }: { profile: EmployeeProfile }) {
  const [editing, setEditing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [sameAddress, setSameAddress] = React.useState(false);

  const [form, setForm] = React.useState({
    firstName: profile.first_name,
    lastName: profile.last_name,
    designation: profile.designation ?? "",
    gender: profile.gender ?? "",
    pronouns: profile.pronouns ?? "",
    maritalStatus: profile.marital_status ?? "",
    country: profile.country ?? "India",
    dateOfBirth: profile.date_of_birth ?? "",
    panNumber: profile.pan_number ?? "",
    aadharNumber: profile.aadhar_number ?? "",
    personalEmail: profile.personal_email ?? "",
    phone: profile.phone ?? "",
    communicationAddress: toAddress(profile.communication_address),
    permanentAddress: toAddress(profile.permanent_address),
  });

  function setField(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setAddr(type: "communicationAddress" | "permanentAddress", field: keyof Address, value: string) {
    setForm((f) => ({
      ...f,
      [type]: { ...(f[type] as Address), [field]: value },
      ...(type === "communicationAddress" && sameAddress
        ? { permanentAddress: { ...(f.communicationAddress as Address), [field]: value } }
        : {}),
    }));
  }

  function handleSameAddress(checked: boolean) {
    setSameAddress(checked);
    if (checked) setForm((f) => ({ ...f, permanentAddress: { ...f.communicationAddress } }));
  }

  async function handleSave() {
    setLoading(true);
    const result = await updateMyProfile(profile.id, {
      ...form,
      maritalStatus: form.maritalStatus,
    });
    setLoading(false);
    if (result.success) {
      toast.success("Profile updated");
      setEditing(false);
    } else {
      toast.error(result.error);
    }
  }

  const fullName = `${profile.first_name} ${profile.last_name}`;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-xl font-bold shrink-0">
            {getInitials(fullName)}
          </div>
          <div>
            <h2 className="text-xl font-bold">{fullName}</h2>
            <p className="text-sm text-muted-foreground">{profile.designation ?? "—"}</p>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">{profile.role} · {profile.employment_type.replace("_", " ")}</p>
          </div>
        </div>
        {!editing ? (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit Profile
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={loading}>
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>

      {/* Name */}
      <Section title="Name">
        <div className="grid grid-cols-3 gap-4">
          <Field label="First Name">
            {editing ? <input className={inputCn} value={form.firstName} onChange={(e) => setField("firstName", e.target.value)} /> : <Value>{profile.first_name}</Value>}
          </Field>
          <Field label="Last Name">
            {editing ? <input className={inputCn} value={form.lastName} onChange={(e) => setField("lastName", e.target.value)} /> : <Value>{profile.last_name}</Value>}
          </Field>
          <Field label="Title / Designation">
            {editing ? <input className={inputCn} value={form.designation} onChange={(e) => setField("designation", e.target.value)} placeholder="e.g. Software Engineer" /> : <Value>{profile.designation}</Value>}
          </Field>
        </div>
      </Section>

      {/* Demographic */}
      <Section title="Demographic Information">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Country">
            {editing ? <input className={inputCn} value={form.country} onChange={(e) => setField("country", e.target.value)} placeholder="India" /> : <Value>{profile.country ?? "India"}</Value>}
          </Field>
          <Field label="Marital Status">
            {editing ? (
              <SimpleSelect value={form.maritalStatus} onChange={(v) => setField("maritalStatus", v)} placeholder="Select" options={["Single", "Married", "Divorced", "Widowed", "Prefer not to say"]} />
            ) : <Value>{profile.marital_status}</Value>}
          </Field>
          <Field label="Gender">
            {editing ? (
              <SimpleSelect value={form.gender} onChange={(v) => setField("gender", v)} placeholder="Select" options={["Male", "Female", "Non-binary", "Prefer not to say", "Other"]} />
            ) : <Value>{profile.gender}</Value>}
          </Field>
        </div>
      </Section>

      {/* National Identifiers */}
      <Section title="National Identifiers">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Permanent Account Number (PAN)">
            {editing ? (
              <input className={inputCn} value={form.panNumber} onChange={(e) => setField("panNumber", e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
            ) : (
              <div className="flex items-center gap-2">
                <Value className="font-mono">{maskPAN(profile.pan_number)}</Value>
                {profile.pan_number && (
                  <button className="text-muted-foreground hover:text-foreground" title="Copy PAN"
                    onClick={() => { navigator.clipboard.writeText(profile.pan_number!); toast.success("PAN copied"); }}>
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </Field>
          <Field label="Aadhar Number">
            {editing ? (
              <input className={inputCn} value={form.aadharNumber} onChange={(e) => setField("aadharNumber", e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="12-digit Aadhar number" maxLength={12} />
            ) : (
              <div className="flex items-center gap-2">
                <Value className="font-mono">{maskAadhar(profile.aadhar_number)}</Value>
                {profile.aadhar_number && (
                  <button className="text-muted-foreground hover:text-foreground" title="Copy Aadhar"
                    onClick={() => { navigator.clipboard.writeText(profile.aadhar_number!); toast.success("Aadhar copied"); }}>
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Sensitive identifiers are masked for display. Only you and HR admins can access these.</p>
      </Section>

      {/* Contact Information */}
      <Section title="Contact Information">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Company Email">
            <Value className="text-muted-foreground">{profile.email}</Value>
          </Field>
          <Field label="Personal Email">
            {editing
              ? <input type="email" className={inputCn} value={form.personalEmail} onChange={(e) => setField("personalEmail", e.target.value)} placeholder="personal@example.com" />
              : <Value>{profile.personal_email}</Value>}
          </Field>
          <Field label="Mobile Number">
            {editing
              ? <input type="tel" className={inputCn} value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="+91 98765 43210" />
              : <Value>{profile.phone}</Value>}
          </Field>
        </div>

        <div className="mt-5 pt-5 border-t border-border space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Communication Address</p>
          <AddressFields
            address={editing ? form.communicationAddress : toAddress(profile.communication_address)}
            editing={editing}
            onChange={(f, v) => setAddr("communicationAddress", f, v)}
          />
        </div>

        <div className="mt-5 pt-5 border-t border-border space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Permanent Address</p>
            {editing && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={sameAddress} onChange={(e) => handleSameAddress(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary" />
                <span className="text-sm text-muted-foreground">Same as communication address</span>
              </label>
            )}
          </div>
          <AddressFields
            address={editing ? form.permanentAddress : toAddress(profile.permanent_address)}
            editing={editing && !sameAddress}
            onChange={(f, v) => setAddr("permanentAddress", f, v)}
          />
        </div>
      </Section>

      {/* Biographical */}
      <Section title="Biographical Information">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Date of Birth">
            {editing ? (
              <input type="date" className={inputCn} value={form.dateOfBirth} onChange={(e) => setField("dateOfBirth", e.target.value)} />
            ) : <Value>{profile.date_of_birth ? formatDate(profile.date_of_birth) : null}</Value>}
          </Field>
          <Field label="Age">
            <Value>{calcAge(profile.date_of_birth)}</Value>
          </Field>
          <Field label="Pronouns">
            {editing ? (
              <input className={inputCn} value={form.pronouns} onChange={(e) => setField("pronouns", e.target.value)} placeholder="e.g. he/him, she/her, they/them" />
            ) : <Value>{profile.pronouns}</Value>}
          </Field>
        </div>
      </Section>
    </div>
  );
}

// ---- Sub-components ----

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label.Root className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label.Root>
      {children}
    </div>
  );
}

function Value({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-sm font-medium min-h-[1.5rem]", !children && "text-muted-foreground", className)}>
      {children || "—"}
    </p>
  );
}

function AddressFields({ address, editing, onChange }: {
  address: Address;
  editing: boolean;
  onChange: (field: keyof Address, value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Address Line 1">
          {editing ? <input className={inputCn} value={address.line1} onChange={(e) => onChange("line1", e.target.value)} placeholder="Street / Flat no." /> : <Value>{address.line1}</Value>}
        </Field>
        <Field label="Address Line 2">
          {editing ? <input className={inputCn} value={address.line2} onChange={(e) => onChange("line2", e.target.value)} placeholder="Area / Landmark" /> : <Value>{address.line2}</Value>}
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="City">
          {editing ? <input className={inputCn} value={address.city} onChange={(e) => onChange("city", e.target.value)} placeholder="City" /> : <Value>{address.city}</Value>}
        </Field>
        <Field label="State">
          {editing ? <input className={inputCn} value={address.state} onChange={(e) => onChange("state", e.target.value)} placeholder="State" /> : <Value>{address.state}</Value>}
        </Field>
        <Field label="Pincode">
          {editing ? <input className={inputCn} value={address.pincode} onChange={(e) => onChange("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit pincode" maxLength={6} /> : <Value>{address.pincode}</Value>}
        </Field>
      </div>
    </div>
  );
}

const NONE = "__none__";
function SimpleSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string;
}) {
  return (
    <Select.Root value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <Select.Trigger className={cn(inputCn, "flex items-center justify-between cursor-pointer")}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon><ChevronDown className="h-4 w-4 opacity-50" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 max-h-60 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
          <Select.Viewport className="p-1">
            <Select.Item value={NONE} className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent">
              <Select.ItemText>{placeholder}</Select.ItemText>
            </Select.Item>
            {options.map((opt) => (
              <Select.Item key={opt} value={opt} className="flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent">
                <Select.ItemText>{opt}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
