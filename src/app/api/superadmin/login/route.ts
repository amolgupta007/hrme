import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { password } = await req.json();
  const secret = process.env.SUPERADMIN_SECRET;

  if (!secret || password !== secret) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("superadmin_session", secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return response;
}
