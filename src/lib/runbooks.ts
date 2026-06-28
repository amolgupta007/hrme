import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import remarkGfm from "remark-gfm";

const RUNBOOKS_DIR = path.join(process.cwd(), "src/content/runbooks");

export interface RunbookMeta {
  slug: string;
  title: string;
  summary: string;
  updated: string;
}

export interface Runbook extends RunbookMeta {
  contentHtml: string;
}

export function getAllRunbooks(): RunbookMeta[] {
  if (!fs.existsSync(RUNBOOKS_DIR)) return [];
  return fs
    .readdirSync(RUNBOOKS_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(RUNBOOKS_DIR, file), "utf-8");
      const { data } = matter(raw);
      return {
        slug: file.replace(/\.md$/, ""),
        title: data.title ?? file.replace(/\.md$/, ""),
        summary: data.summary ?? "",
        updated: data.updated ?? "",
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function getRunbook(slug: string): Promise<Runbook | null> {
  const filePath = path.join(RUNBOOKS_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  const processed = await remark()
    .use(remarkGfm)
    .use(html, { sanitize: false })
    .process(content);

  return {
    slug,
    title: data.title ?? slug,
    summary: data.summary ?? "",
    updated: data.updated ?? "",
    contentHtml: processed.toString(),
  };
}
