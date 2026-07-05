// src/lib/screening/criteria.ts
// Plain module (no "use server") — uses Anthropic key server-side only.
import Anthropic from "@anthropic-ai/sdk";
import { buildCriteriaPrompt } from "./prompt";
import { RequirementSchema, type Requirement } from "./types";
import { z } from "zod";

const MODEL = "claude-haiku-4-5-20251001";
const SuggestSchema = z.object({
  must_haves: z.array(RequirementSchema),
  nice_to_haves: z.array(RequirementSchema),
});

function extractJson(text: string): unknown {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON in output");
  return JSON.parse(text.slice(s, e + 1));
}

export async function suggestCriteria(
  jobTitle: string,
  jobDescription: string,
): Promise<{ must_haves: Requirement[]; nice_to_haves: Requirement[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    messages: [{ role: "user", content: buildCriteriaPrompt(jobTitle, jobDescription) }],
  });
  const block = res.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text : "";
  return SuggestSchema.parse(extractJson(text));
}
