// src/lib/documents/generate-clauses.ts
// AI first-draft clause generation. Mirrors src/lib/screening/score.ts:
// prompt-for-JSON → extractJson → Zod .parse → retry once. Output lands as an
// editable DRAFT template (never auto-active — human-in-the-loop). See PRD §2.
import Anthropic from "@anthropic-ai/sdk";
import { ClauseGenResultSchema, type ClauseGenInput, type ClauseGenResult } from "./types";

const MODEL = "claude-sonnet-4-6";

function extractJson(text: string): unknown {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON in output");
  return JSON.parse(text.slice(s, e + 1));
}

function buildPrompt(input: ClauseGenInput): string {
  const pasted = (input.pastedClauses ?? []).filter(Boolean);
  return [
    `You are an HR legal-drafting assistant for Indian SMBs. Produce a clause-based ${input.documentType.replace("_", " ")} as STRUCTURED JSON.`,
    "",
    "Context:",
    `- Company/group: ${input.groupName}`,
    input.issuingEntityName ? `- Issuing entity: ${input.issuingEntityName}` : "",
    `- Role/designation: ${input.roleTitle}`,
    input.industry ? `- Industry: ${input.industry}` : "",
    `- Employment type: ${input.employmentType}`,
    input.state ? `- State (India): ${input.state}` : "",
    pasted.length ? `- Incorporate/adapt these existing clauses:\n${pasted.map((c) => `  • ${c}`).join("\n")}` : "",
    "",
    "Requirements:",
    "- Use Indian-context defaults where relevant: probation, notice period, confidentiality, code of conduct, PF/ESI (by wage thresholds), POSH, IP assignment, governing law.",
    "- Each clause is independently editable and removable. Mark only genuinely essential clauses as mandatory.",
    "- Use {{variable}} placeholders for per-employee/entity data. Allowed placeholders: {{employee_name}}, {{designation}}, {{department}}, {{employment_type}}, {{joining_date}}, {{employee_email}}, {{ctc}}, {{issuing_entity_name}}, {{issuing_entity_address}}, {{group_name}}, {{today}}. Do not invent other placeholders.",
    "- category must be one of: behavior, compliance, confidentiality, comp, custom.",
    "- body_markdown may use markdown bold/lists but keep it plain and readable.",
    "",
    "Output EXACTLY one JSON object, no markdown fences, in this shape:",
    `{"clauses":[{"title":string,"category":string,"body_markdown":string,"is_mandatory":boolean}],"detected_variables":[string]}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateClauses(input: ClauseGenInput): Promise<ClauseGenResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  const prompt = buildPrompt(input);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: MODEL,
      // A full offer letter is long; 3000 truncated the JSON mid-array → parse
      // failure. Sonnet 4.6 supports far higher output — give it headroom.
      max_tokens: 16000,
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    try {
      return ClauseGenResultSchema.parse(extractJson(text));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Clause generation failed: ${lastErr instanceof Error ? lastErr.message : "unknown"}`
  );
}
