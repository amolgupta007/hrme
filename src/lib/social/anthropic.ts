import Anthropic from "@anthropic-ai/sdk";
import type { ActionResult } from "@/types";
import type { GeneratedDraft, SocialTheme } from "./types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You write LinkedIn posts for JambaHR, an Indian HR-tech SaaS for small/mid businesses (10-500 employees).

Voice: founder-led, concrete, plain-spoken. Avoid AI clichés ("In today's fast-paced world", "Let's dive in", "game-changer", "unlock"). No emojis except sparingly. Indian English. No hashtag stuffing.

Structure of every post:
1. A hook in the first line (≤80 characters). Make it surprising, specific, or contrarian — never a generic opener.
2. 1-2 short paragraphs (each 2-4 sentences). Concrete details, names of laws, numbers, real workflows. Show, don't tell.
3. End with one question or a single action-oriented CTA.

Hard constraints:
- Total caption length: 600-1200 characters (tight enough to not be skipped, long enough to be substantive).
- 3-6 hashtags, lowercase camelCase like #hrCompliance #payrollIndia. No more than 6.
- Image prompt: a single sentence describing a clean, on-brand visual for FLUX Schnell. Photorealistic or vector-illustration, never "person with laptop in modern office". Be specific and visual.
- Image alt text: ≤140 chars, accurate description for screen readers.

Output format: respond with EXACTLY one JSON object, no preamble, no fences, no commentary. Schema:
{"caption": string, "hashtags": [string], "imagePrompt": string, "imageAltText": string}

If you cannot satisfy the constraints, still return valid JSON — never apologize, never explain.`;

interface GenerateInput {
  theme: SocialTheme;
  recentCaptions: string[];
  instruction?: string;
}

export async function generateDraft(
  input: GenerateInput,
): Promise<ActionResult<GeneratedDraft>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { success: false, error: "ANTHROPIC_API_KEY not set" };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userMessage = buildUserMessage(input);

  const first = await runOnce(client, userMessage);
  if (first.success) return first;

  const retry = await runOnce(
    client,
    `${userMessage}\n\nIMPORTANT: respond with the JSON object only. No prose, no fences.`,
  );
  return retry;
}

async function runOnce(
  client: Anthropic,
  userMessage: string,
): Promise<ActionResult<GeneratedDraft>> {
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Anthropic call failed";
    return { success: false, error: `Anthropic: ${message}` };
  }

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { success: false, error: "Anthropic returned no text block" };
  }

  return parseDraftJson(textBlock.text);
}

function buildUserMessage({ theme, recentCaptions, instruction }: GenerateInput): string {
  const lines: string[] = [];
  lines.push(`Theme: ${theme.title}`);
  lines.push(`Topic brief: ${theme.description}`);
  lines.push(`Audience: ${theme.audience}`);
  if (recentCaptions.length > 0) {
    lines.push("");
    lines.push("These were the last few posts under this theme — DO NOT repeat their angles or hooks:");
    for (const c of recentCaptions) {
      lines.push(`---`);
      lines.push(c.slice(0, 600));
    }
    lines.push(`---`);
  }
  if (instruction) {
    lines.push("");
    lines.push(`Additional steer from the founder: ${instruction}`);
  }
  lines.push("");
  lines.push("Generate one post now.");
  return lines.join("\n");
}

function parseDraftJson(raw: string): ActionResult<GeneratedDraft> {
  const cleaned = stripFences(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { success: false, error: `JSON parse failed: ${cleaned.slice(0, 200)}` };
  }

  if (!parsed || typeof parsed !== "object") {
    return { success: false, error: "Anthropic output not an object" };
  }
  const obj = parsed as Record<string, unknown>;
  const caption = typeof obj.caption === "string" ? obj.caption : "";
  const hashtags = Array.isArray(obj.hashtags)
    ? obj.hashtags.filter((h): h is string => typeof h === "string")
    : [];
  const imagePrompt = typeof obj.imagePrompt === "string" ? obj.imagePrompt : "";
  const imageAltText = typeof obj.imageAltText === "string" ? obj.imageAltText : "";

  if (!caption || !imagePrompt || !imageAltText) {
    return {
      success: false,
      error: "Anthropic JSON missing required fields (caption/imagePrompt/imageAltText)",
    };
  }
  if (caption.length > 2800) {
    return { success: false, error: `Caption too long: ${caption.length} chars` };
  }

  return {
    success: true,
    data: { caption, hashtags, imagePrompt, imageAltText },
  };
}

function stripFences(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("```")) {
    const lines = trimmed.split("\n");
    if (lines[0].startsWith("```")) lines.shift();
    if (lines[lines.length - 1]?.startsWith("```")) lines.pop();
    return lines.join("\n");
  }
  return trimmed;
}
