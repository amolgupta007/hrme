import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ActionResult } from "@/types";
import { createAdminSupabase } from "@/lib/supabase/server";

const BUCKET = "social-media-images";
const CF_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const LOGO_RELATIVE_PATH = ["public", "Jamba-s.png"];
const LOGO_WIDTH_RATIO = 0.12; // 12% of image width
const LOGO_PADDING_RATIO = 0.04; // 4% padding from edges

interface RenderInput {
  postId: string;
  prompt: string;
}

interface RenderOutput {
  publicUrl: string;
  storagePath: string;
}

export async function renderAndUpload(
  input: RenderInput,
): Promise<ActionResult<RenderOutput>> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_TOKEN;
  if (!accountId || !token) {
    return { success: false, error: "Cloudflare AI env vars missing (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_TOKEN)" };
  }

  const cfRes = await callCloudflare(accountId, token, input.prompt);
  if (!cfRes.success) return cfRes;

  const branded = await applyLogoOverlay(cfRes.data);
  const upload = await uploadToStorage(input.postId, branded);
  return upload;
}

async function applyLogoOverlay(rawBytes: Buffer): Promise<Buffer> {
  try {
    const baseImage = sharp(rawBytes);
    const meta = await baseImage.metadata();
    const width = meta.width ?? 1024;
    const height = meta.height ?? 1024;

    const logoWidth = Math.max(64, Math.round(width * LOGO_WIDTH_RATIO));
    const padding = Math.round(width * LOGO_PADDING_RATIO);

    const logoPath = path.join(process.cwd(), ...LOGO_RELATIVE_PATH);
    const logoBuffer = await fs.readFile(logoPath);
    const resizedLogo = await sharp(logoBuffer)
      .resize({ width: logoWidth })
      .png()
      .toBuffer();

    const resizedMeta = await sharp(resizedLogo).metadata();
    const logoHeight = resizedMeta.height ?? logoWidth;

    return await baseImage
      .composite([
        {
          input: resizedLogo,
          top: Math.max(0, height - logoHeight - padding),
          left: Math.max(0, width - logoWidth - padding),
        },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    // If overlay fails for any reason, fall back to the raw image rather
    // than dropping the post entirely. The founder can spot the missing
    // logo at review time and regenerate.
    return rawBytes;
  }
}

async function callCloudflare(
  accountId: string,
  token: string,
  prompt: string,
): Promise<ActionResult<Buffer>> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, num_steps: 4 }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cloudflare unreachable";
    return { success: false, error: `Cloudflare unreachable: ${message}` };
  }

  if (!res.ok) {
    const body = await safeText(res);
    return { success: false, error: `Cloudflare HTTP ${res.status}: ${body}` };
  }

  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const json = (await res.json()) as {
      success?: boolean;
      result?: { image?: string };
      errors?: Array<{ message: string }>;
    };
    if (json.success === false) {
      return {
        success: false,
        error: `Cloudflare error: ${json.errors?.map((e) => e.message).join("; ") ?? "unknown"}`,
      };
    }
    const b64 = json.result?.image;
    if (!b64) return { success: false, error: "Cloudflare returned empty image" };
    return { success: true, data: Buffer.from(b64, "base64") };
  }

  const arrayBuffer = await res.arrayBuffer();
  return { success: true, data: Buffer.from(arrayBuffer) };
}

async function uploadToStorage(
  postId: string,
  bytes: Buffer,
): Promise<ActionResult<RenderOutput>> {
  const supabase = createAdminSupabase();
  const path = `${postId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    return { success: false, error: `Supabase upload failed: ${uploadError.message}` };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Append a cache-bust so regenerations show fresh in the UI and
  // Buffer/LinkedIn re-fetch the latest bytes (Supabase ignores extra query params).
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
  return { success: true, data: { publicUrl, storagePath: path } };
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 500);
  } catch {
    return "(unreadable body)";
  }
}
