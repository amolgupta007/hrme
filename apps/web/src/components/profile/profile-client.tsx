"use client";

import * as React from "react";
import * as Label from "@radix-ui/react-label";
import * as Select from "@radix-ui/react-select";
import { Pencil, X, ChevronDown, User, Copy, AlertCircle, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn, getInitials, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { updateMyProfile, updateEmergencyContact, updateMyAvatar, removeMyAvatar } from "@/actions/profile";
import { maskPAN, maskAadhar, calcAge } from "@/lib/profile-utils";
import type { EmployeeProfile, Address } from "@/actions/profile";

const inputCnBase =
  "flex h-10 w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50";
const inputCn = cn(inputCnBase, "border-input focus:ring-ring");
const inputErrCn = cn(inputCnBase, "border-destructive focus:ring-destructive");

const EMPTY_ADDRESS: Address = { line1: "", line2: "", city: "", state: "", pincode: "" };

const AVATAR_MAX_DIM = 512;

/** Resize + re-encode to JPEG ≤512px on the long edge (EXIF orientation respected). */
async function downscaleImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, AVATAR_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unsupported");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) throw new Error("encode failed");
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

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
  const [avatarUrl, setAvatarUrl] = React.useState(profile.avatar_url);
  const [avatarBusy, setAvatarBusy] = React.useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setAvatarBusy(true);
    try {
      // Downscale in the browser: phone photos routinely exceed upload limits,
      // and an avatar never needs more than 512px. Falls back to the original
      // file if decoding fails (e.g. exotic formats) — server limits still apply.
      const upload = await downscaleImage(file).catch(() => file);
      const fd = new FormData();
      fd.append("file", upload);
      const result = await updateMyAvatar(fd);
      if (result.success) {
        setAvatarUrl(result.data.avatarUrl);
        toast.success("Profile photo updated");
      } else {
        toast.error(result.error);
      }
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarBusy(true);
    try {
      const result = await removeMyAvatar();
      if (result.success) {
        setAvatarUrl(null);
        toast.success("Profile photo removed");
      } else {
        toast.error(result.error);
      }
    } finally {
      setAvatarBusy(false);
    }
  }

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

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
    emergencyContactName: profile.emergency_contact_name ?? "",
    emergencyContactPhone: profile.emergency_contact_phone ?? "",
    emergencyContactRelationship: profile.emergency_contact_relationship ?? "",
  });

  const [whatsappOptIn, setWhatsappOptIn] = React.useState(profile.whatsapp_opt_in ?? false);

  function clearError(...keys: string[]) {
    setFieldErrors((prev) => {
      if (keys.every((k) => !(k in prev)) && !("_form" in prev)) return prev;
      const next = { ...prev };
      for (const k of keys) delete next[k];
      delete next._form;
      return next;
    });
  }

  function setField(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    clearError(field as string);
  }

  function setAddr(type: "communicationAddress" | "permanentAddress", field: keyof Address, value: string) {
    setForm((f) => ({
      ...f,
      [type]: { ...(f[type] as Address), [field]: value },
      ...(type === "communicationAddress" && sameAddress
        ? { permanentAddress: { ...(f.communicationAddress as Address), [field]: value } }
        : {}),
    }));
    clearError(`${type}.${field}`, type);
  }

  function handleSameAddress(checked: boolean) {
    setSameAddress(checked);
    if (checked) setForm((f) => ({ ...f, permanentAddress: { ...f.communicationAddress } }));
  }

  async function handleSave() {
    setLoading(true);
    setFieldErrors({});
    const [profileRes, emergencyRes] = await Promise.all([
      updateMyProfile(profile.id, {
        ...form,
        maritalStatus: form.maritalStatus,
        whatsapp_opt_in: whatsappOptIn,
      }),
      updateEmergencyContact({
        name: form.emergencyContactName,
        phone: form.emergencyContactPhone,
        relationship: form.emergencyContactRelationship,
      }),
    ]);
    setLoading(false);

    if (profileRes.success && emergencyRes.success) {
      toast.success("Profile updated");
      setEditing(false);
      return;
    }

    const merged: Record<string, string> = {};
    if (!profileRes.success && profileRes.fieldErrors) Object.assign(merged, profileRes.fieldErrors);
    if (!emergencyRes.success && emergencyRes.fieldErrors) Object.assign(merged, emergencyRes.fieldErrors);
    setFieldErrors(merged);

    const summary = !profileRes.success ? profileRes.error : !emergencyRes.success ? emergencyRes.error : "Validation failed";
    toast.error(summary);
  }

  const fullName = `${profile.first_name} ${profile.last_name}`;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-xl font-bold overflow-hidden">
              {avatarUrl ? (
                <img src={avatarUrl} alt={fullName} className="h-16 w-16 object-cover rounded-full" />
              ) : (
                getInitials(fullName)
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <button
              type="button"
              aria-label="Change profile photo"
              title="Change profile photo"
              disabled={avatarBusy}
              onClick={() => avatarInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground disabled:opacity-50"
            >
              {avatarBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div>
            <h2 className="text-xl font-bold">{fullName}</h2>
            <p className="text-sm text-muted-foreground">{profile.designation ?? "—"}</p>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">{profile.role} · {profile.employment_type.replace("_", " ")}</p>
            {(profile.manager_name || profile.manager_2_name) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Reports to {[profile.manager_name, profile.manager_2_name].filter(Boolean).join(" · ")}
              </p>
            )}
            {avatarUrl && !avatarBusy && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
              >
                Remove photo
              </button>
            )}
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

      {/* Top-level validation banner (form-level errors that don't map to a single field) */}
      {editing && Object.keys(fieldErrors).length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm text-destructive">
            <p className="font-medium">Please fix {Object.keys(fieldErrors).length === 1 ? "this issue" : "these issues"}:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              {Object.entries(fieldErrors).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Name */}
      <Section title="Name">
        <div className="grid grid-cols-3 gap-4">
          <Field label="First Name" error={fieldErrors.firstName}>
            {editing ? <input className={fieldErrors.firstName ? inputErrCn : inputCn} value={form.firstName} onChange={(e) => setField("firstName", e.target.value)} /> : <Value>{profile.first_name}</Value>}
          </Field>
          <Field label="Last Name" error={fieldErrors.lastName}>
            {editing ? <input className={fieldErrors.lastName ? inputErrCn : inputCn} value={form.lastName} onChange={(e) => setField("lastName", e.target.value)} /> : <Value>{profile.last_name}</Value>}
          </Field>
          <Field label="Title / Designation" error={fieldErrors.designation}>
            {editing ? <input className={fieldErrors.designation ? inputErrCn : inputCn} value={form.designation} onChange={(e) => setField("designation", e.target.value)} placeholder="e.g. Software Engineer" /> : <Value>{profile.designation}</Value>}
          </Field>
        </div>
      </Section>

      {/* Demographic */}
      <Section title="Demographic Information">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Country" error={fieldErrors.country}>
            {editing ? <input className={fieldErrors.country ? inputErrCn : inputCn} value={form.country} onChange={(e) => setField("country", e.target.value)} placeholder="India" /> : <Value>{profile.country ?? "India"}</Value>}
          </Field>
          <Field label="Marital Status" error={fieldErrors.maritalStatus}>
            {editing ? (
              <SimpleSelect value={form.maritalStatus} onChange={(v) => setField("maritalStatus", v)} placeholder="Select" options={["Single", "Married", "Divorced", "Widowed", "Prefer not to say"]} />
            ) : <Value>{profile.marital_status}</Value>}
          </Field>
          <Field label="Gender" error={fieldErrors.gender}>
            {editing ? (
              <SimpleSelect value={form.gender} onChange={(v) => setField("gender", v)} placeholder="Select" options={["Male", "Female", "Non-binary", "Prefer not to say", "Other"]} />
            ) : <Value>{profile.gender}</Value>}
          </Field>
        </div>
      </Section>

      {/* National Identifiers */}
      <Section title="National Identifiers">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Permanent Account Number (PAN)" error={fieldErrors.panNumber}>
            {editing ? (
              <input className={fieldErrors.panNumber ? inputErrCn : inputCn} value={form.panNumber} onChange={(e) => setField("panNumber", e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
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
          <Field label="Aadhar Number" error={fieldErrors.aadharNumber}>
            {editing ? (
              <input className={fieldErrors.aadharNumber ? inputErrCn : inputCn} value={form.aadharNumber} onChange={(e) => setField("aadharNumber", e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="12-digit Aadhar number" maxLength={12} />
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
          <Field label="Personal Email" error={fieldErrors.personalEmail}>
            {editing
              ? <input type="email" className={fieldErrors.personalEmail ? inputErrCn : inputCn} value={form.personalEmail} onChange={(e) => setField("personalEmail", e.target.value)} placeholder="personal@example.com" />
              : <Value>{profile.personal_email}</Value>}
          </Field>
          <Field label="Mobile Number" error={fieldErrors.phone}>
            {editing
              ? <input type="tel" className={fieldErrors.phone ? inputErrCn : inputCn} value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="+91 98765 43210" />
              : <Value>{profile.phone}</Value>}
          </Field>
          <div className="col-span-3">
            {editing ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={whatsappOptIn} onChange={(e) => setWhatsappOptIn(e.target.checked)} />
                Receive WhatsApp notifications (requires a valid phone number on file)
              </label>
            ) : (
              <Field label="WhatsApp Notifications">
                <Value>{profile.whatsapp_opt_in ? "Enabled" : "Disabled"}</Value>
              </Field>
            )}
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-border space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Communication Address</p>
          <AddressFields
            address={editing ? form.communicationAddress : toAddress(profile.communication_address)}
            editing={editing}
            onChange={(f, v) => setAddr("communicationAddress", f, v)}
            sectionError={fieldErrors.communicationAddress}
            errors={{
              line1: fieldErrors["communicationAddress.line1"],
              line2: fieldErrors["communicationAddress.line2"],
              city: fieldErrors["communicationAddress.city"],
              state: fieldErrors["communicationAddress.state"],
              pincode: fieldErrors["communicationAddress.pincode"],
            }}
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
            sectionError={fieldErrors.permanentAddress}
            errors={{
              line1: fieldErrors["permanentAddress.line1"],
              line2: fieldErrors["permanentAddress.line2"],
              city: fieldErrors["permanentAddress.city"],
              state: fieldErrors["permanentAddress.state"],
              pincode: fieldErrors["permanentAddress.pincode"],
            }}
          />
        </div>
      </Section>

      {/* Biographical */}
      <Section title="Biographical Information">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Date of Birth" error={fieldErrors.dateOfBirth}>
            {editing ? (
              <input type="date" className={fieldErrors.dateOfBirth ? inputErrCn : inputCn} value={form.dateOfBirth} onChange={(e) => setField("dateOfBirth", e.target.value)} />
            ) : <Value>{profile.date_of_birth ? formatDate(profile.date_of_birth) : null}</Value>}
          </Field>
          <Field label="Age">
            <Value>{calcAge(profile.date_of_birth)}</Value>
          </Field>
          <Field label="Pronouns" error={fieldErrors.pronouns}>
            {editing ? (
              <input className={fieldErrors.pronouns ? inputErrCn : inputCn} value={form.pronouns} onChange={(e) => setField("pronouns", e.target.value)} placeholder="e.g. he/him, she/her, they/them" />
            ) : <Value>{profile.pronouns}</Value>}
          </Field>
        </div>
      </Section>

      {/* Emergency Contact */}
      <Section title="Emergency Contact">
        <Field label="Name" error={fieldErrors["emergency.name"]}>
          {editing
            ? <input className={fieldErrors["emergency.name"] ? inputErrCn : inputCn} value={form.emergencyContactName} onChange={(e) => { setField("emergencyContactName", e.target.value); clearError("emergency.name"); }} placeholder="Full name" />
            : <Value>{profile.emergency_contact_name}</Value>}
        </Field>
        <Field label="Phone" error={fieldErrors["emergency.phone"]}>
          {editing
            ? <input type="tel" className={fieldErrors["emergency.phone"] ? inputErrCn : inputCn} value={form.emergencyContactPhone} onChange={(e) => { setField("emergencyContactPhone", e.target.value); clearError("emergency.phone"); }} placeholder="+91 98765 43210" />
            : <Value>{profile.emergency_contact_phone}</Value>}
        </Field>
        <Field label="Relationship" error={fieldErrors["emergency.relationship"]}>
          {editing
            ? <input className={fieldErrors["emergency.relationship"] ? inputErrCn : inputCn} value={form.emergencyContactRelationship} onChange={(e) => { setField("emergencyContactRelationship", e.target.value); clearError("emergency.relationship"); }} placeholder="e.g. Spouse, Parent, Sibling" />
            : <Value>{profile.emergency_contact_relationship}</Value>}
        </Field>
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

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label.Root className={cn(
        "text-xs font-medium uppercase tracking-wide flex items-center gap-1.5",
        error ? "text-destructive" : "text-muted-foreground"
      )}>
        {label}
        {error && <AlertCircle className="h-3 w-3" />}
      </Label.Root>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
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

function AddressFields({ address, editing, onChange, errors, sectionError }: {
  address: Address;
  editing: boolean;
  onChange: (field: keyof Address, value: string) => void;
  errors?: { line1?: string; line2?: string; city?: string; state?: string; pincode?: string };
  sectionError?: string;
}) {
  const e = errors ?? {};
  return (
    <div className="space-y-3">
      {sectionError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{sectionError}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Address Line 1" error={e.line1}>
          {editing ? <input className={e.line1 ? inputErrCn : inputCn} value={address.line1} onChange={(ev) => onChange("line1", ev.target.value)} placeholder="Street / Flat no." /> : <Value>{address.line1}</Value>}
        </Field>
        <Field label="Address Line 2" error={e.line2}>
          {editing ? <input className={e.line2 ? inputErrCn : inputCn} value={address.line2} onChange={(ev) => onChange("line2", ev.target.value)} placeholder="Area / Landmark" /> : <Value>{address.line2}</Value>}
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="City" error={e.city}>
          {editing ? <input className={e.city ? inputErrCn : inputCn} value={address.city} onChange={(ev) => onChange("city", ev.target.value)} placeholder="City" /> : <Value>{address.city}</Value>}
        </Field>
        <Field label="State" error={e.state}>
          {editing ? <input className={e.state ? inputErrCn : inputCn} value={address.state} onChange={(ev) => onChange("state", ev.target.value)} placeholder="State" /> : <Value>{address.state}</Value>}
        </Field>
        <Field label="Pincode" error={e.pincode}>
          {editing ? <input className={e.pincode ? inputErrCn : inputCn} value={address.pincode} onChange={(ev) => onChange("pincode", ev.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit pincode" maxLength={6} /> : <Value>{address.pincode}</Value>}
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
