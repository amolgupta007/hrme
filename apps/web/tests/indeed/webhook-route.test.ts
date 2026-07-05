import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// ── env ──────────────────────────────────────────────────────────────────────
process.env.INDEED_APPLY_SHARED_SECRET = "test-secret";

// ── helpers ──────────────────────────────────────────────────────────────────
const sign = (body: string) =>
  createHmac("sha1", "test-secret").update(body).digest("base64");

// ── mutable mock state ────────────────────────────────────────────────────────
// Controls what the dedup insert returns for each test.
let insertError: { code?: string; message?: string } | null = null;

// Spy we can assert on for the rollback delete.eq() call.
const mockEq = vi.fn().mockResolvedValue({ error: null });
const mockDelete = vi.fn(() => ({ eq: mockEq }));

const fakeSupabase = {
  from: vi.fn((table: string) => {
    if (table === "webhook_events") {
      return {
        insert: vi.fn().mockResolvedValue({ error: insertError }),
        delete: mockDelete,
      };
    }
    // other tables not needed by the route
    return {};
  }),
};

// ── mutable test headers ──────────────────────────────────────────────────────
let testHeaders: Record<string, string> = {};

// ── module mocks ──────────────────────────────────────────────────────────────
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => fakeSupabase,
}));

vi.mock("@/lib/indeed/ingest", () => ({
  ingestIndeedApplication: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => ({
    get: (key: string) => testHeaders[key] ?? null,
  }),
}));

// ── import under test (after mocks are registered) ───────────────────────────
import { ingestIndeedApplication } from "../../src/lib/indeed/ingest";
import { POST } from "../../src/app/api/webhooks/indeed/route";

const mockIngest = ingestIndeedApplication as ReturnType<typeof vi.fn>;

// ── minimal valid payload ─────────────────────────────────────────────────────
const PAYLOAD = {
  id: "indeed-app-001",
  applicant: { fullName: "Jane Doe", email: "jane@example.com" },
};
const BODY = JSON.stringify(PAYLOAD);

function makeRequest(body: string) {
  return new Request("http://localhost/api/webhooks/indeed", {
    method: "POST",
    body,
  });
}

// ── tests ─────────────────────────────────────────────────────────────────────
describe("POST /api/webhooks/indeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertError = null;
    testHeaders = {};
    // reset mockDelete/mockEq wiring (clearAllMocks resets call records but not implementations)
    mockEq.mockResolvedValue({ error: null });
    mockDelete.mockReturnValue({ eq: mockEq });
  });

  // ── case 1: bad/missing signature → 401, ingest NOT called ───────────────
  it("returns 401 and does not call ingest when signature is invalid", async () => {
    testHeaders["x-indeed-signature"] = "wrong-signature";
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("invalid signature");
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it("returns 401 and does not call ingest when signature header is missing", async () => {
    // testHeaders has no x-indeed-signature — get() returns null
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(401);
    expect(mockIngest).not.toHaveBeenCalled();
  });

  // ── case 2: duplicate dedup row (23505) → 200 duplicate, ingest NOT called ─
  it("returns 200 {status:'duplicate'} and does not call ingest when dedup insert conflicts", async () => {
    insertError = { code: "23505" };
    testHeaders["x-indeed-signature"] = sign(BODY);

    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("duplicate");
    expect(mockIngest).not.toHaveBeenCalled();
  });

  // ── case 3: ingest resolves "unknown_job" → 200 ───────────────────────────
  it("returns 200 {status:'unknown_job'} when ingest returns unknown_job", async () => {
    testHeaders["x-indeed-signature"] = sign(BODY);
    mockIngest.mockResolvedValue("unknown_job");

    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("unknown_job");
  });

  // ── case 4: ingest resolves "created" → 200 ──────────────────────────────
  it("returns 200 {status:'created'} when ingest returns created", async () => {
    testHeaders["x-indeed-signature"] = sign(BODY);
    mockIngest.mockResolvedValue("created");

    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("created");
  });

  // ── case 5: REGRESSION — ingest throws → 500 AND dedup row is deleted ────
  it("returns 500 and rolls back the dedup row when ingest throws", async () => {
    testHeaders["x-indeed-signature"] = sign(BODY);
    mockIngest.mockRejectedValue(new Error("candidate upsert failed"));

    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("ingest failed");

    // The rollback must have called delete().eq("id", "indeed_indeed-app-001")
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockEq).toHaveBeenCalledWith("id", `indeed_${PAYLOAD.id}`);
  });
});
