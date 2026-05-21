import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkBudget, recordUsage } from "@/lib/assistant/budget";
import { PLAN_BUDGET_PAISE } from "@/lib/assistant/pricing";

// Mock @/lib/supabase/server.
//
// createAdminSupabase() must support two call patterns:
//   1. SELECT chain: .from().select().eq().eq().maybeSingle() → resolves { data: fixture, error: null }
//   2. UPSERT chain: .from().upsert(...) → resolves { error: null }
//
// We use the same Proxy-chain technique as rate-limit.test.ts.
// Every method returns the proxy itself; awaiting (via "then") resolves to the
// per-test fixture.  For .upsert() we specifically resolve { error: null } so
// write operations are a no-op.

let selectFixture: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/server", () => {
  function makeChain(resolveValue: () => unknown): any {
    const chain: any = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve(resolveValue());
          }
          // upsert resolves immediately with { error: null }
          if (prop === "upsert") {
            return () => Promise.resolve({ error: null });
          }
          // All other method calls (select, eq, gte, maybeSingle, …) return the chain.
          return (..._args: unknown[]) => chain;
        },
      }
    );
    return chain;
  }

  return {
    createAdminSupabase: () => ({
      from: () => makeChain(() => ({ data: selectFixture, error: null })),
    }),
  };
});

describe("checkBudget", () => {
  beforeEach(() => {
    selectFixture = null;
  });

  it("allows when used is below cap", async () => {
    // growth plan cap = 50000 paise; used = 10000 (below cap)
    selectFixture = { cost_inr_paise: 10_000, hard_cap_inr_paise: null, hard_paused_at: null };
    const result = await checkBudget("org-1", "growth");
    expect(result).toEqual({
      allowed: true,
      usedPaise: 10_000,
      capPaise: PLAN_BUDGET_PAISE.growth, // 50000
    });
  });

  it("blocks when used equals cap", async () => {
    // growth plan cap = 50000; used = 50000
    selectFixture = { cost_inr_paise: 50_000, hard_cap_inr_paise: null, hard_paused_at: null };
    const result = await checkBudget("org-1", "growth");
    expect(result).toEqual({
      allowed: false,
      reason: "budget-exceeded",
      usedPaise: 50_000,
      capPaise: PLAN_BUDGET_PAISE.growth,
    });
  });

  it("blocks when used exceeds cap", async () => {
    selectFixture = { cost_inr_paise: 60_000, hard_cap_inr_paise: null, hard_paused_at: null };
    const result = await checkBudget("org-1", "growth");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("budget-exceeded");
    }
  });

  it("uses hard_cap_inr_paise override when present", async () => {
    // Per-org override of 1000 paise; used = 1000 → blocked
    selectFixture = { cost_inr_paise: 1_000, hard_cap_inr_paise: 1_000, hard_paused_at: null };
    const result = await checkBudget("org-1", "business");
    expect(result.allowed).toBe(false);
  });

  it("always allows when cap is 0 (starter plan, no row)", async () => {
    // No row → data is null → used = 0, cap = PLAN_BUDGET_PAISE.starter = 0
    selectFixture = null;
    const result = await checkBudget("org-1", "starter");
    expect(result).toEqual({ allowed: true, usedPaise: 0, capPaise: 0 });
  });

  it("always allows when cap is 0 via explicit override", async () => {
    selectFixture = { cost_inr_paise: 999, hard_cap_inr_paise: 0, hard_paused_at: null };
    const result = await checkBudget("org-1", "business");
    // cap=0 → guard `cap > 0` is false → always allowed
    expect(result.allowed).toBe(true);
  });
});

describe("recordUsage", () => {
  beforeEach(() => {
    selectFixture = null;
  });

  it("returns correct usedPaise and capPaise when no prior row", async () => {
    // No existing row; 1M in + 1M out = 154800 paise delta
    selectFixture = null;
    const result = await recordUsage({
      orgId: "org-1",
      plan: "business",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(result.usedPaise).toBe(154_800);
    expect(result.capPaise).toBe(PLAN_BUDGET_PAISE.business); // 200000
  });

  it("sets crossedSoftCap=true exactly when prevUsed < 80% and newUsed >= 80%", async () => {
    // business cap = 200000; soft threshold = 160000
    // prevUsed = 159000, delta = 100k/50k → 9030 paise → newUsed = 168030 >= 160000
    selectFixture = {
      cost_inr_paise: 159_000,
      input_tokens: 500_000,
      output_tokens: 200_000,
      hard_cap_inr_paise: null,
      soft_alert_sent_at: null,
      hard_paused_at: null,
    };
    const result = await recordUsage({
      orgId: "org-1",
      plan: "business",
      inputTokens: 100_000,
      outputTokens: 50_000, // delta = 9030; newUsed = 168030
    });
    expect(result.crossedSoftCap).toBe(true);
    expect(result.crossedHardCap).toBe(false);
    expect(result.usedPaise).toBe(159_000 + 9_030); // 168030
  });

  it("does NOT set crossedSoftCap when soft_alert_sent_at is already set", async () => {
    // Same numbers but soft_alert_sent_at already populated → no re-fire
    selectFixture = {
      cost_inr_paise: 159_000,
      input_tokens: 500_000,
      output_tokens: 200_000,
      hard_cap_inr_paise: null,
      soft_alert_sent_at: "2026-05-21T00:00:00.000Z",
      hard_paused_at: null,
    };
    const result = await recordUsage({
      orgId: "org-1",
      plan: "business",
      inputTokens: 100_000,
      outputTokens: 50_000,
    });
    expect(result.crossedSoftCap).toBe(false);
  });

  it("sets crossedHardCap=true when newUsed crosses the hard cap and not previously paused", async () => {
    // business cap = 200000; prevUsed = 195000; delta = 9030 → newUsed = 204030 >= 200000
    selectFixture = {
      cost_inr_paise: 195_000,
      input_tokens: 1_000_000,
      output_tokens: 500_000,
      hard_cap_inr_paise: null,
      soft_alert_sent_at: "2026-05-21T00:00:00.000Z", // already alerted
      hard_paused_at: null,
    };
    const result = await recordUsage({
      orgId: "org-1",
      plan: "business",
      inputTokens: 100_000,
      outputTokens: 50_000, // delta = 9030; newUsed = 204030
    });
    expect(result.crossedHardCap).toBe(true);
    expect(result.usedPaise).toBe(195_000 + 9_030); // 204030
  });

  it("does NOT set crossedHardCap when hard_paused_at is already set", async () => {
    selectFixture = {
      cost_inr_paise: 195_000,
      input_tokens: 1_000_000,
      output_tokens: 500_000,
      hard_cap_inr_paise: null,
      soft_alert_sent_at: "2026-05-21T00:00:00.000Z",
      hard_paused_at: "2026-05-21T01:00:00.000Z",
    };
    const result = await recordUsage({
      orgId: "org-1",
      plan: "business",
      inputTokens: 100_000,
      outputTokens: 50_000,
    });
    expect(result.crossedHardCap).toBe(false);
  });

  it("neither flag fires when cap is 0 (starter)", async () => {
    // starter cap = 0; guard `cap > 0` is false → both flags stay false
    selectFixture = null;
    const result = await recordUsage({
      orgId: "org-1",
      plan: "starter",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(result.crossedSoftCap).toBe(false);
    expect(result.crossedHardCap).toBe(false);
    expect(result.capPaise).toBe(0);
  });
});
