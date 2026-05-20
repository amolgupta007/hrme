import { createClient } from "@supabase/supabase-js";
import { ingestDocument } from "../src/lib/assistant/ingest-document";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.VOYAGE_API_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY required");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // All company-wide docs not yet indexed (null status) or previously failed.
  const { data, error } = await supabase
    .from("documents")
    .select("id, name")
    .eq("is_company_wide", true)
    .or("index_status.is.null,index_status.eq.failed");
  if (error) throw error;

  console.log(`Backfilling ${data?.length ?? 0} company-wide documents…`);
  for (const doc of data ?? []) {
    const d = doc as { id: string; name: string | null };
    try {
      await ingestDocument(d.id);
      console.log(`  ✓ ${d.name ?? d.id}`);
    } catch (e) {
      console.error(`  ✗ ${d.name ?? d.id}:`, e);
    }
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
