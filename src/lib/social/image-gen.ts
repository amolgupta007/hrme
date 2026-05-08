import type { ActionResult } from "@/types";
import { createAdminSupabase } from "@/lib/supabase/server";

const BUCKET = "social-media-images";
const CF_MODEL = "@cf/black-forest-labs/flux-1-schnell";

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

  const upload = await uploadToStorage(input.postId, cfRes.data);
  return upload;
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
  return { success: true, data: { publicUrl: data.publicUrl, storagePath: path } };
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 500);
  } catch {
    return "(unreadable body)";
  }
}
