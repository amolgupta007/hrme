import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import remarkGfm from "remark-gfm";
import type { LegalSlug } from "@/config/legal";

const LEGAL_DIR = path.join(process.cwd(), "src/content/legal");

export type LegalDoc = {
  slug: LegalSlug;
  title: string;
  effective: string;
  version: string;
  content: string;
};

export async function getLegalDoc(slug: LegalSlug): Promise<LegalDoc | null> {
  const filePath = path.join(LEGAL_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  const processed = await remark()
    .use(remarkGfm)
    .use(html, { sanitize: false })
    .process(content);

  return {
    slug,
    title: data.title ?? "",
    effective: data.effective ?? "",
    version: data.version ?? "",
    content: processed.toString(),
  };
}
