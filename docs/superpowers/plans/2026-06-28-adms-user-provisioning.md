# ADMS User Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let JambaHR push employee user records (PIN + Name) onto ZKTeco/eSSL biometric devices automatically via the ADMS command channel, with org-wide scope, a durable command queue, and a CSV/`device_code` bulk-entry path.

**Architecture:** A `device_commands` queue table holds pending `upsert_user`/`delete_user` commands per device. The existing `/iclock/[...seg]` route is extended: `GET getrequest` drains a small batch of pending commands for the polling serial (building ADMS command lines, flipping them to `sent`), and `POST devicecmd` records the device's ack (`confirmed`/`failed`). Three triggers enqueue commands: new-device backfill, employee-terminate delete, and a manual "Sync all". All command string building/parsing lives in a pure, unit-tested boundary module.

**Tech Stack:** Next.js 14.2.x (App Router, Server Actions), TypeScript strict, Supabase (Postgres + RLS, service-role admin client), Vitest, Tailwind. Spec: `docs/superpowers/specs/2026-06-28-adms-user-provisioning-design.md`.

## Global Constraints

- Next.js pinned **14.2.x** — do not upgrade.
- All DB writes go through the admin Supabase client (`createAdminSupabase()` from `@/lib/supabase/server`) which bypasses RLS by design (CLAUDE.md gotcha #5).
- Migrations are applied via the Supabase MCP `apply_migration` (Windows — no CLI; CLAUDE.md gotcha #4). Migration files also saved under `supabase/migrations/`.
- Server actions: `"use server"`, `getCurrentUser()` + `isAdmin(role)` guards, return `ActionResult<T>`, `revalidatePath()` after writes.
- **Pure/secret/PII helpers must NOT be exported from `"use server"` files** (CLAUDE.md gotcha #85) — `adms-commands.ts` and the pure diff helper are plain modules.
- Tests are **Vitest**, pure (no DB), placed in `tests/attendance/` mirroring `tests/attendance/iclock-path.test.ts`.
- `getrequest` command logic must be **best-effort** — any failure falls through to the existing `return ok("OK\n")` so a device never stalls and punch ingestion is never affected (mirrors gotcha #52 audit-write swallow).
- Device `Name` field limit: **24 chars**, tab/newline-stripped. `pin` must be numeric.
- New tables/indexes are **idempotent** (`IF NOT EXISTS`) per CLAUDE.md conventions.
- No fingerprint template handling anywhere — out of scope.

---

### Task 1: Migration — `device_commands` table + employee PIN uniqueness

**Files:**
- Create: `supabase/migrations/085_device_commands.sql`
- Apply via: Supabase MCP `apply_migration` to project `imjwqktxzahhnfmfbtfc`

**Interfaces:**
- Produces: table `device_commands` (columns per spec); sequence `device_commands_cmd_seq`; partial unique index `uq_device_commands_pending`; partial unique index `uq_employees_org_device_code`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/085_device_commands.sql`:

```sql
-- 085: ADMS user-provisioning command queue + employee PIN uniqueness

create sequence if not exists device_commands_cmd_seq;

create table if not exists device_commands (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  device_id     uuid not null references devices(id) on delete cascade,
  device_serial text not null,
  cmd_seq       bigint not null default nextval('device_commands_cmd_seq'),
  cmd_type      text not null check (cmd_type in ('upsert_user','delete_user')),
  pin           text not null,
  employee_id   uuid references employees(id) on delete set null,
  name          text,
  command_text  text,
  status        text not null default 'pending'
                check (status in ('pending','sent','confirmed','failed')),
  attempts      int not null default 0,
  last_error    text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  confirmed_at  timestamptz
);

create index if not exists idx_device_commands_serial_status
  on device_commands (device_serial, status);
create index if not exists idx_device_commands_org
  on device_commands (org_id);
create unique index if not exists uq_device_commands_pending
  on device_commands (device_id, pin, cmd_type)
  where status = 'pending';

alter table device_commands enable row level security;

-- Advisory policies (service-role bypasses; matches 083/084 Clerk-JWT pattern)
drop policy if exists device_commands_org_read on device_commands;
create policy device_commands_org_read on device_commands
  for select using (org_id::text = (auth.jwt() ->> 'org_id'));

drop policy if exists device_commands_admin_write on device_commands;
create policy device_commands_admin_write on device_commands
  for all using (
    org_id::text = (auth.jwt() ->> 'org_id')
    and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin')
  );

-- One PIN per org so punch resolution is unambiguous
create unique index if not exists uq_employees_org_device_code
  on employees (org_id, device_code)
  where device_code is not null;
```

- [ ] **Step 2: Pre-check existing PIN collisions (must be clean before the unique index applies)**

Run via MCP `execute_sql` on `imjwqktxzahhnfmfbtfc`:

```sql
select org_id, device_code, count(*)
from employees
where device_code is not null
group by org_id, device_code
having count(*) > 1;
```

Expected: **0 rows.** If any rows return, resolve the duplicate PINs manually before applying (the unique index will otherwise fail).

- [ ] **Step 3: Apply the migration**

Apply `085_device_commands.sql` via MCP `apply_migration` (name: `device_commands`).

- [ ] **Step 4: Verify the table and indexes exist**

Run via MCP `execute_sql`:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'device_commands' order by ordinal_position;
select indexname from pg_indexes where tablename = 'device_commands';
```

Expected: all 15 columns from the spec; indexes `idx_device_commands_serial_status`, `idx_device_commands_org`, `uq_device_commands_pending`, plus the PK.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/085_device_commands.sql
git commit -m "feat(attendance): device_commands queue migration + PIN uniqueness"
```

---

### Task 2: Pure ADMS command boundary module + tests

**Files:**
- Create: `src/lib/attendance/adms-commands.ts`
- Test: `tests/attendance/adms-commands.test.ts`

**Interfaces:**
- Produces:
  - `sanitizeName(name: string): string` — strip `\t`/`\r`/`\n`, collapse spaces, truncate to 24 chars.
  - `isValidPin(pin: string): boolean` — `/^\d+$/`.
  - `buildUserCommand(input: { cmdSeq: number; pin: string; name: string }): string`
  - `buildDeleteCommand(cmdSeq: number, pin: string): string`
  - `parseDeviceCmdAck(body: string): { id: number | null; ret: number | null; raw: string }`

- [ ] **Step 1: Write the failing tests**

Create `tests/attendance/adms-commands.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  sanitizeName,
  isValidPin,
  buildUserCommand,
  buildDeleteCommand,
  parseDeviceCmdAck,
} from "@/lib/attendance/adms-commands";

describe("sanitizeName", () => {
  it("strips tabs/newlines that would break the wire format", () => {
    expect(sanitizeName("John\tDoe\n")).toBe("John Doe");
  });
  it("truncates to 24 chars", () => {
    expect(sanitizeName("A".repeat(40))).toBe("A".repeat(24));
  });
});

describe("isValidPin", () => {
  it("accepts numeric", () => expect(isValidPin("1042")).toBe(true));
  it("rejects non-numeric", () => expect(isValidPin("A12")).toBe(false));
  it("rejects empty", () => expect(isValidPin("")).toBe(false));
});

describe("buildUserCommand", () => {
  it("builds a tab-separated USERINFO update line", () => {
    expect(buildUserCommand({ cmdSeq: 7, pin: "1042", name: "John Doe" })).toBe(
      "C:7:DATA UPDATE USERINFO PIN=1042\tName=John Doe\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ="
    );
  });
  it("sanitizes the name", () => {
    expect(buildUserCommand({ cmdSeq: 1, pin: "5", name: "a\tb" })).toContain("Name=a b\t");
  });
});

describe("buildDeleteCommand", () => {
  it("builds a USERINFO delete line", () => {
    expect(buildDeleteCommand(9, "1042")).toBe("C:9:DATA DELETE USERINFO PIN=1042");
  });
});

describe("parseDeviceCmdAck", () => {
  it("parses ID and Return", () => {
    expect(parseDeviceCmdAck("ID=7&Return=0&CMD=DATA")).toEqual({ id: 7, ret: 0, raw: "ID=7&Return=0&CMD=DATA" });
  });
  it("parses negative return", () => {
    expect(parseDeviceCmdAck("ID=7&Return=-1&CMD=DATA").ret).toBe(-1);
  });
  it("returns nulls when fields absent", () => {
    expect(parseDeviceCmdAck("garbage")).toEqual({ id: null, ret: null, raw: "garbage" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/attendance/adms-commands.test.ts`
Expected: FAIL — module `@/lib/attendance/adms-commands` not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/attendance/adms-commands.ts`:

```ts
/**
 * Pure ADMS ("push SDK") command builders + ack parser for ZKTeco/eSSL devices.
 * No DB, no I/O — safe to unit test. The route handler and provisioning helper
 * both import from here so the wire format lives in exactly one place.
 */
const NAME_MAX = 24;

export function sanitizeName(name: string): string {
  return (name ?? "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
}

export function isValidPin(pin: string): boolean {
  return /^\d+$/.test(pin ?? "");
}

export function buildUserCommand(input: { cmdSeq: number; pin: string; name: string }): string {
  const name = sanitizeName(input.name);
  return (
    `C:${input.cmdSeq}:DATA UPDATE USERINFO ` +
    `PIN=${input.pin}\tName=${name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=`
  );
}

export function buildDeleteCommand(cmdSeq: number, pin: string): string {
  return `C:${cmdSeq}:DATA DELETE USERINFO PIN=${pin}`;
}

export function parseDeviceCmdAck(body: string): { id: number | null; ret: number | null; raw: string } {
  const raw = body ?? "";
  const idMatch = raw.match(/\bID=(-?\d+)/i);
  const retMatch = raw.match(/\bReturn=(-?\d+)/i);
  return {
    id: idMatch ? parseInt(idMatch[1], 10) : null,
    ret: retMatch ? parseInt(retMatch[1], 10) : null,
    raw,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/attendance/adms-commands.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/adms-commands.ts tests/attendance/adms-commands.test.ts
git commit -m "feat(attendance): pure ADMS command builders + ack parser"
```

---

### Task 3: Pure command-diff helper + tests

The DB I/O wrappers (Task 4) are verified manually, but the *set logic* — "given the desired (device,pin,type) commands and the already-pending ones, which are missing?" — is pure and gets real tests.

**Files:**
- Create: `src/lib/attendance/device-command-diff.ts`
- Test: `tests/attendance/device-command-diff.test.ts`

**Interfaces:**
- Produces:
  - `type DesiredCommand = { device_id: string; pin: string; cmd_type: "upsert_user" | "delete_user" }`
  - `commandKey(c: DesiredCommand): string`
  - `missingCommands(desired: DesiredCommand[], existingPendingKeys: Set<string>): DesiredCommand[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/attendance/device-command-diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { commandKey, missingCommands } from "@/lib/attendance/device-command-diff";

describe("commandKey", () => {
  it("is stable per device+pin+type", () => {
    expect(commandKey({ device_id: "d1", pin: "5", cmd_type: "upsert_user" })).toBe(
      "d1|5|upsert_user"
    );
  });
});

describe("missingCommands", () => {
  it("returns only commands not already pending", () => {
    const desired = [
      { device_id: "d1", pin: "5", cmd_type: "upsert_user" as const },
      { device_id: "d1", pin: "6", cmd_type: "upsert_user" as const },
    ];
    const existing = new Set(["d1|5|upsert_user"]);
    expect(missingCommands(desired, existing)).toEqual([
      { device_id: "d1", pin: "6", cmd_type: "upsert_user" },
    ]);
  });
  it("dedupes duplicates within the desired list", () => {
    const desired = [
      { device_id: "d1", pin: "5", cmd_type: "upsert_user" as const },
      { device_id: "d1", pin: "5", cmd_type: "upsert_user" as const },
    ];
    expect(missingCommands(desired, new Set())).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/attendance/device-command-diff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/attendance/device-command-diff.ts`:

```ts
export type DesiredCommand = {
  device_id: string;
  pin: string;
  cmd_type: "upsert_user" | "delete_user";
};

export function commandKey(c: DesiredCommand): string {
  return `${c.device_id}|${c.pin}|${c.cmd_type}`;
}

export function missingCommands(
  desired: DesiredCommand[],
  existingPendingKeys: Set<string>
): DesiredCommand[] {
  const seen = new Set<string>();
  const out: DesiredCommand[] = [];
  for (const c of desired) {
    const k = commandKey(c);
    if (existingPendingKeys.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/attendance/device-command-diff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendance/device-command-diff.ts tests/attendance/device-command-diff.test.ts
git commit -m "feat(attendance): pure command-diff/dedup helper"
```

---

### Task 4: Enqueue helpers (DB I/O) — `device-provisioning.ts`

**Files:**
- Create: `src/lib/attendance/device-provisioning.ts`

**Interfaces:**
- Consumes: `missingCommands`, `commandKey`, `DesiredCommand` (Task 3); `isValidPin`, `sanitizeName` (Task 2); `createAdminSupabase` (`@/lib/supabase/server`).
- Produces (all `async`, all best-effort — log + return 0 on error, never throw):
  - `enqueueUpsertForDevice(orgId: string, deviceId: string, deviceSerial: string): Promise<number>` — upsert all active employees with a valid PIN onto one device.
  - `enqueueDeleteForEmployee(orgId: string, employeeId: string, pin: string): Promise<number>` — delete one employee from all active devices.
  - `enqueueSyncAll(orgId: string): Promise<number>` — upsert all active employees with PINs onto all active devices.

> This file is plain (NOT `"use server"`) per gotcha #85 — it's called by server actions.

- [ ] **Step 1: Implement the module**

Create `src/lib/attendance/device-provisioning.ts`:

```ts
import { createAdminSupabase } from "@/lib/supabase/server";
import { isValidPin, sanitizeName } from "@/lib/attendance/adms-commands";
import {
  commandKey,
  missingCommands,
  type DesiredCommand,
} from "@/lib/attendance/device-command-diff";

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
  meta: Map<string, { device_serial: string; employee_id: string | null; name: string | null }>
): Promise<number> {
  if (desired.length === 0) return 0;
  const supabase = createAdminSupabase();

  // Fetch currently-pending keys for this org to avoid duplicate enqueue.
  const { data: pending } = await supabase
    .from("device_commands")
    .select("device_id, pin, cmd_type")
    .eq("org_id", orgId)
    .eq("status", "pending");
  const existing = new Set((pending ?? []).map((p: any) => commandKey(p)));

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

  const { error } = await supabase.from("device_commands").insert(rows);
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
  return data ?? [];
}

async function activeEmployeesWithPin(orgId: string) {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("employees")
    .select("id, first_name, last_name, device_code")
    .eq("org_id", orgId)
    .neq("status", "terminated")
    .not("device_code", "is", null);
  return (data ?? []).filter((e: any) => isValidPin(e.device_code));
}

function fullName(e: any): string {
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
    const meta = new Map<string, any>();
    for (const e of employees) {
      const c: DesiredCommand = { device_id: deviceId, pin: e.device_code, cmd_type: "upsert_user" };
      desired.push(c);
      meta.set(commandKey(c), { device_serial: deviceSerial, employee_id: e.id, name: fullName(e) });
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
    const meta = new Map<string, any>();
    for (const d of devices) {
      const c: DesiredCommand = { device_id: d.id, pin, cmd_type: "delete_user" };
      desired.push(c);
      meta.set(commandKey(c), { device_serial: d.device_serial, employee_id: employeeId, name: null });
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
    const meta = new Map<string, any>();
    for (const d of devices) {
      for (const e of employees) {
        const c: DesiredCommand = { device_id: d.id, pin: e.device_code, cmd_type: "upsert_user" };
        desired.push(c);
        meta.set(commandKey(c), { device_serial: d.device_serial, employee_id: e.id, name: fullName(e) });
      }
    }
    return await insertMissing(orgId, desired, meta);
  } catch (e: any) {
    console.warn("[device-provisioning] enqueueSyncAll:", e?.message);
    return 0;
  }
}
```

- [ ] **Step 2: Typecheck the new file**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep device-provisioning`
Expected: no output (the project has pre-existing Supabase `never`-type errors elsewhere — gotcha #3 — so only grep this file).

- [ ] **Step 3: Commit**

```bash
git add src/lib/attendance/device-provisioning.ts
git commit -m "feat(attendance): device-command enqueue helpers"
```

---

### Task 5: Extend the `/iclock` handler — dispatch + ack

**Files:**
- Modify: `src/app/iclock/[...seg]/route.ts`

**Interfaces:**
- Consumes: `buildUserCommand`, `buildDeleteCommand`, `parseDeviceCmdAck` (Task 2); `createAdminSupabase`.
- The new logic sits **before** the existing final `return ok("OK\n")` and is wrapped so any failure falls through to that line.

> Read the current file first to match its existing `ok()`, serial/endpoint/query parsing, and `touchDeviceSeen` usage. Insert two handlers: (a) `GET getrequest` → drain batch; (b) `POST devicecmd` → record ack.

- [ ] **Step 1: Add the dispatch + ack logic**

Add these helper functions in the route module (above the exported handler), using the file's existing imports plus the new ones:

```ts
import { createAdminSupabase } from "@/lib/supabase/server";
import { buildUserCommand, buildDeleteCommand, parseDeviceCmdAck } from "@/lib/attendance/adms-commands";

const COMMAND_BATCH = 20;

// Drain up to COMMAND_BATCH pending commands for this serial; return joined lines or null.
async function dispatchCommands(sn: string): Promise<string | null> {
  const supabase = createAdminSupabase();

  // Only dispatch to a registered, active device.
  const { data: device } = await supabase
    .from("devices")
    .select("id, is_active")
    .eq("device_serial", sn)
    .maybeSingle();
  if (!device || device.is_active !== true) return null;

  const { data: pending } = await supabase
    .from("device_commands")
    .select("id, cmd_seq, cmd_type, pin, name")
    .eq("device_serial", sn)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(COMMAND_BATCH);
  if (!pending || pending.length === 0) return null;

  const lines: string[] = [];
  for (const c of pending as any[]) {
    const line =
      c.cmd_type === "delete_user"
        ? buildDeleteCommand(c.cmd_seq, c.pin)
        : buildUserCommand({ cmdSeq: c.cmd_seq, pin: c.pin, name: c.name ?? "" });
    lines.push(line);
    await supabase
      .from("device_commands")
      .update({ status: "sent", sent_at: new Date().toISOString(), command_text: line })
      .eq("id", c.id);
  }
  return lines.join("\n") + "\n";
}

// Record a device's command ack.
async function recordAck(body: string): Promise<void> {
  const { id, ret } = parseDeviceCmdAck(body);
  if (id === null) return;
  const supabase = createAdminSupabase();
  const ok = ret !== null && ret >= 0;
  await supabase
    .from("device_commands")
    .update(
      ok
        ? { status: "confirmed", confirmed_at: new Date().toISOString() }
        : { status: "failed", last_error: `Return=${ret}` }
    )
    .eq("cmd_seq", id);
}
```

- [ ] **Step 2: Wire them into the request flow**

Immediately **before** the existing final `return ok("OK\n")` fall-through, insert:

```ts
  // getrequest poll → hand the device any pending provisioning commands.
  if (req.method === "GET" && endpoint === "getrequest" && sn !== "(none)") {
    if (sn !== "(none)") touchDeviceSeen(sn).catch(() => {});
    try {
      const commands = await dispatchCommands(sn);
      if (commands) return ok(commands);
    } catch (e) {
      console.warn("[iclock capture] dispatchCommands failed:", e);
    }
    return ok("OK\n");
  }

  // devicecmd ack → record command result.
  if (req.method === "POST" && endpoint === "devicecmd") {
    if (sn !== "(none)") touchDeviceSeen(sn).catch(() => {});
    try {
      await recordAck(body);
    } catch (e) {
      console.warn("[iclock capture] recordAck failed:", e);
    }
    return ok("OK\n");
  }
```

(Use the file's actual variable names for method/endpoint/sn/body/`ok` — match what the existing handshake/ATTLOG branches use.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "iclock"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/iclock/[...seg]/route.ts"
git commit -m "feat(attendance): getrequest command dispatch + devicecmd ack"
```

---

### Task 6: VERIFICATION CHECKPOINT — confirm the format on the real MB140

**Files:** none (manual). This is the verification-first gate from the spec — do this **before** wiring triggers, so the wire format is proven.

- [ ] **Step 1: Manually enqueue one upsert command** (via MCP `execute_sql`, using a real test employee PIN + an active device serial — e.g. the MB140 `UFS2260202795` and an active employee with a numeric `device_code`):

```sql
insert into device_commands (org_id, device_id, device_serial, cmd_type, pin, employee_id, name)
select d.org_id, d.id, d.device_serial, 'upsert_user', '901', e.id, 'Relay Test'
from devices d
cross join lateral (select id from employees where org_id = d.org_id limit 1) e
where d.device_serial = 'UFS2260202795';
```

- [ ] **Step 2: Watch the device poll** — tail the Vercel runtime logs (or the `[iclock capture]` banner). Within a poll cycle the device should `GET /iclock/getrequest` and receive the `C:<seq>:DATA UPDATE USERINFO…` line, then `POST /iclock/devicecmd` with `ID=<seq>&Return=0`.

- [ ] **Step 3: Confirm DB state flips**:

```sql
select cmd_seq, status, command_text, last_error, sent_at, confirmed_at
from device_commands where pin = '901' order by created_at desc limit 1;
```
Expected: `status = 'confirmed'`.

- [ ] **Step 4: Confirm on the physical device** — Menu → User Mgmt → user `901` "Relay Test" now exists.

- [ ] **Step 5: If the format is wrong** (device returns negative `Return`, or no user created): adjust ONLY `src/lib/attendance/adms-commands.ts` (the field set / order) and update its unit tests to match, re-commit, and repeat Steps 1–4. **Do not proceed to Task 7 until a user is confirmed created on the device.**

- [ ] **Step 6: Clean up the test row + device user** once confirmed (delete the `pin='901'` employee mapping/test row; remove user 901 on the device if desired).

---

### Task 7: Wire the triggers (backfill + terminate)

**Files:**
- Modify: `src/actions/attendance-devices.ts` (`registerDevice`)
- Modify: `src/actions/employees.ts` (`terminateEmployee`)

**Interfaces:**
- Consumes: `enqueueUpsertForDevice`, `enqueueDeleteForEmployee` (Task 4).

- [ ] **Step 1: Backfill on device registration**

In `registerDevice`, after the device row is successfully inserted and you have the new device's `id` + `device_serial` + `org_id`, add (before `revalidatePath`/return):

```ts
// Backfill existing active employees (with PINs) onto the new device. Best-effort.
await enqueueUpsertForDevice(user.orgId, newDevice.id, newDevice.device_serial);
```

Add the import at the top:
```ts
import { enqueueUpsertForDevice } from "@/lib/attendance/device-provisioning";
```

- [ ] **Step 2: Delete-on-terminate**

In `terminateEmployee`, after the status is set to `terminated` and you have the employee's `id` + `device_code`, add:

```ts
// Remove the ex-employee's user record from all devices. Best-effort.
if (employee.device_code) {
  await enqueueDeleteForEmployee(user.orgId, employee.id, employee.device_code);
}
```

Add the import at the top:
```ts
import { enqueueDeleteForEmployee } from "@/lib/attendance/device-provisioning";
```

(Read the current functions first to use their real variable names for the inserted device / employee record and the org id.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "attendance-devices|employees.ts"`
Expected: no NEW errors referencing the added imports/calls (pre-existing `never`-type errors may remain — gotcha #3).

- [ ] **Step 4: Manual verify** — register a fresh test device → confirm `device_commands` gets `pending` rows for all active employees with PINs. Terminate a test employee with a PIN → confirm `delete_user` rows appear for each active device.

- [ ] **Step 5: Commit**

```bash
git add src/actions/attendance-devices.ts src/actions/employees.ts
git commit -m "feat(attendance): backfill on device register, delete on terminate"
```

---

### Task 8: Sync-all / retry / status actions

**Files:**
- Modify: `src/actions/attendance-devices.ts`

**Interfaces:**
- Consumes: `enqueueSyncAll` (Task 4), `getCurrentUser`, `isAdmin`, `createAdminSupabase`, `revalidatePath`.
- Produces:
  - `syncAllUsersToDevices(): Promise<ActionResult<{ enqueued: number }>>`
  - `retryFailedCommands(): Promise<ActionResult<{ retried: number }>>`
  - `getProvisioningStatus(): Promise<ActionResult<{ pending: number; sent: number; confirmed: number; failed: number }>>`

- [ ] **Step 1: Implement the three actions**

Append to `src/actions/attendance-devices.ts` (it already imports `getCurrentUser`/`isAdmin`/`createAdminSupabase`/`revalidatePath`; add `enqueueSyncAll`):

```ts
import { enqueueSyncAll } from "@/lib/attendance/device-provisioning";

export async function syncAllUsersToDevices(): Promise<ActionResult<{ enqueued: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const enqueued = await enqueueSyncAll(user.orgId);
  revalidatePath("/dashboard/settings");
  return { success: true, data: { enqueued } };
}

export async function retryFailedCommands(): Promise<ActionResult<{ retried: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("device_commands")
    .update({ status: "pending", last_error: null })
    .eq("org_id", user.orgId)
    .eq("status", "failed")
    .select("id");
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: { retried: data?.length ?? 0 } };
}

export async function getProvisioningStatus(): Promise<
  ActionResult<{ pending: number; sent: number; confirmed: number; failed: number }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  const supabase = createAdminSupabase();
  const counts = { pending: 0, sent: 0, confirmed: 0, failed: 0 };
  for (const status of Object.keys(counts) as (keyof typeof counts)[]) {
    const { count } = await supabase
      .from("device_commands")
      .select("id", { count: "exact", head: true })
      .eq("org_id", user.orgId)
      .eq("status", status);
    counts[status] = count ?? 0;
  }
  return { success: true, data: counts };
}
```

(If `ActionResult` isn't already imported in this file, import it from its existing location — check the other actions in the file.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "attendance-devices"`
Expected: no NEW errors from these functions.

- [ ] **Step 3: Commit**

```bash
git add src/actions/attendance-devices.ts
git commit -m "feat(attendance): syncAll / retryFailed / provisioning-status actions"
```

---

### Task 9: CSV importer — `device_code` column

**Files:**
- Modify: `src/components/dashboard/import-client.tsx` (`COLUMN_REFERENCE` + `validateRow`)
- Modify: `src/actions/employees.ts` (`bulkImportEmployees`)

**Interfaces:**
- Consumes: existing import pipeline.

- [ ] **Step 1: Add `device_code` to the column reference**

In `import-client.tsx`, add to `COLUMN_REFERENCE` (in the optional group):

```ts
  { key: "device_code", label: "device_code", required: false, hint: "Biometric PIN (numbers only, unique per org)" },
```

(Match the exact shape of the existing entries in that array.)

- [ ] **Step 2: Validate it in `validateRow`**

In `validateRow`, add a numeric check (only when present):

```ts
  if (row.device_code && !/^\d+$/.test(String(row.device_code).trim())) {
    errors.push("device_code must be digits only");
  }
```

(Match the function's existing `errors` accumulation pattern.)

- [ ] **Step 3: Persist + uniqueness-check in `bulkImportEmployees`**

In `bulkImportEmployees`, include `device_code` in the inserted employee record (trimmed, or null when blank). Before inserting, guard duplicates within the batch and against existing rows:

```ts
  // Reject duplicate PINs within the file
  const pins = rows.map((r) => r.device_code?.trim()).filter(Boolean) as string[];
  const dupInFile = pins.find((p, i) => pins.indexOf(p) !== i);
  if (dupInFile) {
    return { success: false, error: `Duplicate device_code in file: ${dupInFile}` };
  }
```

When mapping each row to its insert payload, add:
```ts
    device_code: row.device_code?.trim() || null,
```

The DB partial unique index (Task 1) is the backstop — surface its error if the insert fails:
```ts
  if (insertError?.message?.includes("uq_employees_org_device_code")) {
    return { success: false, error: "A device_code (PIN) is already used by another employee." };
  }
```

(Read the current `bulkImportEmployees` to slot these into its real row-mapping + error-handling flow.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "import-client|employees.ts"`
Expected: no NEW errors.

- [ ] **Step 5: Manual verify** — import a small CSV with a `device_code` column → confirm PINs land on `employees.device_code`; import a file with two identical PINs → confirm the friendly duplicate error.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/import-client.tsx src/actions/employees.ts
git commit -m "feat(employees): device_code (PIN) column in CSV importer"
```

---

### Task 10: UI — Sync button + status line + retry

**Files:**
- Modify: `src/components/settings/biometric-devices-section.tsx`

**Interfaces:**
- Consumes: `syncAllUsersToDevices`, `retryFailedCommands`, `getProvisioningStatus` (Task 8).

- [ ] **Step 1: Add a "Device user sync" block**

In `biometric-devices-section.tsx` (a client component), add state + handlers and a small card near the "Employee PINs" section:

```tsx
const [status, setStatus] = useState<{ pending: number; sent: number; confirmed: number; failed: number } | null>(null);
const [syncing, setSyncing] = useState(false);

async function refreshStatus() {
  const res = await getProvisioningStatus();
  if (res.success) setStatus(res.data);
}
useEffect(() => { refreshStatus(); }, []);

async function handleSyncAll() {
  setSyncing(true);
  const res = await syncAllUsersToDevices();
  setSyncing(false);
  if (res.success) {
    toast.success(`Queued ${res.data.enqueued} user updates to devices`);
    refreshStatus();
  } else {
    toast.error(res.error);
  }
}

async function handleRetry() {
  const res = await retryFailedCommands();
  if (res.success) { toast.success(`Re-queued ${res.data.retried} failed commands`); refreshStatus(); }
  else toast.error(res.error);
}
```

Render:

```tsx
<div className="rounded-lg border p-4">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm font-medium">Sync users to devices</p>
      <p className="text-xs text-muted-foreground">
        Pushes every active employee with a PIN onto all active devices. Fingerprints are still enrolled at the device.
      </p>
    </div>
    <Button onClick={handleSyncAll} disabled={syncing}>
      {syncing ? "Queuing…" : "Sync all users to devices"}
    </Button>
  </div>
  {status && (
    <p className="mt-3 text-xs text-muted-foreground">
      {status.pending} pending · {status.sent} sent · {status.confirmed} confirmed ·{" "}
      <span className={status.failed ? "text-destructive" : ""}>{status.failed} failed</span>
      {status.failed > 0 && (
        <button onClick={handleRetry} className="ml-2 underline">Retry failed</button>
      )}
    </p>
  )}
</div>
```

Add the imports for the three actions and (if missing) `useEffect`, `toast`, `Button`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "biometric-devices-section"`
Expected: no NEW errors.

- [ ] **Step 3: Manual verify** — open Settings → Attendance → Biometric Devices → click "Sync all users to devices" → toast shows count, status line populates, devices drain the queue (watch counts move pending→sent→confirmed).

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/biometric-devices-section.tsx
git commit -m "feat(attendance): sync-to-devices button + status line in settings"
```

---

### Task 11: Full end-to-end verification + docs

**Files:**
- Modify: `docs/multi-location-attendance.md` (add a "User provisioning" section)
- Modify: `CLAUDE.md` (add a gotcha + note under Multi-Location Attendance)

- [ ] **Step 1: End-to-end on the real MB140**
  - Set PINs for 2–3 test employees (via CSV import).
  - Click "Sync all users to devices" → confirm rows created on the device.
  - Have one test employee enroll a fingerprint on the device, then punch → confirm the punch resolves to that employee (closes the loop with the existing ingest path).
  - Terminate a test employee → confirm a `delete_user` drains and the user disappears from the device.

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run tests/attendance/`
Expected: all pass (including the two new pure test files).

- [ ] **Step 3: Document** — add a short "User provisioning (push to devices)" subsection to `docs/multi-location-attendance.md` (queue model, triggers, Sync-all button, fingerprints-still-physical) and a CLAUDE.md gotcha noting: getrequest now returns provisioning commands; `device_commands` queue; PIN unique per org; fingerprints not pushed.

- [ ] **Step 4: Commit**

```bash
git add docs/multi-location-attendance.md CLAUDE.md
git commit -m "docs(attendance): document ADMS user provisioning"
```

---

## Self-Review

**Spec coverage:** org-wide scope (Tasks 4,8) ✓; triggers backfill/terminate/sync-all (Tasks 5-skipped→7,8) ✓ (no PIN-edit trigger — correctly absent); admin-managed PINs, skip unset (Task 4 `activeEmployeesWithPin`) ✓; CSV device_code (Task 9) ✓; PIN uniqueness index + validation (Tasks 1,9) ✓; DB queue + getrequest/devicecmd (Tasks 1,5) ✓; pure boundary module + tests (Tasks 2,3) ✓; best-effort handler (Task 5) ✓; UI sync/status/retry (Task 10) ✓; verification-first (Task 6) ✓; error handling (Task 4 swallow, Task 5 fall-through) ✓; testing (Tasks 2,3,11) ✓.

**Placeholder scan:** no TBD/TODO; all code blocks concrete. Modification tasks instruct reading the current function for real variable names (necessary because the verbatim bodies weren't reproduced) but supply the exact code to insert — acceptable, not a placeholder.

**Type consistency:** `DesiredCommand`/`commandKey`/`missingCommands` consistent across Tasks 3–4; `cmd_seq` (bigint) matched between migration, dispatch (`buildUserCommand({cmdSeq})`), and ack (`.eq("cmd_seq", id)`); status enum `pending/sent/confirmed/failed` consistent across migration, handler, actions, UI; action return shapes match the UI consumers.

**Risk note carried from spec:** Task 6 is a hard gate — the wire format in `adms-commands.ts` may need adjustment against real firmware before triggers are wired.
