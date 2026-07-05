// src/lib/screening/parse.ts
import Anthropic from "@anthropic-ai/sdk";
import { ParsedCvSchema, type ParsedCv } from "./types";
import { buildParsePrompt } from "./prompt";

const MODEL = "claude-haiku-4-5-20251001";

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model output");
  return JSON.parse(text.slice(start, end + 1));
}

export async function parseCv(
  cvText: string,
): Promise<{ parsed: ParsedCv; confidence: number; usage: { inputTokens: number; outputTokens: number }; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  const prompt = buildParsePrompt(cvText.slice(0, 60_000));

  let lastErr: unknown;
  let inputTokens = 0;
  let outputTokens = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    try {
      const parsed = ParsedCvSchema.parse(extractJson(text));
      // crude confidence: proportion of core sections that came back non-empty
      const filled = [parsed.skills.length, parsed.experience.length, parsed.education.length].filter(
        (n) => n > 0,
      ).length;
      return {
        parsed,
        confidence: filled / 3,
        usage: { inputTokens, outputTokens },
        model: MODEL,
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`CV parse failed validation: ${lastErr instanceof Error ? lastErr.message : "unknown"}`);
}
