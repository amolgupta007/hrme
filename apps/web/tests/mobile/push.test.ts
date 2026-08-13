import { describe, expect, it, vi, beforeEach } from "vitest";
import { sendPush } from "@/lib/mobile/push";

function makeSupabase(tokenRows: Array<{ id: string; expo_push_token: string }>) {
  const deleteCalls: string[] = [];
  const supabase = {
    from: (table: string) => {
      if (table === "push_tokens") {
        return {
          select: () => ({
            in: async () => ({ data: tokenRows, error: null }),
          }),
          delete: () => ({
            eq: (_col: string, id: string) => {
              deleteCalls.push(id);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase, deleteCalls };
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
});

describe("sendPush — Android routing", () => {
  async function capture(data: Record<string, unknown> | undefined) {
    const { supabase } = makeSupabase([{ id: "t1", expo_push_token: "ExponentPushToken[aaa]" }]);
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      json: async () => ({ data: [{ status: "ok" }] }),
    }));
    global.fetch = fetchMock as any;
    await sendPush(supabase, ["emp-1"], { title: "t", body: "b", data });
    return JSON.parse(fetchMock.mock.calls[0]![1].body as string)[0];
  }

  it("sends an approval on the high-importance channel at high priority", async () => {
    // These two must move together: a high-importance channel delivered at
    // normal FCM priority still waits for the next maintenance window.
    expect(await capture({ type: "approval_pending" })).toMatchObject({
      channelId: "approvals_v1",
      priority: "high",
    });
  });

  it("sends informational notifications on the updates channel", async () => {
    expect(await capture({ type: "payslip_paid" })).toMatchObject({
      channelId: "updates_v1",
      priority: "normal",
    });
  });

  it("falls back to updates when there is no type at all", async () => {
    expect(await capture(undefined)).toMatchObject({ channelId: "updates_v1" });
  });
});

describe("sendPush", () => {
  it("returns immediately for an empty employeeIds array (no fetch)", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;
    await sendPush({} as any, [], { title: "t", body: "b" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts one batch containing both messages for two tokens", async () => {
    const { supabase } = makeSupabase([
      { id: "tok-1", expo_push_token: "ExponentPushToken[aaa]" },
      { id: "tok-2", expo_push_token: "ExponentPushToken[bbb]" },
    ]);
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      json: async () => ({ data: [{ status: "ok" }, { status: "ok" }] }),
    }));
    global.fetch = fetchMock as any;

    await sendPush(supabase, ["emp-1", "emp-2"], {
      title: "Leave approved",
      body: "Your leave request has been approved.",
      data: { type: "leave_decision" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>).Accept).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      to: "ExponentPushToken[aaa]",
      title: "Leave approved",
      body: "Your leave request has been approved.",
      sound: "default",
      // Android routing. Without a channelId the notification is delivered on a
      // silent fallback channel — no banner, no sound, nothing in the logs.
      channelId: "updates_v1",
      priority: "normal",
    });
    expect(body[1].to).toBe("ExponentPushToken[bbb]");
  });

  it("resolves without throwing when fetch rejects", async () => {
    const { supabase } = makeSupabase([{ id: "tok-1", expo_push_token: "ExponentPushToken[aaa]" }]);
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as any;

    await expect(
      sendPush(supabase, ["emp-1"], { title: "t", body: "b" })
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing when the supabase lookup itself throws", async () => {
    const supabase = {
      from: () => {
        throw new Error("db down");
      },
    };
    await expect(
      sendPush(supabase, ["emp-1"], { title: "t", body: "b" })
    ).resolves.toBeUndefined();
  });

  it("deletes the token row on a DeviceNotRegistered receipt", async () => {
    const { supabase, deleteCalls } = makeSupabase([
      { id: "tok-1", expo_push_token: "ExponentPushToken[stale]" },
      { id: "tok-2", expo_push_token: "ExponentPushToken[good]" },
    ]);
    global.fetch = vi.fn(async () => ({
      json: async () => ({
        data: [
          { status: "error", details: { error: "DeviceNotRegistered" } },
          { status: "ok" },
        ],
      }),
    })) as any;

    await sendPush(supabase, ["emp-1", "emp-2"], { title: "t", body: "b" });

    expect(deleteCalls).toEqual(["tok-1"]);
  });

  it("chunks more than 100 tokens into multiple batches", async () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({
      id: `tok-${i}`,
      expo_push_token: `ExponentPushToken[${i}]`,
    }));
    const { supabase } = makeSupabase(rows);
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      json: async () => ({ data: [] }),
    }));
    global.fetch = fetchMock as any;

    await sendPush(
      supabase,
      rows.map((_, i) => `emp-${i}`),
      { title: "t", body: "b" }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBatch = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    const secondBatch = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
    expect(firstBatch).toHaveLength(100);
    expect(secondBatch).toHaveLength(50);
  });
});
