import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeAppHelpTools } from "@/lib/assistant/tools/app-help";

vi.mock("@/lib/assistant/embeddings", () => ({
  embed: vi.fn(async () => [Array(1024).fill(0.1)]),
}));

const rpcMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ rpc: rpcMock }),
}));

// Articles for the test, mapped by their id. route_key values reference real ROUTE_REGISTRY entries.
const ARTICLES: Record<string, any> = {
  approve_leave: {
    id: "approve_leave",
    title: "Approve a leave request",
    summary: "Manager/admin actions a pending request.",
    body: "",
    steps: [],
    route_key: "approve_leave",
    allowed_roles: ["owner", "admin", "manager"],
    plan_tier: "starter",
  },
  request_leave: {
    id: "request_leave",
    title: "Apply for leave",
    summary: "Submit a leave request.",
    body: "",
    steps: [],
    route_key: "request_leave",
    allowed_roles: ["owner", "admin", "manager", "employee"],
    plan_tier: "starter",
  },
  run_payroll: {
    id: "run_payroll",
    title: "Run payroll",
    summary: "Process a monthly run.",
    body: "",
    steps: [],
    route_key: "run_payroll",
    allowed_roles: ["owner", "admin"],
    plan_tier: "business",
  },
};

vi.mock("@/lib/assistant/help", () => ({
  getHelpArticle: (id: string) => ARTICLES[id] ?? null,
  listHelpArticles: () => Object.values(ARTICLES),
}));

const baseCtx = {
  role: "employee" as const,
  plan: "business" as const,
  orgFeatures: { jambaHireEnabled: false, attendanceEnabled: true, grievancesEnabled: true },
};

describe("app_help.search", () => {
  beforeEach(() => rpcMock.mockReset());

  it("dedupes by article_id and respects max_results, filtering by role", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { article_id: "approve_leave", content: "chunk a", similarity: 0.9 },
        { article_id: "approve_leave", content: "chunk b", similarity: 0.85 },
        { article_id: "request_leave", content: "chunk c", similarity: 0.8 },
        { article_id: "run_payroll", content: "chunk d", similarity: 0.7 },
      ],
      error: null,
    });
    // Use admin role so all three article types are accessible; tests dedup + max_results cap.
    const tools = makeAppHelpTools({ ...baseCtx, role: "admin" });
    const result = await (tools["app_help.search"] as any).execute({
      query: "approve leave",
      max_results: 2,
    });
    // approve_leave deduplicated to 1 entry, request_leave is 2nd; run_payroll excluded by max_results=2.
    expect(result.length).toBe(2);
    expect(result.map((r: any) => r.id)).toEqual(["approve_leave", "request_leave"]);
  });

  it("filters by plan tier", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { article_id: "run_payroll", content: "chunk x", similarity: 0.9 },
        { article_id: "request_leave", content: "chunk y", similarity: 0.8 },
      ],
      error: null,
    });
    const tools = makeAppHelpTools({ ...baseCtx, plan: "starter" });
    const result = await (tools["app_help.search"] as any).execute({ query: "anything" });
    // starter cannot access business-tier run_payroll
    expect(result.map((r: any) => r.id)).toEqual(["request_leave"]);
  });

  it("propagates rpc errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("rpc boom") });
    const tools = makeAppHelpTools(baseCtx);
    await expect(
      (tools["app_help.search"] as any).execute({ query: "test" }),
    ).rejects.toThrow(/rpc boom/);
  });
});

describe("app_help.get_steps", () => {
  it("returns null for unknown id", async () => {
    const tools = makeAppHelpTools(baseCtx);
    const r = await (tools["app_help.get_steps"] as any).execute({ id: "not_real" });
    expect(r).toBeNull();
  });

  it("returns null for inaccessible article (role gate)", async () => {
    const tools = makeAppHelpTools(baseCtx);
    const r = await (tools["app_help.get_steps"] as any).execute({ id: "approve_leave" });
    expect(r).toBeNull();
  });

  it("returns steps for accessible article", async () => {
    const tools = makeAppHelpTools({ ...baseCtx, role: "admin" });
    const r = await (tools["app_help.get_steps"] as any).execute({ id: "approve_leave" });
    expect(r).not.toBeNull();
    expect(r.id).toBe("approve_leave");
    expect(r.route_key).toBe("approve_leave");
  });
});

describe("app_help.get_route", () => {
  it("returns null for unknown key", async () => {
    const tools = makeAppHelpTools(baseCtx);
    const r = await (tools["app_help.get_route"] as any).execute({ feature_key: "not_real" });
    expect(r).toBeNull();
  });

  it("blocks payroll route for starter plan", async () => {
    const tools = makeAppHelpTools({ ...baseCtx, plan: "starter" });
    const r = await (tools["app_help.get_route"] as any).execute({ feature_key: "run_payroll" });
    expect(r).toBeNull();
  });

  it("returns route for accessible feature", async () => {
    const tools = makeAppHelpTools(baseCtx);
    const r = await (tools["app_help.get_route"] as any).execute({ feature_key: "approve_leave" });
    expect(r).not.toBeNull();
    expect(r.path).toBe("/dashboard/leaves");
  });

  it("blocks route requiring an org feature when that feature is off", async () => {
    const tools = makeAppHelpTools({
      ...baseCtx,
      orgFeatures: { ...baseCtx.orgFeatures, attendanceEnabled: false },
    });
    const r = await (tools["app_help.get_route"] as any).execute({ feature_key: "clock_in_out" });
    expect(r).toBeNull();
  });
});
