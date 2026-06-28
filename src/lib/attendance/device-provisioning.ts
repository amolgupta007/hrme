import { createAdminSupabase } from "@/lib/supabase/server";
import { isValidPin, sanitizeName } from "@/lib/attendance/adms-commands";
import {
  commandKey,
  missingCommands,
  type DesiredCommand,
} from "@/lib/attendance/device-command-diff";

/**
 * Device user-provisioning enqueue helpers. Plain module (NOT "use server") —
 * called by server actions. All functions are best-effort: they log and return 0
 * on error so they never block the action that triggered them.
 */

type Meta = { device_serial: string; employee_id: string | null; name: string | null };

type Row = {
  org_id: string;
  device_id: string;
  device_serial: string;
  cmd_type: "upsert_user" | "delete_user";
  pin: string;
  employee_id: string | null;
  name: string | null;
};

async function insertMissing(
  orgId: string,
  desired: DesiredCommand[],
  meta: Map<string, Meta>
): Promise<number> {
  if (desired.length === 0) return 0;
  const supabase = createAdminSupabase();

  // Fetch currently-pending keys for this org to avoid duplicate enqueue.
  const { data: pending } = await supabase
    .from("device_commands")
    .select("device_id, pin, cmd_type")
    .eq("org_id", orgId)
    .eq("status", "pending");
  const existing = new Set(
    (pending ?? []).map((p: any) =>
      commandKey({ device_id: p.device_id, pin: p.pin, cmd_type: p.cmd_type })
    )
  );

  const toInsert = missingCommands(desired, existing);
  if (toInsert.length === 0) return 0;

  const rows: Row[] = toInsert.map((c) => {
    const m = meta.get(commandKey(c))!;
    return {
      org_id: orgId,
      device_id: c.device_id,
      device_serial: m.device_serial,
      cmd_type: c.cmd_type,
      pin: c.pin,
      employee_id: m.employee_id,
      name: c.cmd_type === "upsert_user" ? sanitizeName(m.name ?? "") : null,
    };
  });

  const { error } = await supabase.from("device_commands").insert(rows as any);
  if (error) {
    console.warn("[device-provisioning] insert failed:", error.message);
    return 0;
  }
  return rows.length;
}

async function activeDevices(orgId: string) {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("devices")
    .select("id, device_serial")
    .eq("org_id", orgId)
    .eq("is_active", true);
  return (data ?? []) as { id: string; device_serial: string }[];
}

async function activeEmployeesWithPin(orgId: string) {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("employees")
    .select("id, first_name, last_name, device_code")
    .eq("org_id", orgId)
    .neq("status", "terminated")
    .not("device_code", "is", null);
  return ((data ?? []) as any[]).filter((e) => isValidPin(e.device_code));
}

function fullName(e: { first_name?: string | null; last_name?: string | null }): string {
  return `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
}

export async function enqueueUpsertForDevice(
  orgId: string,
  deviceId: string,
  deviceSerial: string
): Promise<number> {
  try {
    const employees = await activeEmployeesWithPin(orgId);
    const desired: DesiredCommand[] = [];
    const meta = new Map<string, Meta>();
    for (const e of employees) {
      const c: DesiredCommand = {
        device_id: deviceId,
        pin: e.device_code,
        cmd_type: "upsert_user",
      };
      desired.push(c);
      meta.set(commandKey(c), {
        device_serial: deviceSerial,
        employee_id: e.id,
        name: fullName(e),
      });
    }
    return await insertMissing(orgId, desired, meta);
  } catch (e: any) {
    console.warn("[device-provisioning] enqueueUpsertForDevice:", e?.message);
    return 0;
  }
}

export async function enqueueDeleteForEmployee(
  orgId: string,
  employeeId: string,
  pin: string
): Promise<number> {
  try {
    if (!isValidPin(pin)) return 0;
    const devices = await activeDevices(orgId);
    const desired: DesiredCommand[] = [];
    const meta = new Map<string, Meta>();
    for (const d of devices) {
      const c: DesiredCommand = { device_id: d.id, pin, cmd_type: "delete_user" };
      desired.push(c);
      meta.set(commandKey(c), {
        device_serial: d.device_serial,
        employee_id: employeeId,
        name: null,
      });
    }
    return await insertMissing(orgId, desired, meta);
  } catch (e: any) {
    console.warn("[device-provisioning] enqueueDeleteForEmployee:", e?.message);
    return 0;
  }
}

export async function enqueueSyncAll(orgId: string): Promise<number> {
  try {
    const [devices, employees] = await Promise.all([
      activeDevices(orgId),
      activeEmployeesWithPin(orgId),
    ]);
    const desired: DesiredCommand[] = [];
    const meta = new Map<string, Meta>();
    for (const d of devices) {
      for (const e of employees) {
        const c: DesiredCommand = {
          device_id: d.id,
          pin: e.device_code,
          cmd_type: "upsert_user",
        };
        desired.push(c);
        meta.set(commandKey(c), {
          device_serial: d.device_serial,
          employee_id: e.id,
          name: fullName(e),
        });
      }
    }
    return await insertMissing(orgId, desired, meta);
  } catch (e: any) {
    console.warn("[device-provisioning] enqueueSyncAll:", e?.message);
    return 0;
  }
}
