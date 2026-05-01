/* eslint-disable @typescript-eslint/no-var-requires */
const mammoth = require("mammoth");
const fs = require("fs");
const path = require("path");

const VERSION = "2026-05-01";
const OUT_DIR = path.join(process.cwd(), "src/content/legal");
const SRC_DIR = path.join(process.cwd(), "sample-documents/policy");

const SOURCES = [
  { docx: "JambaHR_Privacy_Policy.docx", slug: "privacy", title: "Privacy Policy" },
  { docx: "TERMS OF SERVICE.docx",       slug: "terms",   title: "Terms of Service" },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const s of SOURCES) {
    const input = path.join(SRC_DIR, s.docx);
    if (!fs.existsSync(input)) {
      console.error(`Source missing: ${input}`);
      process.exit(1);
    }
    const { value: markdown, messages } = await mammoth.convertToMarkdown({ path: input });
    if (messages.length) {
      console.warn(`Warnings for ${s.docx}:`, messages.map((m) => m.message).join("; "));
    }
    const frontmatter =
      `---\n` +
      `title: ${s.title}\n` +
      `slug: ${s.slug}\n` +
      `effective: "${VERSION}"\n` +
      `version: "${VERSION}"\n` +
      `---\n\n`;
    const outPath = path.join(OUT_DIR, `${s.slug}.md`);
    fs.writeFileSync(outPath, frontmatter + markdown);
    console.log(`Wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
