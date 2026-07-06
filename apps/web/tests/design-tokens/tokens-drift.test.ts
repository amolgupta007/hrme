/**
 * Guards packages/config/tokens.js against drifting from the web theme.
 * Source of truth: apps/web/src/app/globals.css. If you change a CSS var
 * there, update packages/config/tokens.js (and this proves you did).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// CJS module — vitest interops the default export to module.exports
import tokens from "../../../../packages/config/tokens.js";

const { palette, radius } = tokens as {
  palette: Record<"light" | "dark", Record<string, string>>;
  radius: { sm: number; md: number; lg: number };
};

const css = readFileSync(
  join(__dirname, "../../src/app/globals.css"),
  "utf8"
);

/** Extract `--name: H S% L%;` triplets from a CSS block. */
function cssVars(block: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*([\d.]+ [\d.]+% [\d.]+%)\s*;/g)) {
    vars[m[1]] = m[2];
  }
  return vars;
}

const rootBlock = css.slice(css.indexOf(":root"), css.indexOf(".dark"));
const darkStart = css.indexOf(".dark");
const darkBlock = css.slice(darkStart, css.indexOf("}", darkStart) + 1);

/** "hsl(172, 50%, 36%)" -> "172 50% 36%" */
function toTriplet(hsl: string): string {
  return hsl.replace(/^hsl\(/, "").replace(/\)$/, "").replace(/,/g, "");
}

const checked: Array<[string, string]> = [
  ["background", "background"],
  ["foreground", "foreground"],
  ["primary", "primary"],
  ["primary-foreground", "primaryForeground"],
  ["secondary", "secondary"],
  ["muted", "muted"],
  ["muted-foreground", "mutedForeground"],
  ["accent", "accent"],
  ["destructive", "destructive"],
  ["success", "success"],
  ["warning", "warning"],
  ["border", "border"],
  ["input", "input"],
  ["ring", "ring"],
  ["card", "card"],
];

describe("design token drift (globals.css ↔ @jambahr/config/tokens)", () => {
  const rootVars = cssVars(rootBlock);
  const darkVars = cssVars(darkBlock);

  it.each(checked)("light %s matches", (cssName, tokenName) => {
    expect(toTriplet(palette.light[tokenName])).toBe(rootVars[cssName]);
  });

  it.each(checked)("dark %s matches", (cssName, tokenName) => {
    expect(toTriplet(palette.dark[tokenName])).toBe(darkVars[cssName]);
  });

  it("radius.lg matches --radius (0.625rem = 10px)", () => {
    expect(css).toContain("--radius: 0.625rem");
    expect(radius.lg).toBe(10);
    expect(radius.md).toBe(8);
    expect(radius.sm).toBe(6);
  });
});
