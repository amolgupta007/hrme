import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chunkMarkdown, embed } from "@/lib/assistant/embeddings";

describe("chunkMarkdown", () => {
  it("returns one chunk for short input", () => {
    expect(chunkMarkdown("Hello world.", 600)).toEqual(["Hello world."]);
  });

  it("splits at paragraph boundaries when content exceeds target", () => {
    const para = "x".repeat(2000); // roughly 500 tokens worth of chars
    const md = `${para}\n\n${para}\n\n${para}`;
    const chunks = chunkMarkdown(md, 200, 50);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("returns empty array for empty input", () => {
    expect(chunkMarkdown("")).toEqual([]);
  });
});

describe("embed", () => {
  const originalKey = process.env.VOYAGE_API_KEY;
  beforeEach(() => {
    process.env.VOYAGE_API_KEY = "test-key";
  });
  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.VOYAGE_API_KEY;
    } else {
      process.env.VOYAGE_API_KEY = originalKey;
    }
    vi.restoreAllMocks();
  });

  it("throws when key is missing", async () => {
    delete process.env.VOYAGE_API_KEY;
    await expect(embed({ texts: ["x"], inputType: "query" })).rejects.toThrow(/VOYAGE_API_KEY/);
  });

  it("calls voyage api with correct model + input_type and returns embeddings", async () => {
    const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 })
    );

    const result = await embed({ texts: ["hello"], inputType: "document" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("https://api.voyageai.com/v1/embeddings");
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.model).toBe("voyage-3-large");
    expect(body.input_type).toBe("document");
    expect(body.input).toEqual(["hello"]);
    expect(result).toEqual([[0.1, 0.2, 0.3]]);
  });

  it("surfaces voyage error responses", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("rate limit", { status: 429 })
    );
    await expect(embed({ texts: ["x"], inputType: "query" })).rejects.toThrow(/429/);
  });
});
