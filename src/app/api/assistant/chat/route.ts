import { streamText, convertToModelMessages, gateway, type UIMessage } from "ai";
import { getCurrentUser } from "@/lib/current-user";
import { canUseAssistant } from "@/lib/assistant/permissions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are JambaHR's in-app HR Assistant.
You answer ONLY about: this organisation's HR data, this organisation's uploaded HR documents,
and how to use the JambaHR app.
You do not answer general-knowledge questions.

Phase 0 note: you have no tools yet. For any factual question, say:
"I'm still being set up — my data and document tools come online in the next phase. For now I can chat, but I can't look anything up."`;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.orgId || !user.employeeId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const access = canUseAssistant({
    plan: user.plan,
    role: user.role,
    orgEnabled: true,
    monthUsage: 0,
  });
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  const body = (await req.json()) as { messages: UIMessage[] };

  const result = streamText({
    model: gateway("anthropic/claude-sonnet-4-6"),
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(body.messages),
  });

  return result.toUIMessageStreamResponse();
}
