import { describe, it, expect } from "vitest";
import { parseMarkdown, parseInline } from "@/lib/documents/markdown";

describe("parseInline", () => {
  it("splits bold and italic runs", () => {
    const runs = parseInline("plain **bold** and *italic* end");
    expect(runs).toEqual([
      { text: "plain ", bold: undefined, italic: undefined },
      { text: "bold", bold: true, italic: undefined },
      { text: " and ", bold: undefined, italic: undefined },
      { text: "italic", bold: undefined, italic: true },
      { text: " end", bold: undefined, italic: undefined },
    ]);
  });

  it("returns a single run for plain text", () => {
    expect(parseInline("hello")).toEqual([{ text: "hello" }]);
  });
});

describe("parseMarkdown", () => {
  it("parses headings, paragraphs, and lists", () => {
    const blocks = parseMarkdown(
      "# Title\n\nA paragraph line\nwrapped.\n\n- one\n- two\n\n1. first\n2. second"
    );
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
    expect(blocks[1].type === "paragraph" && blocks[1].runs[0].text).toContain("wrapped");
    expect(blocks[2]).toMatchObject({ type: "ul" });
    expect(blocks[2].type === "ul" && blocks[2].items.length).toBe(2);
    expect(blocks[3]).toMatchObject({ type: "ol" });
    expect(blocks[3].type === "ol" && blocks[3].items.length).toBe(2);
  });

  it("handles empty input", () => {
    expect(parseMarkdown("")).toEqual([]);
  });
});
