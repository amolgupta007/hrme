import { submitFeedback } from "@/lib/assistant/feedback";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const Body = z.object({
  conversationId: z.string(),
  assistantIndex: z.number().int().min(0),
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const result = await submitFeedback(parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
