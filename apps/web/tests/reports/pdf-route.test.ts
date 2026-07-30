import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
  isAdmin: (role: string) => role === "owner" || role === "admin",
}));
const fetchData = vi.fn();
vi.mock("@/lib/reports/fetch-report-data", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/reports/fetch-report-data")>();
  return { ...real, fetchAttendanceReportData: (...a: unknown[]) => fetchData(...a) };
});
const renderPdf = vi.fn();
vi.mock("@/lib/reports/attendance-pdf", () => ({
  renderAttendanceReportPdf: (...a: unknown[]) => renderPdf(...a),
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { name: "TestOrg" } }) }) }) }),
  }),
}));

import { GET } from "@/app/api/reports/attendance/pdf/route";

function req(qs: string) {
  return new Request(`http://localhost/api/reports/attendance/pdf?${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  renderPdf.mockResolvedValue(Buffer.from("%PDF-fake"));
  fetchData.mockResolvedValue({ from: "2026-07-01", to: "2026-07-31", dates: [], orgName: "TestOrg", generatedAt: "", employees: [] });
});

describe("GET /api/reports/attendance/pdf", () => {
  it("401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(req("from=2026-07-01&to=2026-07-31"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });
  it("403 for non-admin", async () => {
    getCurrentUser.mockResolvedValue({ role: "employee", orgId: "o1" });
    const res = await GET(req("from=2026-07-01&to=2026-07-31"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
  });
  it("400 on invalid or oversized range", async () => {
    getCurrentUser.mockResolvedValue({ role: "admin", orgId: "o1" });
    const res = await GET(req("from=2026-01-01&to=2026-06-30"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_range");
    expect(fetchData).not.toHaveBeenCalled();
  });
  it("200 streams a PDF attachment", async () => {
    getCurrentUser.mockResolvedValue({ role: "admin", orgId: "o1" });
    const res = await GET(req("from=2026-07-01&to=2026-07-31"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("attendance-");
    expect(res.headers.get("content-disposition")).toContain("2026-07-01-2026-07-31.pdf");
  });
  it("500 render_failed hides internals", async () => {
    getCurrentUser.mockResolvedValue({ role: "admin", orgId: "o1" });
    renderPdf.mockRejectedValue(new Error("secret internal stack"));
    const res = await GET(req("from=2026-07-01&to=2026-07-31"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "render_failed" });
  });
});
