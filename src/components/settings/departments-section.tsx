"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import { Plus, Pencil, Trash2, X, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addDepartment, updateDepartment, deleteDepartment } from "@/actions/departments";
import type { Department } from "@/types";

interface DepartmentsSectionProps {
  departments: Department[];
}

const EMPTY = { name: "", description: "" };

export function DepartmentsSection({ departments }: DepartmentsSectionProps) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Department | null>(null);
  const [form, setForm] = React.useState(EMPTY);
  const [loading, setLoading] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  }

  function openEdit(dept: Department) {
    setEditing(dept);
    setForm({ name: dept.name, description: dept.description ?? "" });
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = editing
      ? await updateDepartment(editing.id, form)
      : await addDepartment(form);
    setLoading(false);
    if (result.success) {
      toast.success(editing ? "Department updated" : "Department added");
      setFormOpen(false);
    } else {
      toast.error(result.error);
    }
  }

  async function handleDelete(dept: Department) {
    if (!confirm(`Delete "${dept.name}"?`)) return;
    setDeleting(dept.id);
    const result = await deleteDepartment(dept.id);
    setDeleting(null);
    if (result.success) {
      toast.success("Department deleted");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold">Departments</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Add and manage team departments.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>

      {departments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No departments yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {departments.map((dept) => (
            <li key={dept.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{dept.name}</p>
                {dept.description && (
                  <p className="text-xs text-muted-foreground">{dept.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(dept)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(dept)}
                  disabled={deleting === dept.id}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add / Edit dialog */}
      <Dialog.Root open={formOpen} onOpenChange={setFormOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex items-center justify-between mb-5">
              <Dialog.Title className="text-lg font-semibold">
                {editing ? "Edit Department" : "Add Department"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">
                  Name <span className="text-destructive">*</span>
                </Label.Root>
                <input
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Engineering"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">Description</Label.Root>
                <input
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </Dialog.Close>
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : editing ? "Save Changes" : "Add Department"}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
