// src/lib/screening/score.ts
import Anthropic from "@anthropic-ai/sdk";
import { ScoreResultSchema, type ScoreResult, type ScreeningCriteria, type ParsedCv } from "./types";
import { buildScorePrompt } from "./prompt";

const MODEL = "claude-sonnet-4-6";

function extractJson(text: string): unknown {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON in output");
  return JSON.parse(text.slice(s, e + 1));
}

export async function scoreCv(args: {
  criteria: ScreeningCriteria;
  parsed: ParsedCv;
  cvText: string;
}): Promise<{ result: ScoreResult; usage: { inputTokens: number; outputTokens: number }; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  const prompt = buildScorePrompt(args.criteria, args.parsed, args.cvText.slice(0, 40_000));

  let inputTokens = 0;
  let outputTokens = 0;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    try {
      const result = ScoreResultSchema.parse(extractJson(text));
      return { result, usage: { inputTokens, outputTokens }, model: MODEL };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Score parse failed: ${lastErr instanceof Error ? lastErr.message : "unknown"}`);
}
