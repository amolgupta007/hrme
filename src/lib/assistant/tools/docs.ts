import { tool } from "ai";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { embed } from "@/lib/assistant/embeddings";

const DOC_CATEGORY = z.enum(["policy", "contract", "id_proof", "tax", "certificate", "other"]);

type DocsCtx = { orgId: string; employeeId: string | null };

export function makeDocsTools(ctx: DocsCtx) {
  return {
    docs_search: tool({
      description:
        "Search the organisation's uploaded company-wide HR documents (policies, handbooks, circulars) for an answer. Returns ranked snippets with document ids.",
      inputSchema: z.object({
        query: z.string().min(3).max(200),
        max_results: z.number().int().min(1).max(8).optional(),
      }),
      execute: async ({ query, max_results = 5 }) => {
        const [queryEmbedding] = await embed({ texts: [query], inputType: "query" });
        const supabase = createAdminSupabase();
        const { data, error } = await supabase.rpc("match_doc_chunks", {
          query_embedding: queryEmbedding as unknown as string,
          p_org_id: ctx.orgId,
          match_count: max_results,
        });
        if (error) throw error;

        const rows = (data ?? []) as Array<{
          chunk_id: string;
          document_id: string;
          content: string;
          page_or_section: string | null;
          similarity: number;
        }>;
        if (rows.length === 0) return [];

        const docIds = [...new Set(rows.map((r) => r.document_id))];
        const { data: docs } = await supabase
          .from("documents")
          .select("id, name, category, is_company_wide, requires_acknowledgment")
          .in("id", docIds)
          .eq("org_id", ctx.orgId)
          .eq("is_company_wide", true);
        const byId = new Map((docs ?? []).map((d: { id: string }) => [d.id, d]));

        return rows
          .filter((r) => byId.has(r.document_id))
          .map((r) => {
            const d = byId.get(r.document_id) as { name: string; category: string };
            return {
              chunk_id: r.chunk_id,
              document_id: r.document_id,
              title: d.name,
              category: d.category,
              snippet: r.content.slice(0, 320),
              score: r.similarity,
            };
          });
      },
    }),

    docs_get_chunk: tool({
      description:
        "Fetch the full text of a specific document chunk by id, plus acknowledgment status for the current user.",
      inputSchema: z.object({ chunk_id: z.string() }),
      execute: async ({ chunk_id }) => {
        const supabase = createAdminSupabase();
        const { data: chunk } = await supabase
          .from("doc_chunks")
          .select("id, document_id, content, page_or_section, org_id")
          .eq("id", chunk_id)
          .eq("org_id", ctx.orgId)
          .maybeSingle();
        if (!chunk) return null;
        const c = chunk as {
          id: string;
          document_id: string;
          content: string;
          page_or_section: string | null;
        };

        const { data: doc } = await supabase
          .from("documents")
          .select("id, name, requires_acknowledgment, is_company_wide")
          .eq("id", c.document_id)
          .eq("org_id", ctx.orgId)
          .eq("is_company_wide", true)
          .maybeSingle();
        if (!doc) return null;
        const d = doc as { id: string; name: string; requires_acknowledgment: boolean };

        let userHasAcknowledged = false;
        if (d.requires_acknowledgment && ctx.employeeId) {
          const { data: ack } = await supabase
            .from("document_acknowledgments")
            .select("id")
            .eq("document_id", d.id)
            .eq("employee_id", ctx.employeeId)
            .maybeSingle();
          userHasAcknowledged = !!ack;
        }

        return {
          chunk_id: c.id,
          document_id: c.document_id,
          title: d.name,
          content: c.content,
          page_or_section: c.page_or_section,
          requires_acknowledgment: d.requires_acknowledgment,
          user_has_acknowledged: userHasAcknowledged,
        };
      },
    }),

    docs_list_recent: tool({
      description:
        "List the organisation's most recently uploaded company-wide documents. Use for 'summarize the latest circular' type questions.",
      inputSchema: z.object({
        category: DOC_CATEGORY.optional(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ category, limit = 5 }) => {
        const supabase = createAdminSupabase();
        let q = supabase
          .from("documents")
          .select("id, name, category, created_at")
          .eq("org_id", ctx.orgId)
          .eq("is_company_wide", true)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (category) q = q.eq("category", category);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map(
          (d: { id: string; name: string; category: string; created_at: string }) => ({
            document_id: d.id,
            title: d.name,
            category: d.category,
            uploaded_at: d.created_at,
          }),
        );
      },
    }),
  };
}
