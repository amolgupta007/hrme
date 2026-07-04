// src/lib/documents/markdown.ts
// Tiny markdown-subset parser → block AST, for the react-pdf renderer (react-pdf
// has no HTML/markdown engine). Supports the subset the AI is prompted to emit:
// headings (#/##/###), paragraphs, bold (**), italic (*), and unordered/ordered
// lists. Anything else degrades to plain paragraph text.

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; runs: InlineRun[] }
  | { type: "paragraph"; runs: InlineRun[] }
  | { type: "ul"; items: InlineRun[][] }
  | { type: "ol"; items: InlineRun[][] };

/** Parse inline **bold** / *italic* into styled runs. */
export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  // Tokenize on ** and * markers while tracking state.
  const re = /(\*\*|\*)/g;
  let bold = false;
  let italic = false;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (s: string) => {
    if (s) runs.push({ text: s, bold: bold || undefined, italic: italic || undefined });
  };
  while ((m = re.exec(text)) !== null) {
    push(text.slice(last, m.index));
    if (m[1] === "**") bold = !bold;
    else italic = !italic;
    last = m.index + m[1].length;
  }
  push(text.slice(last));
  return runs.length ? runs : [{ text }];
}

export function parseMarkdown(md: string): Block[] {
  const lines = (md ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const isUl = (l: string) => /^\s*[-*]\s+/.test(l);
  const isOl = (l: string) => /^\s*\d+\.\s+/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        runs: parseInline(heading[2].trim()),
      });
      i++;
      continue;
    }

    if (isUl(line)) {
      const items: InlineRun[][] = [];
      while (i < lines.length && isUl(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\s*[-*]\s+/, "").trim()));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (isOl(line)) {
      const items: InlineRun[][] = [];
      while (i < lines.length && isOl(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\s*\d+\.\s+/, "").trim()));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-structural lines.
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !isUl(lines[i]) &&
      !isOl(lines[i])
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "paragraph", runs: parseInline(buf.join(" ")) });
  }

  return blocks;
}
