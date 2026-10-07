import { describe, it, expect } from "vitest";
import { announcementExcerpt } from "../../src/lib/announcements/excerpt";

describe("announcementExcerpt", () => {
  it("strips markdown to plain text on one line", () => {
    const md = "## Diwali break\n\nThe office is **closed** from _20 Oct_.\n\n- Enjoy\n- [Holiday list](https://x.test/h)";
    expect(announcementExcerpt(md)).toBe("Diwali break The office is closed from 20 Oct. Enjoy Holiday list");
  });

  it("leaves short text untouched", () => {
    expect(announcementExcerpt("Please read.")).toBe("Please read.");
  });

  it("cuts long text at a word boundary with an ellipsis", () => {
    const out = announcementExcerpt("word ".repeat(100), 30);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(31);
    expect(out).not.toMatch(/wor…$/);
  });

  it("keeps emoji intact", () => {
    expect(announcementExcerpt("🪔 Happy Diwali 🪔")).toBe("🪔 Happy Diwali 🪔");
  });
});
