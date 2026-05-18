import { createClient } from "@supabase/supabase-js";
import { listHelpArticles } from "../src/lib/assistant/help";
import { chunkMarkdown, embed } from "../src/lib/assistant/embeddings";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. " +
        "Run: npm run embed:help (which loads .env.local via --env-file).",
    );
  }
  if (!process.env.VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY must be set.");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const articles = listHelpArticles();
  console.log(`Indexing ${articles.length} articles…`);

  // Step 1: wipe old chunks. Phase 1 is monolithic re-index; incremental is a Phase 1.5 nice-to-have.
  const { error: wipeError } = await supabase
    .from("app_help_chunks")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (wipeError) throw wipeError;

  // Step 2: chunk + embed + insert. Skip the bootstrap placeholder.
  let totalChunks = 0;
  for (const article of articles) {
    if (article.id === "_placeholder") {
      console.log(`  · skipped ${article.id} (bootstrap-only)`);
      continue;
    }
    const chunks = chunkMarkdown(article.body);
    if (chunks.length === 0) {
      console.log(`  · skipped ${article.id} (empty body)`);
      continue;
    }
    const embeddings = await embed({ texts: chunks, inputType: "document" });
    const rows = chunks.map((content, i) => ({
      article_id: article.id,
      step_n: null,
      content,
      token_count: Math.ceil(content.length / 4),
      embedding: embeddings[i],
    }));
    const { error } = await supabase.from("app_help_chunks").insert(rows);
    if (error) throw error;
    totalChunks += chunks.length;
    console.log(`  ✓ ${article.id} (${chunks.length} chunks)`);
  }

  console.log(`Done. ${totalChunks} chunks indexed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
