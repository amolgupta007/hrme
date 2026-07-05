"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Server } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  registerDevice,
  updateDevice,
  type DeviceRow,
  type LocationRow,
} from "@/actions/attendance-devices";

// Production ADMS endpoint customers point their device at.
const ADMS_HOST = "jambahr.com";

const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function SetupRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (v: string) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={() => onCopy(value)}
        className="inline-flex items-center gap-1 font-mono hover:text-primary"
      >
        {value}
        <Copy className="h-3 w-3 opacity-60" />
      </button>
    </li>
  );
}

export function RegisterDeviceDialog({
  locations,
  initial,
  onClose,
  onSaved,
}: {
  locations: LocationRow[];
  initial?: DeviceRow;
  onClose: () => void;
  onSaved: (d: DeviceRow) => void;
}) {
  const isEdit = !!initial;
  const [serial, setSerial] = useState(initial?.device_serial ?? "");
  const [locationId, setLocationId] = useState(initial?.location_id ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const r = isEdit
      ? await updateDevice(initial!.id, { location_id: locationId || null, label })
      : await registerDevice({
          device_serial: serial,
          location_id: locationId || null,
          label,
        });
    setSaving(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    const locName = locations.find((l) => l.id === locationId)?.name ?? null;
    onSaved(
      isEdit
        ? { ...initial!, location_id: locationId || null, label: label || null, location_name: locName }
        : (r.data as DeviceRow),
    );
    toast.success(isEdit ? "Device updated" : "Device registered");
    onClose();
  }

  function copy(t: string) {
    navigator.clipboard.writeText(t).then(() => toast.success("Copied"));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit device" : "Register a biometric device"}</DialogTitle>
          <DialogDescription>
            Add your ZKTeco / eSSL device, then point it at JambaHR with the settings below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Serial number</Label>
            <Input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              disabled={isEdit}
              placeholder="e.g. GED7261303087"
            />
            <p className="text-xs text-muted-foreground">
              On the device: Menu → System Info (or the sticker on the back). Must match exactly —
              JambaHR identifies the device by this serial.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Location</Label>
            <select
              className={selectCls}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">— No location —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Label (optional)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Front desk K40 Pro"
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-2">
            <p className="font-medium flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" /> On the device: Menu → Comm → Cloud Server (ADMS)
            </p>
            <ul className="space-y-1">
              <SetupRow label="Server Mode" value="ADMS" onCopy={copy} />
              <SetupRow label="Server Address" value={ADMS_HOST} onCopy={copy} />
              <SetupRow label="Server Port" value="443" onCopy={copy} />
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">HTTPS / Encrypt</span>
                <span className="font-mono">ON</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Enable Domain Name</span>
                <span className="font-mono">ON</span>
              </li>
            </ul>
            <p className="text-muted-foreground">
              Reboot the device after saving — it connects within ~30s. Punches appear here once you
              map each employee&apos;s PIN below.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || (!isEdit && serial.trim().length < 3)}>
            {saving ? "Saving…" : isEdit ? "Save" : "Register device"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
