import { NextRequest, NextResponse } from "next/server";
import {
  listConversations,
  getConversation,
  deleteConversation,
} from "@/lib/assistant/conversations";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const messages = await getConversation(id);
    if (!messages) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ messages });
  }

  const search = searchParams.get("search") ?? undefined;
  const conversations = await listConversations({ search });
  return NextResponse.json({ conversations });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const ok = await deleteConversation(id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
