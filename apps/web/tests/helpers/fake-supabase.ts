// A tiny in-memory stand-in for the Supabase query builder — just enough of
// the surface the announcement actions use. Filters are REALLY applied, so a
// missing .eq("org_id", …) shows up as a cross-tenant leak in the tests
// (a no-op select mock hid a real column bug for four weeks — see #42).

type Row = Record<string, any>;
type Filter = (r: Row) => boolean;

export type FakeDb = Record<string, Row[]>;

/** Unique keys per table, used to simulate Postgres 23505 on insert. */
const UNIQUE: Record<string, string[][]> = {
  announcement_acknowledgements: [["announcement_id", "employee_id", "version"]],
  announcement_recipients: [["announcement_id", "employee_id"]],
  announcement_versions: [["announcement_id", "version"]],
  late_penalty_events: [["org_id", "employee_id", "month", "kind", "occurrence_no"]],
  late_policy_flags: [["org_id", "employee_id", "month"]],
  attendance_records: [["org_id", "employee_id", "date"]],
};

/** Column defaults the real schema applies (migration 109). */
const DEFAULTS: Record<string, Row> = {
  announcements: {
    category: "general",
    audience_type: "all",
    ack_required: false,
    ack_due_date: null,
    content_version: 1,
    ack_version: 1,
    archived_at: null,
    is_pinned: false,
  },
  announcement_recipients: { added_reason: "publish", last_reminded_at: null, reminder_count: 0 },
  late_penalty_events: { status: "applied", cl_days: 0, lop_days: 0, email_status: null, status_reason: null },
  notifications: { read_at: null },
};

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export function createFakeSupabase(db: FakeDb) {
  return { from: (table: string) => builder(db, table) };
}

function builder(db: FakeDb, table: string) {
  db[table] ??= [];
  const filters: Filter[] = [];
  let op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  let payload: any = null;
  let upsertOpts: any = null;
  let head = false;
  let limitN: number | null = null;
  let returning = false;

  const matches = () => db[table].filter((r) => filters.every((f) => f(r)));

  function uniqueClash(row: Row): boolean {
    return (UNIQUE[table] ?? []).some((cols) =>
      db[table].some((r) => cols.every((c) => r[c] === row[c]))
    );
  }

  function run(): { data: any; error: any; count?: number } {
    if (op === "insert") {
      const rows = (Array.isArray(payload) ? payload : [payload]).map((r: Row) => ({
        id: newId(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(DEFAULTS[table] ?? {}),
        acknowledged_at: table === "announcement_acknowledgements" ? new Date().toISOString() : undefined,
        ...r,
      }));
      for (const r of rows) if (uniqueClash(r)) return { data: null, error: { code: "23505", message: "duplicate" } };
      db[table].push(...rows);
      const out = rows.map((r: Row) => ({ ...r }));
      return { data: returning ? (Array.isArray(payload) ? out : out[0]) : null, error: null };
    }
    if (op === "upsert") {
      const cols: string[] = (upsertOpts?.onConflict ?? "id").split(",");
      for (const r of Array.isArray(payload) ? payload : [payload]) {
        const existing = db[table].find((x) => cols.every((c) => x[c] === r[c]));
        if (existing) {
          if (!upsertOpts?.ignoreDuplicates) Object.assign(existing, r);
        } else db[table].push({ created_at: new Date().toISOString(), ...(DEFAULTS[table] ?? {}), ...r });
      }
      return { data: null, error: null };
    }
    if (op === "update") {
      const hit = matches();
      hit.forEach((r) => Object.assign(r, payload));
      return { data: returning ? hit.map((r) => ({ ...r })) : null, error: null };
    }
    if (op === "delete") {
      const hit = new Set(matches());
      db[table] = db[table].filter((r) => !hit.has(r));
      return { data: null, error: null };
    }
    // Clone, like a real network round-trip — callers must never be able to
    // observe a later write through a row they already read.
    let rows = matches().map((r) => ({ ...r }));
    if (limitN != null) rows = rows.slice(0, limitN);
    return head ? { data: null, error: null, count: rows.length } : { data: rows, error: null, count: rows.length };
  }

  const b: any = {
    select(_cols?: string, opts?: { head?: boolean }) {
      if (op === "select") head = !!opts?.head;
      else returning = true;
      return b;
    },
    insert(p: any) {
      op = "insert";
      payload = p;
      return b;
    },
    upsert(p: any, o?: any) {
      op = "upsert";
      payload = p;
      upsertOpts = o;
      return b;
    },
    update(p: any) {
      op = "update";
      payload = p;
      return b;
    },
    delete() {
      op = "delete";
      return b;
    },
    eq(c: string, v: any) {
      filters.push((r) => r[c] === v);
      return b;
    },
    neq(c: string, v: any) {
      filters.push((r) => r[c] !== v);
      return b;
    },
    in(c: string, vs: any[]) {
      filters.push((r) => vs.includes(r[c]));
      return b;
    },
    lt(c: string, v: any) {
      filters.push((r) => r[c] != null && r[c] < v);
      return b;
    },
    gt(c: string, v: any) {
      filters.push((r) => r[c] != null && r[c] > v);
      return b;
    },
    gte(c: string, v: any) {
      filters.push((r) => r[c] != null && r[c] >= v);
      return b;
    },
    lte(c: string, v: any) {
      filters.push((r) => r[c] != null && r[c] <= v);
      return b;
    },
    /** Minimal PostgREST or(): comma-separated `col.eq.v`, `col.in.(a,b)`, `col.is.null`. */
    or(expr: string) {
      const parts = expr.match(/[a-z_]+\.(?:in\.\([^)]*\)|[a-z]+\.[^,]+)/g) ?? [];
      const tests = parts.map((part) => {
        const [col, op, ...rest] = part.split(".");
        const val = rest.join(".");
        if (op === "in") {
          const vs = val.replace(/^\(|\)$/g, "").split(",");
          return (r: Row) => vs.includes(String(r[col]));
        }
        if (op === "is") return (r: Row) => (r[col] ?? null) === null;
        return (r: Row) => String(r[col]) === val;
      });
      filters.push((r) => tests.some((t) => t(r)));
      return b;
    },
    is(c: string, v: any) {
      filters.push((r) => (r[c] ?? null) === v);
      return b;
    },
    /** Only the `not(col, "is", null)` form is supported. */
    not(c: string, op: string, v: any) {
      if (op !== "is") throw new Error(`fake-supabase: not(${op}) unsupported`);
      filters.push((r) => (r[c] ?? null) !== v);
      return b;
    },
    order() {
      return b;
    },
    limit(n: number) {
      limitN = n;
      return b;
    },
    single() {
      const res = run();
      const data = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
      return Promise.resolve({ data, error: res.error ?? (data ? null : { message: "not found" }) });
    },
    maybeSingle() {
      const res = run();
      const data = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
      return Promise.resolve({ data, error: res.error });
    },
    then(resolve: any, reject: any) {
      return Promise.resolve(run()).then(resolve, reject);
    },
  };
  return b;
}
