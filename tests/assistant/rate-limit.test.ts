import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRateLimit, HOURLY_LIMIT } from "@/lib/assistant/rate-limit";

// The rate-limit module calls createAdminSupabase() then builds a fluent chain:
//   supabase.from(...).select(...).eq(...).gte(...).eq(...)
// The final resolved value is { count, error }.
// We mock by making every method in the chain return the same proxy, except the
// last awaitable resolution — we use a getter on "then" so the chain itself is
// a thenable that resolves to { count, error } set per-test.

let mockCount: number | null = 0;
let mockError: Error | null = null;

vi.mock("@/lib/supabase/server", () => {
  function makeChain(): any {
    const chain: any = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            // The chain is awaited — resolve with the test fixture.
            return (resolve: (v: unknown) => void) =>
              resolve({ count: mockCount, error: mockError });
          }
          // Any method call (select, eq, gte, …) returns the same chain proxy.
          return (..._args: unknown[]) => chain;
        },
      }
    );
    return chain;
  }

  return {
    createAdminSupabase: () => ({
      from: () => makeChain(),
    }),
  };
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    mockCount = 0;
    mockError = null;
  });

  it("allows when under the hourly cap", async () => {
    mockCount = 10;
    const v = await checkRateLimit("emp-1");
    expect(v).toEqual({ allowed: true, remaining: HOURLY_LIMIT - 10 });
  });

  it("blocks exactly at the hourly cap", async () => {
    mockCount = HOURLY_LIMIT;
    const v = await checkRateLimit("emp-1");
    expect(v).toEqual({ allowed: false, reason: "hourly-limit" });
  });

  it("blocks when over the cap", async () => {
    mockCount = HOURLY_LIMIT + 5;
    const v = await checkRateLimit("emp-1");
    expect(v).toEqual({ allowed: false, reason: "hourly-limit" });
  });

  it("treats null count as zero (no messages)", async () => {
    mockCount = null;
    const v = await checkRateLimit("emp-1");
    expect(v).toEqual({ allowed: true, remaining: HOURLY_LIMIT });
  });

  it("propagates errors from the rpc layer", async () => {
    mockError = new Error("db down");
    await expect(checkRateLimit("emp-1")).rejects.toThrow(/db down/);
  });
});
