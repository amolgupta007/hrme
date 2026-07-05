import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { HelpArticle, HelpFrontmatter } from "./types";

const ARTICLES_DIR = path.join(process.cwd(), "src/lib/assistant/help/articles");

function parseSteps(body: string): Array<{ n: number; instruction: string }> {
  // Normalize CRLF → LF first. On Windows checkouts the file lands with \r\n
  // and the `(.+)$` regex below would otherwise fail because `.` doesn't match
  // `\r` and `$` only matches end-of-string or before `\n`.
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const steps: Array<{ n: number; instruction: string }> = [];
  const re = /^\s*(\d+)\.\s+(.+)$/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) steps.push({ n: parseInt(m[1], 10), instruction: m[2].trim() });
  }
  return steps;
}

function readArticleFile(filename: string): HelpArticle {
  const raw = readFileSync(path.join(ARTICLES_DIR, filename), "utf8");
  const parsed = matter(raw);
  const fm = parsed.data as HelpFrontmatter;
  if (!fm.id || !fm.title || !fm.route_key) {
    throw new Error(`Help article ${filename} missing required frontmatter (id/title/route_key)`);
  }
  return { ...fm, body: parsed.content, steps: parseSteps(parsed.content) };
}

let cached: HelpArticle[] | null = null;
export function listHelpArticles(): HelpArticle[] {
  if (cached) return cached;
  const files = readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".md"));
  cached = files.map(readArticleFile);
  return cached;
}

export function getHelpArticle(id: string): HelpArticle | null {
  return listHelpArticles().find((a) => a.id === id) ?? null;
}

// For tests: clears the in-memory cache so changes to the articles directory are reflected.
export function clearHelpCache(): void {
  cached = null;
}
