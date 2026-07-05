import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDocsTools } from "@/lib/assistant/tools/docs";

vi.mock("@/lib/assistant/embeddings", () => ({
  embed: vi.fn(async () => [Array(1024).fill(0.1)]),
}));

// ---------------------------------------------------------------------------
// Flexible Supabase proxy mock
//
// Every Supabase builder method (from, select, in, eq, order, limit, maybeSingle)
// returns the same proxy so chains can be arbitrarily long. Awaiting the proxy
// resolves the value stored in `__resolve`. `rpc` also returns a thenable.
// Per-test, call `setNextResolve(value)` to set what the next await returns.
// For tests that need multiple distinct results in sequence, use
// `setResolveQueue([val1, val2, ...])` — each await pops the front.
// ---------------------------------------------------------------------------

let resolveQueue: unknown[] = [];

function setNextResolve(value: unknown) {
  resolveQueue = [value];
}

function setResolveQueue(values: unknown[]) {
  resolveQueue = [...values];
}

function makeProxy(): any {
  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          // thenable — resolves the next value from the queue
          return (resolve: (v: unknown) => void) => {
            const val = resolveQueue.shift();
            resolve(val);
          };
        }
        // All builder methods return the same proxy
        return (..._args: unknown[]) => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    rpc: (..._args: unknown[]) => makeProxy(),
    from: (..._args: unknown[]) => makeProxy(),
  }),
}));

const ctx = { orgId: "org-123", employeeId: "emp-456" };

// ---------------------------------------------------------------------------
// docs_search
// ---------------------------------------------------------------------------

describe("docs_search", () => {
  beforeEach(() => {
    resolveQueue = [];
  });

  it("returns hydrated results filtered to company-wide docs", async () => {
    // rpc returns two chunk rows
    setResolveQueue([
      {
        data: [
          { chunk_id: "c1", document_id: "d1", content: "Leave policy text", page_or_section: "1", similarity: 0.9 },
          { chunk_id: "c2", document_id: "d2", content: "Code of conduct text", page_or_section: null, similarity: 0.8 },
        ],
        error: null,
      },
      // documents query returns both docs (both company-wide)
      {
        data: [
          { id: "d1", name: "Leave Policy", category: "policy", is_company_wide: true, requires_acknowledgment: false },
          { id: "d2", name: "Code of Conduct", category: "policy", is_company_wide: true, requires_acknowledgment: true },
        ],
      },
    ]);

    const tools = makeDocsTools(ctx);
    const result = await (tools["docs_search"] as any).execute({ query: "leave policy", max_results: 5 });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      chunk_id: "c1",
      document_id: "d1",
      title: "Leave Policy",
      category: "policy",
      score: 0.9,
    });
    expect(result[0].snippet).toBe("Leave policy text");
    expect(result[1]).toMatchObject({ chunk_id: "c2", document_id: "d2", title: "Code of Conduct" });
  });

  it("filters OUT a document_id not returned by the documents query (not company-wide / wrong org)", async () => {
    setResolveQueue([
      {
        data: [
          { chunk_id: "c1", document_id: "d1", content: "visible chunk", page_or_section: null, similarity: 0.95 },
          { chunk_id: "c2", document_id: "d-private", content: "private doc chunk", page_or_section: null, similarity: 0.88 },
        ],
        error: null,
      },
      // documents query only returns d1 (d-private excluded because not company-wide)
      {
        data: [
          { id: "d1", name: "HR Handbook", category: "policy", is_company_wide: true, requires_acknowledgment: false },
        ],
      },
    ]);

    const tools = makeDocsTools(ctx);
    const result = await (tools["docs_search"] as any).execute({ query: "handbook" });

    expect(result).toHaveLength(1);
    expect(result[0].document_id).toBe("d1");
    // d-private must NOT appear
    expect(result.find((r: any) => r.document_id === "d-private")).toBeUndefined();
  });

  it("returns [] when the RPC returns no rows", async () => {
    setResolveQueue([{ data: [], error: null }]);

    const tools = makeDocsTools(ctx);
    const result = await (tools["docs_search"] as any).execute({ query: "anything goes" });

    expect(result).toEqual([]);
  });

  it("propagates an RPC error", async () => {
    setResolveQueue([{ data: null, error: new Error("rpc boom") }]);

    const tools = makeDocsTools(ctx);
    await expect(
      (tools["docs_search"] as any).execute({ query: "something" }),
    ).rejects.toThrow(/rpc boom/);
  });
});

// ---------------------------------------------------------------------------
// docs_get_chunk
// ---------------------------------------------------------------------------

describe("docs_get_chunk", () => {
  beforeEach(() => {
    resolveQueue = [];
  });

  it("returns null for a chunk not in the caller's org", async () => {
    // doc_chunks query returns no row (org mismatch)
    setResolveQueue([{ data: null }]);

    const tools = makeDocsTools(ctx);
    const result = await (tools["docs_get_chunk"] as any).execute({ chunk_id: "c-unknown" });

    expect(result).toBeNull();
  });

  it("reports user_has_acknowledged correctly when an ack row exists", async () => {
    setResolveQueue([
      // doc_chunks row
      {
        data: {
          id: "c1",
          document_id: "d1",
          content: "Full policy text here",
          page_or_section: "Section 2",
          org_id: "org-123",
        },
      },
      // documents row (requires_acknowledgment: true)
      {
        data: {
          id: "d1",
          name: "Leave Policy",
          requires_acknowledgment: true,
          is_company_wide: true,
        },
      },
      // document_acknowledgments — ack exists
      { data: { id: "ack-1" } },
    ]);

    const tools = makeDocsTools(ctx);
    const result = await (tools["docs_get_chunk"] as any).execute({ chunk_id: "c1" });

    expect(result).not.toBeNull();
    expect(result.chunk_id).toBe("c1");
    expect(result.title).toBe("Leave Policy");
    expect(result.content).toBe("Full policy text here");
    expect(result.requires_acknowledgment).toBe(true);
    expect(result.user_has_acknowledged).toBe(true);
  });

  it("reports user_has_acknowledged false when no ack row exists", async () => {
    setResolveQueue([
      {
        data: {
          id: "c2",
          document_id: "d2",
          content: "Code of conduct body",
          page_or_section: null,
          org_id: "org-123",
        },
      },
      {
        data: {
          id: "d2",
          name: "Code of Conduct",
          requires_acknowledgment: true,
          is_company_wide: true,
        },
      },
      // no ack
      { data: null },
    ]);

    const tools = makeDocsTools(ctx);
    const result = await (tools["docs_get_chunk"] as any).execute({ chunk_id: "c2" });

    expect(result).not.toBeNull();
    expect(result.user_has_acknowledged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// docs_list_recent
// ---------------------------------------------------------------------------

describe("docs_list_recent", () => {
  beforeEach(() => {
    resolveQueue = [];
  });

  it("returns mapped document list", async () => {
    setResolveQueue([
      {
        data: [
          { id: "d1", name: "IT Policy", category: "policy", created_at: "2026-05-10T09:00:00Z" },
          { id: "d2", name: "NDA Template", category: "contract", created_at: "2026-05-08T09:00:00Z" },
        ],
        error: null,
      },
    ]);

    const tools = makeDocsTools(ctx);
    const result = await (tools["docs_list_recent"] as any).execute({ limit: 5 });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ document_id: "d1", title: "IT Policy", category: "policy" });
    expect(result[1]).toMatchObject({ document_id: "d2", title: "NDA Template", category: "contract" });
  });

  it("filters by category when provided", async () => {
    setResolveQueue([
      {
        data: [
          { id: "d3", name: "Employment Contract", category: "contract", created_at: "2026-05-01T09:00:00Z" },
        ],
        error: null,
      },
    ]);

    const tools = makeDocsTools(ctx);
    const result = await (tools["docs_list_recent"] as any).execute({ category: "contract", limit: 3 });

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("contract");
  });

  it("propagates a query error", async () => {
    setResolveQueue([{ data: null, error: new Error("query failed") }]);

    const tools = makeDocsTools(ctx);
    await expect(
      (tools["docs_list_recent"] as any).execute({}),
    ).rejects.toThrow(/query failed/);
  });
});
