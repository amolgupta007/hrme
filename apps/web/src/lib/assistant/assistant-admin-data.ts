import { createAdminSupabase } from "@/lib/supabase/server";
import { tokensToInrPaise } from "@/lib/assistant/pricing";

function istMonth(d = new Date()): string {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

export type AssistantOrgUsage = {
  orgId: string;
  orgName: string;
  conversations: number;
  messages: number;
  uniqueUsers: number;
  inputTokens: number;
  outputTokens: number;
  estCostInr: number;
  monthUsedInr: number;
  monthCapInr: number | null;
};

export type ToolUsage = {
  toolName: string;
  calls: number;
  okRate: number;
  avgLatencyMs: number;
};

export type FeedbackSummary = {
  up: number;
  down: number;
  recentDownComments: { comment: string; createdAt: string }[];
};

export type AssistantAdminData = {
  orgs: AssistantOrgUsage[];
  tools: ToolUsage[];
  feedback: FeedbackSummary;
  totals: { messages: number; estCostInr: number; up: number; down: number };
};

export async function getAssistantAdminData(): Promise<AssistantAdminData> {
  const supabase = createAdminSupabase();
  const since = thirtyDaysAgo();
  const currentMonth = istMonth();

  // --- Messages + conversations ---
  type MsgRow = {
    conversation_id: string;
    role: string;
    input_tokens: number | null;
    output_tokens: number | null;
    assistant_conversations: { org_id: string; user_employee_id: string | null } | null;
  };

  let msgRows: MsgRow[] = [];
  try {
    const { data, error } = await supabase
      .from("assistant_messages")
      .select(
        "conversation_id, role, input_tokens, output_tokens, assistant_conversations!inner(org_id, user_employee_id)"
      )
      .gte("created_at", since)
      .limit(5000);
    if (!error && data) {
      msgRows = data as unknown as MsgRow[];
    }
  } catch {
    // leave msgRows empty
  }

  // --- Org names ---
  type OrgRow = { id: string; name: string };
  let orgRows: OrgRow[] = [];
  try {
    const { data, error } = await supabase.from("organizations").select("id, name");
    if (!error && data) {
      orgRows = data as OrgRow[];
    }
  } catch {
    // leave empty
  }
  const orgNameMap = new Map(orgRows.map((o) => [o.id, o.name]));

  // --- Budget rows for current month ---
  type BudgetRow = {
    org_id: string;
    cost_inr_paise: number | null;
    hard_cap_inr_paise: number | null;
  };
  let budgetRows: BudgetRow[] = [];
  try {
    const { data, error } = await supabase
      .from("assistant_budget")
      .select("org_id, cost_inr_paise, hard_cap_inr_paise")
      .eq("month", currentMonth);
    if (!error && data) {
      budgetRows = data as BudgetRow[];
    }
  } catch {
    // leave empty
  }
  const budgetMap = new Map(budgetRows.map((b) => [b.org_id, b]));

  // --- Aggregate per org ---
  type OrgAgg = {
    conversations: Set<string>;
    users: Set<string>;
    messages: number;
    inputTokens: number;
    outputTokens: number;
  };
  const orgAgg = new Map<string, OrgAgg>();

  for (const row of msgRows) {
    const conv = row.assistant_conversations;
    if (!conv) continue;
    const orgId = conv.org_id;
    if (!orgAgg.has(orgId)) {
      orgAgg.set(orgId, {
        conversations: new Set(),
        users: new Set(),
        messages: 0,
        inputTokens: 0,
        outputTokens: 0,
      });
    }
    const agg = orgAgg.get(orgId)!;
    agg.messages += 1;
    agg.conversations.add(row.conversation_id);
    if (conv.user_employee_id) agg.users.add(conv.user_employee_id);
    agg.inputTokens += row.input_tokens ?? 0;
    agg.outputTokens += row.output_tokens ?? 0;
  }

  const orgs: AssistantOrgUsage[] = Array.from(orgAgg.entries())
    .map(([orgId, agg]) => {
      const budget = budgetMap.get(orgId);
      const estCostInr = Math.round(
        tokensToInrPaise({ inputTokens: agg.inputTokens, outputTokens: agg.outputTokens }) / 100
      );
      return {
        orgId,
        orgName: orgNameMap.get(orgId) ?? orgId,
        conversations: agg.conversations.size,
        messages: agg.messages,
        uniqueUsers: agg.users.size,
        inputTokens: agg.inputTokens,
        outputTokens: agg.outputTokens,
        estCostInr,
        monthUsedInr: Math.round((budget?.cost_inr_paise ?? 0) / 100),
        monthCapInr:
          budget?.hard_cap_inr_paise != null
            ? Math.round(budget.hard_cap_inr_paise / 100)
            : null,
      };
    })
    .sort((a, b) => b.messages - a.messages);

  // --- Tools ---
  type ToolRow = {
    tool_name: string;
    ok: boolean | null;
    latency_ms: number | null;
  };
  let toolRows: ToolRow[] = [];
  try {
    const { data, error } = await supabase
      .from("assistant_tool_calls")
      .select("tool_name, ok, latency_ms")
      .gte("created_at", since)
      .limit(5000);
    if (!error && data) {
      toolRows = data as ToolRow[];
    }
  } catch {
    // leave empty
  }

  type ToolAgg = { calls: number; okCount: number; totalLatency: number };
  const toolAgg = new Map<string, ToolAgg>();
  for (const row of toolRows) {
    if (!toolAgg.has(row.tool_name)) {
      toolAgg.set(row.tool_name, { calls: 0, okCount: 0, totalLatency: 0 });
    }
    const t = toolAgg.get(row.tool_name)!;
    t.calls += 1;
    if (row.ok === true) t.okCount += 1;
    t.totalLatency += row.latency_ms ?? 0;
  }

  const tools: ToolUsage[] = Array.from(toolAgg.entries())
    .map(([toolName, t]) => ({
      toolName,
      calls: t.calls,
      okRate: t.calls > 0 ? Math.round((t.okCount / t.calls) * 100) : 0,
      avgLatencyMs: t.calls > 0 ? Math.round(t.totalLatency / t.calls) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);

  // --- Feedback ---
  type FeedbackRow = {
    rating: number | null;
    comment: string | null;
    created_at: string;
  };
  let feedbackRows: FeedbackRow[] = [];
  try {
    const { data, error } = await supabase
      .from("assistant_feedback")
      .select("rating, comment, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (!error && data) {
      feedbackRows = data as FeedbackRow[];
    }
  } catch {
    // leave empty
  }

  let up = 0;
  let down = 0;
  const recentDownComments: { comment: string; createdAt: string }[] = [];

  for (const row of feedbackRows) {
    if (row.rating === 1) up += 1;
    else if (row.rating === -1) {
      down += 1;
      if (row.comment && recentDownComments.length < 10) {
        recentDownComments.push({ comment: row.comment, createdAt: row.created_at });
      }
    }
  }

  const feedback: FeedbackSummary = { up, down, recentDownComments };

  // --- Totals ---
  const totalMessages = orgs.reduce((s, o) => s + o.messages, 0);
  const totalCostInr = orgs.reduce((s, o) => s + o.estCostInr, 0);

  return {
    orgs,
    tools,
    feedback,
    totals: { messages: totalMessages, estCostInr: totalCostInr, up, down },
  };
}
