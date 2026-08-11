import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const AVATAR_BUCKET = "avatars"; // public bucket, already provisioned (profile.ts)
const AVATAR_MAX_BYTES = 1 * 1024 * 1024; // 1MB — client downscales before send
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const BodySchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  /** Base64 (no data: prefix) of a downscaled image ≤1MB. */
  data: z.string().min(1),
});

/**
 * POST /api/mobile/profile/avatar — base64 upload into the shared `avatars`
 * bucket, then write `employees.avatar_url`. Mirrors the web `updateMyAvatar`
 * flow (timestamped path to defeat CDN caching, best-effort old-file cleanup)
 * but takes a size-capped base64 body instead of multipart FormData.
 */
export async function POST(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await getCurrentUser({ orgIdHint: request.headers.get("x-org-id") });
  if (!user) {
    return NextResponse.json({ error: "no_membership" }, { status: 403 });
  }
  if (!user.employeeId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "invalid_body" }, { status: 400 });
  }

  const buffer = Buffer.from(parsed.data.data, "base64");
  if (buffer.length === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (buffer.length > AVATAR_MAX_BYTES) {
    return NextResponse.json({ error: "Photo must be 1MB or smaller" }, { status: 400 });
  }

  const ext = EXT_BY_TYPE[parsed.data.contentType];
  const supabase = createAdminSupabase();
  const path = `${user.orgId}/${user.employeeId}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, buffer, { contentType: parsed.data.contentType, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const avatarUrl = urlData.publicUrl;

  const { data: prev } = await supabase
    .from("employees")
    .select("avatar_url")
    .eq("id", user.employeeId)
    .eq("org_id", user.orgId)
    .maybeSingle();

  const { error: updateError } = await supabase
    .from("employees")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.employeeId)
    .eq("org_id", user.orgId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Best-effort cleanup of the previous upload (only files we manage here).
  const prevUrl = (prev as { avatar_url: string | null } | null)?.avatar_url;
  const marker = `/${AVATAR_BUCKET}/`;
  if (prevUrl && prevUrl.includes(marker)) {
    const prevPath = decodeURIComponent(prevUrl.split(marker)[1] ?? "");
    if (prevPath && prevPath.startsWith(`${user.orgId}/`)) {
      await supabase.storage.from(AVATAR_BUCKET).remove([prevPath]);
    }
  }

  return NextResponse.json({ avatarUrl });
}
