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
