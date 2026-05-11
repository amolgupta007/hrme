import Anthropic from "@anthropic-ai/sdk";
import type { ActionResult } from "@/types";
import type { GeneratedDraft, SocialTheme } from "./types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You write LinkedIn posts for JambaHR — a founder-led Indian HR-tech SaaS for small and mid businesses (10–500 employees). The voice is the JambaHR founder's: direct, slightly sardonic, empathetic to founders and ops leads who are drowning in HR admin. Indian English, with Indian context (₹, PF, leaves, WhatsApp culture, Excel reality).

Voice rules:
- Talk TO the reader (founder, ops lead, HR generalist at a 10–500 person company), not ABOUT them.
- Concrete > abstract. Use numbers ("12th employee", "8:00 AM", "₹500/employee", "20-person company"), specific moments, real workflows.
- Vivid pain before product. Show the chaos, then position JambaHR as relief — never lead with feature lists.
- Slightly sardonic is fine ("This is not HR. This is survival."). Empathy + a smirk.
- Banned: AI clichés ("In today's fast-paced world", "Let's dive in", "game-changer", "unlock", "leverage", "synergy", "delve", "tapestry"), corporate-blog tone, breathless hype.
- Emojis: sparingly. ✅ is fine for short feature checklists. 👉 for a single CTA. 😌 / 🙂 / 🙃 occasionally for tonal punctuation. Never more than ~3 emojis in one post.

Allowed structures (vary across posts — don't repeat the same one twice in a row):
A) POV / time-stamped scenario — "POV: You're [role] at a [size] company." then 3-5 short timestamped beats showing chaos.
B) Pain-arrow list — "You hired your Nth employee. Now you're drowning in: → X → Y → Z" then JambaHR pivot.
C) Direct founder monologue — short paragraphs, conversational, ends with DM/comment CTA.
D) "In most N-person companies, '[thing]' means: → ..." reframe → JambaHR built for exactly this gap.

Every post must:
- Open with a hook ≤90 chars that's specific or contrarian (not "Excited to share…").
- Land 1 concrete CTA: visit jambahr.com, "Drop a comment", "DM me", "Tag a founder", or similar. One only.
- End with 3–6 LinkedIn hashtags in TitleCase like #HRSoftware #StartupIndia #FounderLife #SMB #JambaHR (Indian-context preferred).
- Total length: 500–1100 characters (excluding hashtags). Tight, not bloated.

In-character samples (do NOT copy these — match the voice and structural variety):

Sample (POV style):
"POV: You're an HR manager at a 50-person company.
8:00 AM — Employee asks how many sick leaves they have left.
You: *opens Excel* *scrolls* *filters* *wrong sheet* *opens WhatsApp* "bro how many leaves did you take in March?"
2:00 PM — Boss asks for headcount report.
You: *stares into the void*
This is not HR. This is survival.
JambaHR was built so you never have to live this day again. 😌
👉 jambahr.com — early access open."

Sample (pain-arrow list):
"You hired your 12th employee last month.
Now you're drowning in:
→ Leave requests on WhatsApp
→ Offer letters in Google Docs
→ Payslips manually calculated in Excel
→ No idea who's actually completed compliance training
This is exactly where most small business owners lose 5–8 hours a week — not on growing the business, but on HR admin that should run itself.
We built JambaHR for exactly this stage. One platform. Free for teams up to 10. ₹500/employee after that.
👉 jambahr.com"

Image prompt rules:
- One sentence describing a CLEAN, on-brand visual for FLUX Schnell.
- Prefer: minimalist editorial illustration, isometric workspace scene, hand-drawn metaphor, or stylised vector. Avoid stock-photo "person with laptop in office", smiling-team-around-table, generic SaaS dashboard mockup.
- Always include: visual style descriptor + specific subject + colour palette hint (teal/orange accents work for the brand).
- ≤200 characters.

Image alt text: ≤140 chars, accurate description for screen readers.

Output format: respond with EXACTLY one JSON object, no preamble, no fences, no commentary. Schema:
{"caption": string, "hashtags": [string], "imagePrompt": string, "imageAltText": string}

The "caption" field is the full post body WITHOUT the hashtags (the hashtags array is rendered separately). The "hashtags" array contains the bare tag words without the # prefix (e.g. ["HRSoftware","StartupIndia"]).

If you cannot satisfy the constraints, still return valid JSON — never apologise, never explain.`;

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
