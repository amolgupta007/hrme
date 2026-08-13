# Runbook — Voyage API key & rebuilding the AI assistant's help index

**Checked 2026-08-12.** The backlog item said "VOYAGE_API_KEY missing since the
2026-07-05 env cleanup". That is **no longer true locally** — but the underlying
problem it was pointing at is real, and is not the key.

## What is actually wrong

| Check | Result |
|---|---|
| `VOYAGE_API_KEY` in `apps/web/.env.local` | ✅ present (46 chars, `pa-…`) |
| Key still valid against the Voyage API | ✅ `200 OK` on a live probe |
| `app_help_chunks` rows in production | **56** |
| Help articles in the repo | **59** |
| Corpus last rebuilt | **2026-06-29** — six weeks ago |

So the key is fine. **The index is stale**: it was last built on 29 June, and
three articles have been added since (the Document Templating help articles from
4 July). The assistant currently cannot answer questions about those features —
it will confidently answer from the older corpus instead, which is worse than
saying nothing.

`doc_chunks` has 2 rows, which is expected: that table only holds *company-wide*
tenant documents, and almost nobody has uploaded any.

---

## Step 1 — Rebuild the help index (fixes the staleness)

This is a single command run **from your machine**, writing to **production**
Supabase.

```bash
cd apps/web
npm run embed:help
```

What it does: loads `.env.local`, reads every `.md` under
`src/lib/assistant/help/articles/`, **deletes all existing `app_help_chunks`
rows**, then re-chunks, re-embeds via Voyage, and re-inserts. Takes roughly a
minute for 59 articles.

**Before you run it, know this:** the wipe happens *first*. If the run dies
half-way — network drop, Voyage rate limit, a malformed article — the assistant
is left with a partial or empty corpus and will answer badly until you re-run.
It is fully recoverable by running it again, but do not start it and walk away.

Expected output:

```
Indexing 59 articles…
  · <id>  N chunks
  …
Done. 59 articles → ~200 chunks.
```

Then confirm it took:

```bash
# rows should now be well above 56, and created_at should be today
```
Or simply ask the assistant in the app about a Documents/offer-letter feature
and check it answers from the new articles.

## Step 2 — Confirm the key exists in **Vercel production**

This is the part the local check cannot tell you, and it matters more than the
index.

The assistant embeds the *user's question* at query time, on the server, for
every single chat message. If `VOYAGE_API_KEY` is missing from the Vercel
environment then RAG retrieval fails in production even though your local
rebuild succeeded — a completely separate failure from the stale index.

1. Vercel → the JambaHR project → **Settings → Environment Variables**.
2. Look for `VOYAGE_API_KEY` in **Production**.
3. If it is missing, add it with the same value as `apps/web/.env.local`, scoped
   to Production (and Preview if you use preview deploys), then **redeploy** —
   environment variables are baked in at build time, so an existing deployment
   will not pick it up.

To verify: open the assistant on `jambahr.com` and ask a how-to question. If it
answers with steps and a "Take me there →" link, retrieval is working. If it
answers vaguely with no citation, retrieval is failing.

## Step 3 — Make this not recur

The index goes stale silently, every time anyone edits an article. There is no
alarm and no automated rebuild.

- The rule is already in `CLAUDE.md`: after merging any article add or edit, run
  `npm run embed:help` against production.
- If you would rather not remember: the reliable fix is a build-time or cron
  rebuild. `/api/cron/assistant-doc-reindex` already exists for *tenant
  documents*; a sibling cron for the help corpus would close this properly. Not
  built — worth doing if you edit articles often.

---

## Where the key comes from, if it is ever lost again

1. `dash.voyageai.com` → sign in → **API Keys**.
2. Create a key. It is shown once — copy it immediately.
3. Put it in **both** places, because they fail independently:
   - `apps/web/.env.local` (local scripts: `embed:help`, `backfill:docs`)
   - Vercel → Production env vars (runtime query embedding), then redeploy.
4. Rotating the key does **not** invalidate stored embeddings — vectors already
   in `app_help_chunks` stay valid, so a rotation does not force a re-index.

Model in use is `voyage-3-large` at 1024 dimensions. **Do not change the model**
without re-indexing everything: mixed-dimension or mixed-model vectors in one
table produce silently wrong similarity scores rather than an error.
