"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Layers, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DestructiveDialog } from "@/components/ui/destructive-dialog";
import {
  createZone,
  updateZone,
  deleteZone,
  assignEmployeeToZone,
  unassignEmployeeFromZones,
  type ZoneRow,
  type ZoneAssignmentRow,
} from "@/actions/attendance-zones";
import type { LocationRow } from "@/actions/attendance-devices";
import type { EmployeeWithDeviceCode } from "@/actions/fingerprint";

const selectCls =
  "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function AttendanceZonesCard({
  initialZones,
  initialAssignments,
  locations,
  employees,
}: {
  initialZones: ZoneRow[];
  initialAssignments: ZoneAssignmentRow[];
  locations: LocationRow[];
  employees: EmployeeWithDeviceCode[];
}) {
  const [zones, setZones] = useState(initialZones);
  const [assignMap, setAssignMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialAssignments.map((a) => [a.employee_id, a.zone_id])),
  );

  // editor: "new" | zoneId | null
  const [editor, setEditor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ZoneRow | null>(null);

  function openNew() {
    setEditor("new");
    setName("");
    setSelected(new Set());
  }
  function openEdit(z: ZoneRow) {
    setEditor(z.id);
    setName(z.name);
    setSelected(new Set(z.location_ids));
  }
  function toggleLoc(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function saveZone() {
    if (!name.trim()) return;
    setSaving(true);
    const locationIds = [...selected];
    const r =
      editor === "new"
        ? await createZone({ name, location_ids: locationIds })
        : await updateZone(editor!, { name, location_ids: locationIds });
    setSaving(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    setZones((prev) => {
      const exists = prev.some((z) => z.id === r.data.id);
      return exists ? prev.map((z) => (z.id === r.data.id ? r.data : z)) : [...prev, r.data];
    });
    setEditor(null);
    toast.success(editor === "new" ? "Zone created" : "Zone updated");
  }

  async function removeZone(z: ZoneRow) {
    const r = await deleteZone(z.id);
    if (r.success) {
      setZones((prev) => prev.filter((x) => x.id !== z.id));
      // Drop any local assignment pointing at the deleted zone.
      setAssignMap((prev) => {
        const next = { ...prev };
        for (const [emp, zid] of Object.entries(next)) if (zid === z.id) delete next[emp];
        return next;
      });
      toast.success("Zone removed");
    } else toast.error(r.error);
    setDeleting(null);
  }

  async function changeAssignment(employeeId: string, zoneId: string) {
    const prev = assignMap[employeeId] ?? "";
    // optimistic
    setAssignMap((m) => {
      const next = { ...m };
      if (zoneId) next[employeeId] = zoneId;
      else delete next[employeeId];
      return next;
    });
    const r = zoneId
      ? await assignEmployeeToZone({ employee_id: employeeId, zone_id: zoneId })
      : await unassignEmployeeFromZones(employeeId);
    if (!r.success) {
      toast.error(r.error);
      // revert
      setAssignMap((m) => {
        const next = { ...m };
        if (prev) next[employeeId] = prev;
        else delete next[employeeId];
        return next;
      });
    }
  }

  return (
    <div className="space-y-4 border-t border-border px-6 py-5">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="h-4 w-4" /> Attendance Zones
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Group locations into a zone, then assign employees. A punch from any device in an
          employee&apos;s zone counts toward their day; punches outside it are ignored. Unassigned
          employees pool punches from all locations.
        </p>
      </div>

      {/* Zones list */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Zones</span>
          {editor === null && (
            <Button size="sm" variant="outline" onClick={openNew}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New zone
            </Button>
          )}
        </div>

        {zones.length === 0 && editor === null && (
          <p className="text-sm text-muted-foreground">
            No zones yet. Create one to start pooling locations.
          </p>
        )}

        {zones.length > 0 && (
          <ul className="mb-2 divide-y divide-border rounded-lg border border-border">
            {zones.map((z) => (
              <li key={z.id} className="flex items-center justify-between gap-3 p-2.5">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{z.name}</span>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {z.location_names.length > 0
                      ? z.location_names.join(", ")
                      : "No locations — assigned employees will have nothing counted"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(z)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(z)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Inline create/edit editor */}
        {editor !== null && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Zone name (e.g. Pune sites)"
            />
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Locations in this zone</p>
              {locations.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add locations under &quot;Biometric Devices&quot; first.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {locations.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.has(l.id)}
                        onChange={() => toggleLoc(l.id)}
                        className="h-3.5 w-3.5"
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveZone} disabled={saving || !name.trim()}>
                {saving ? "Saving…" : editor === "new" ? "Create zone" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Employee assignment */}
      {zones.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Employee zones</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {employees.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 p-2.5">
                <div className="min-w-0">
                  <span className="truncate text-sm">
                    {e.first_name} {e.last_name}
                  </span>
                  <p className="truncate text-xs text-muted-foreground">{e.email}</p>
                </div>
                <select
                  className={selectCls}
                  value={assignMap[e.id] ?? ""}
                  onChange={(ev) => changeAssignment(e.id, ev.target.value)}
                >
                  <option value="">No zone (all locations)</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DestructiveDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Remove zone?"
        description={
          deleting
            ? `"${deleting.name}" and its employee assignments will be removed. Past attendance is kept.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => deleting && removeZone(deleting)}
      />
    </div>
  );
}
