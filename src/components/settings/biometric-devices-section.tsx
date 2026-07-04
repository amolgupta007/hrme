"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  MapPin,
  Cpu,
  Fingerprint,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  ListChecks,
  RefreshCw,
} from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DestructiveDialog } from "@/components/ui/destructive-dialog";
import { RegisterDeviceDialog } from "./register-device-dialog";
import { IngestSecurityCard } from "./ingest-security-card";
import {
  createLocation,
  deleteLocation,
  deleteDevice,
  syncAllUsersToDevices,
  retryFailedCommands,
  getProvisioningStatus,
  type LocationRow,
  type DeviceRow,
} from "@/actions/attendance-devices";
import {
  updateEmployeeDeviceCode,
  type EmployeeWithDeviceCode,
} from "@/actions/fingerprint";

type Tone = "green" | "amber" | "gray";

function statusOf(lastSeen: string | null): { text: string; tone: Tone } {
  if (!lastSeen) return { text: "Waiting for device", tone: "amber" };
  const min = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60_000);
  if (min < 5) return { text: "Connected", tone: "green" };
  if (min < 60) return { text: `Last seen ${min}m ago`, tone: "gray" };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { text: `Last seen ${hr}h ago`, tone: "gray" };
  return { text: `Last seen ${Math.floor(hr / 24)}d ago`, tone: "gray" };
}

const toneCls: Record<Tone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  gray: "bg-muted-foreground/50",
};

export function BiometricDevicesSection({
  initialLocations,
  initialDevices,
  initialEmployees,
}: {
  initialLocations: LocationRow[];
  initialDevices: DeviceRow[];
  initialEmployees: EmployeeWithDeviceCode[];
}) {
  const [locations, setLocations] = useState(initialLocations);
  const [devices, setDevices] = useState(initialDevices);
  const [employees, setEmployees] = useState(initialEmployees);

  // Setup help: guide expanded by default until they have a device; per-device troubleshoot.
  const [showGuide, setShowGuide] = useState(initialDevices.length === 0);
  const [troubleshootId, setTroubleshootId] = useState<string | null>(null);

  // Device dialog
  const [deviceDialog, setDeviceDialog] = useState<{ open: boolean; editing?: DeviceRow }>(
    { open: false },
  );
  const [deletingDevice, setDeletingDevice] = useState<DeviceRow | null>(null);

  // Location add
  const [locName, setLocName] = useState("");
  const [locAddr, setLocAddr] = useState("");
  const [addingLoc, setAddingLoc] = useState(false);
  const [deletingLoc, setDeletingLoc] = useState<LocationRow | null>(null);

  // PIN editing
  const [pinEdits, setPinEdits] = useState<Record<string, string>>({});
  const [savingPin, setSavingPin] = useState<string | null>(null);

  // Device user sync (push employees → devices via ADMS command queue)
  const [syncStatus, setSyncStatus] = useState<{
    pending: number;
    sent: number;
    confirmed: number;
    failed: number;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refreshSyncStatus = useCallback(async () => {
    const res = await getProvisioningStatus();
    if (res.success) setSyncStatus(res.data);
  }, []);

  useEffect(() => {
    refreshSyncStatus();
  }, [refreshSyncStatus]);

  async function handleSyncAll() {
    setSyncing(true);
    const res = await syncAllUsersToDevices();
    setSyncing(false);
    if (res.success) {
      toast.success(`Queued ${res.data.enqueued} user update(s) to devices`);
      refreshSyncStatus();
    } else {
      toast.error(res.error);
    }
  }

  async function handleRetryFailed() {
    const res = await retryFailedCommands();
    if (res.success) {
      toast.success(`Re-queued ${res.data.retried} failed command(s)`);
      refreshSyncStatus();
    } else {
      toast.error(res.error);
    }
  }

  const mappedCount = useMemo(
    () => employees.filter((e) => e.device_code).length,
    [employees],
  );

  async function addLocation() {
    if (!locName.trim()) return;
    setAddingLoc(true);
    const r = await createLocation({ name: locName, address: locAddr || null });
    setAddingLoc(false);
    if (r.success) {
      setLocations((p) => [...p, r.data]);
      setLocName("");
      setLocAddr("");
      toast.success("Location added");
    } else toast.error(r.error);
  }

  async function removeLocation(loc: LocationRow) {
    const r = await deleteLocation(loc.id);
    if (r.success) {
      setLocations((p) => p.filter((l) => l.id !== loc.id));
      setDevices((p) =>
        p.map((d) => (d.location_id === loc.id ? { ...d, location_id: null, location_name: null } : d)),
      );
      toast.success("Location removed");
    } else toast.error(r.error);
    setDeletingLoc(null);
  }

  async function removeDevice(dev: DeviceRow) {
    const r = await deleteDevice(dev.id);
    if (r.success) {
      setDevices((p) => p.filter((d) => d.id !== dev.id));
      toast.success("Device removed");
    } else toast.error(r.error);
    setDeletingDevice(null);
  }

  async function savePin(empId: string) {
    const code = (pinEdits[empId] ?? "").trim();
    setSavingPin(empId);
    const r = await updateEmployeeDeviceCode(empId, code || null);
    setSavingPin(null);
    if (r.success) {
      setEmployees((p) =>
        p.map((e) => (e.id === empId ? { ...e, device_code: code || null } : e)),
      );
      setPinEdits((p) => {
        const n = { ...p };
        delete n[empId];
        return n;
      });
      toast.success("PIN saved");
    } else toast.error(r.error);
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4" />
          Biometric Devices
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Connect ZKTeco / eSSL fingerprint devices over their native cloud (ADMS) push. Register a
          device, point it at JambaHR, and map each employee&apos;s device PIN — punches then flow
          straight into Attendance.
        </p>

        <SetupGuide open={showGuide} onToggle={() => setShowGuide((v) => !v)} />

        {/* ---- Devices ---- */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Devices</p>
            <Button size="sm" onClick={() => setDeviceDialog({ open: true })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Register device
            </Button>
          </div>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No devices yet. Register your first device to get its setup instructions.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {devices.map((d) => {
                const st = statusOf(d.last_seen_at);
                return (
                  <li key={d.id} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${toneCls[st.tone]}`} />
                          <span className="truncate text-sm font-medium">
                            {d.label || d.device_serial}
                          </span>
                          {!d.is_active && (
                            <span className="text-[10px] text-muted-foreground">Inactive</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {d.device_serial}
                          {d.location_name ? ` · ${d.location_name}` : ""} · {st.text}
                          {d.last_punch_at
                            ? ` · last punch ${new Date(d.last_punch_at).toLocaleString()}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {st.tone === "amber" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setTroubleshootId(troubleshootId === d.id ? null : d.id)
                            }
                          >
                            <HelpCircle className="mr-1 h-3.5 w-3.5" /> Not connecting?
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeviceDialog({ open: true, editing: d })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeletingDevice(d)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {troubleshootId === d.id && <TroubleshootBox serial={d.device_serial} />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ---- Locations ---- */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="h-3.5 w-3.5" /> Locations
          </p>
          {locations.length > 0 && (
            <ul className="mb-2 divide-y divide-border rounded-lg border border-border">
              {locations.map((l) => (
                <li key={l.id} className="flex items-center justify-between p-2.5">
                  <div className="min-w-0">
                    <span className="text-sm">{l.name}</span>
                    {l.address && (
                      <p className="truncate text-xs text-muted-foreground">{l.address}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setDeletingLoc(l)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={locName}
              onChange={(e) => setLocName(e.target.value)}
              placeholder="Location name (e.g. Head Office)"
              className="sm:flex-1"
            />
            <Input
              value={locAddr}
              onChange={(e) => setLocAddr(e.target.value)}
              placeholder="Address (optional)"
              className="sm:flex-1"
            />
            <Button onClick={addLocation} disabled={addingLoc || !locName.trim()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>

        {/* ---- Employee PIN mapping ---- */}
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <Fingerprint className="h-3.5 w-3.5" /> Employee PINs
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            Map each employee&apos;s User ID enrolled on the device. {mappedCount} of{" "}
            {employees.length} mapped.
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {employees.map((e) => {
              const editing = e.id in pinEdits;
              const value = editing ? pinEdits[e.id] : e.device_code ?? "";
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 p-2.5">
                  <div className="min-w-0">
                    <span className="truncate text-sm">
                      {e.first_name} {e.last_name}
                    </span>
                    <p className="truncate text-xs text-muted-foreground">{e.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={value}
                      onChange={(ev) =>
                        setPinEdits((p) => ({ ...p, [e.id]: ev.target.value }))
                      }
                      placeholder="PIN"
                      className="h-8 w-24"
                    />
                    {editing && value !== (e.device_code ?? "") && (
                      <Button size="sm" onClick={() => savePin(e.id)} disabled={savingPin === e.id}>
                        {savingPin === e.id ? "…" : "Save"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ---- Sync users to devices (ADMS provisioning) ---- */}
        <div className="rounded-lg border border-border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <RefreshCw className="h-3.5 w-3.5" /> Sync users to devices
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pushes every active employee with a PIN onto all active devices — including
                employees from companies in your group, so cross-site staff appear as a named
                PIN slot here. Fingerprints are still enrolled at the device itself.
              </p>
            </div>
            <Button onClick={handleSyncAll} disabled={syncing} className="shrink-0">
              {syncing ? "Queuing…" : "Sync all users to devices"}
            </Button>
          </div>
          {syncStatus && (
            <p className="mt-3 text-xs text-muted-foreground">
              {syncStatus.pending} pending · {syncStatus.sent} sent ·{" "}
              {syncStatus.confirmed} confirmed ·{" "}
              <span className={syncStatus.failed ? "text-destructive" : ""}>
                {syncStatus.failed} failed
              </span>
              {syncStatus.failed > 0 && (
                <button
                  type="button"
                  onClick={handleRetryFailed}
                  className="ml-2 underline"
                >
                  Retry failed
                </button>
              )}
            </p>
          )}
        </div>

        <IngestSecurityCard />
      </CardContent>

      {deviceDialog.open && (
        <RegisterDeviceDialog
          locations={locations}
          initial={deviceDialog.editing}
          onClose={() => setDeviceDialog({ open: false })}
          onSaved={(d) =>
            setDevices((p) => {
              const exists = p.some((x) => x.id === d.id);
              return exists ? p.map((x) => (x.id === d.id ? d : x)) : [...p, d];
            })
          }
        />
      )}

      <DestructiveDialog
        open={deletingDevice !== null}
        onOpenChange={(o) => !o && setDeletingDevice(null)}
        title="Remove device?"
        description={
          deletingDevice
            ? `"${deletingDevice.label || deletingDevice.device_serial}" will stop being recognised. Past attendance is kept.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => deletingDevice && removeDevice(deletingDevice)}
      />

      <DestructiveDialog
        open={deletingLoc !== null}
        onOpenChange={(o) => !o && setDeletingLoc(null)}
        title="Remove location?"
        description={
          deletingLoc
            ? `"${deletingLoc.name}" will be removed. Devices there keep working but lose their location tag.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => deletingLoc && removeLocation(deletingLoc)}
      />
    </>
  );
}

// Device-side ADMS settings (production endpoint). Kept in sync with register-device-dialog.tsx.
const ADMS_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["Server Mode", "ADMS"],
  ["Server Address", "jambahr.com"],
  ["Server Port", "443"],
  ["HTTPS / Encrypt", "ON"],
  ["Enable Domain Name", "ON"],
];

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <div className="mt-0.5 text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

function SetupGuide({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <ListChecks className="h-4 w-4" /> How to connect a device
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="border-t border-border p-3 text-xs">
          <ol className="space-y-2.5">
            <Step n={1} title="Enroll the employee on the device">
              On the device: Menu → User Mgmt → New User. Note the <b>User ID</b> — that number is
              the PIN you map under “Employee PINs” below.
            </Step>
            <Step n={2} title="Point the device at JambaHR">
              Menu → Comm → Cloud Server (ADMS):
              <ul className="mt-1 space-y-0.5">
                {ADMS_FIELDS.map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-mono">{v}</span>
                  </li>
                ))}
              </ul>
            </Step>
            <Step n={3} title="Reboot the device">
              It connects within ~30s of boot. Make sure the device has internet access (it reaches
              out to jambahr.com:443).
            </Step>
            <Step n={4} title="Register it here">
              Click “Register device”, enter the serial + location, then set the employee’s PIN under
              “Employee PINs”.
            </Step>
            <Step n={5} title="Watch the status">
              The device’s dot turns green “Connected”. Fingerprint punches now flow straight into
              Attendance.
            </Step>
          </ol>
        </div>
      )}
    </div>
  );
}

function TroubleshootBox({ serial }: { serial: string }) {
  const checks = [
    "Did you reboot the device after saving the Cloud Server settings?",
    "Can the device reach the internet? It connects out to jambahr.com:443.",
    "Is HTTPS / Encrypt set to ON on the device?",
    "Is Server Port set to 443 and Server Address jambahr.com?",
    `Does the serial on the device match “${serial}” exactly?`,
  ];
  return (
    <div className="mt-2 rounded-md border border-amber-300/60 bg-amber-50 p-2.5 text-xs dark:border-amber-500/30 dark:bg-amber-500/10">
      <p className="mb-1 font-medium">Not connecting? Check:</p>
      <ul className="space-y-1">
        {checks.map((c, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-amber-600">•</span>
            <span className="text-muted-foreground">{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
