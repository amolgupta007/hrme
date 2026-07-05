const VOYAGE_API = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3-large";

export type EmbedInput = {
  texts: string[];
  inputType: "query" | "document";
};

export async function embed({ texts, inputType }: EmbedInput): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set");

  const res = await fetch(VOYAGE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      input: texts,
      model: MODEL,
      input_type: inputType,
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

// Token-aware chunking. Markdown-friendly: prefer breaking on blank lines.
export function chunkMarkdown(md: string, targetTokens = 600, overlapTokens = 100): string[] {
  const approxCharsPerToken = 4;
  const targetChars = targetTokens * approxCharsPerToken;
  const overlapChars = overlapTokens * approxCharsPerToken;

  const paragraphs = md.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > targetChars && current) {
      chunks.push(current);
      const tail = current.slice(-overlapChars);
      current = tail + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
