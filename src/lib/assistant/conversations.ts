import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

export type HistoryMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function deriveTitle(firstUserContent: string | null): string {
  if (!firstUserContent) return "New conversation";
  const t = firstUserContent.trim().replace(/\s+/g, " ");
  return t.length > 50 ? t.slice(0, 50) + "…" : t || "New conversation";
}

export async function listConversations(opts?: {
  search?: string;
  limit?: number;
}): Promise<ConversationSummary[]> {
  const user = await getCurrentUser();
  if (!user?.employeeId) return [];
  const supabase = createAdminSupabase();

  const { data: convs } = await supabase
    .from("assistant_conversations")
    .select("id, title, updated_at, message_count")
    .eq("org_id", user.orgId)
    .eq("user_employee_id", user.employeeId)
    .order("updated_at", { ascending: false })
    .limit(opts?.limit ?? 30);

  const rows = (convs ?? []) as Array<{
    id: string;
    title: string | null;
    updated_at: string;
    message_count: number;
  }>;

  // Derive titles from first user message where title is null.
  const out: ConversationSummary[] = [];
  for (const c of rows) {
    let title = c.title ?? null;
    if (!title) {
      const { data: firstMsg } = await supabase
        .from("assistant_messages")
        .select("content")
        .eq("conversation_id", c.id)
        .eq("role", "user")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      title = deriveTitle(
        (firstMsg as { content: string | null } | null)?.content ?? null
      );
    }
    out.push({
      id: c.id,
      title,
      updatedAt: c.updated_at,
      messageCount: c.message_count,
    });
  }

  const search = opts?.search?.trim().toLowerCase();
  return search
    ? out.filter((c) => c.title.toLowerCase().includes(search))
    : out;
}

export async function getConversation(
  id: string
): Promise<HistoryMessage[] | null> {
  const user = await getCurrentUser();
  if (!user?.employeeId) return null;
  const supabase = createAdminSupabase();

  const { data: conv } = await supabase
    .from("assistant_conversations")
    .select("id, user_employee_id")
    .eq("id", id)
    .maybeSingle();
  if (
    !conv ||
    (conv as { user_employee_id: string }).user_employee_id !==
      user.employeeId
  )
    return null;

  const { data: msgs } = await supabase
    .from("assistant_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true });

  return (
    (msgs ?? []) as Array<{
      id: string;
      role: string;
      content: string | null;
    }>
  )
    .filter((m) => (m.content ?? "").trim().length > 0)
    .map((m) => ({
      id: m.id,
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content ?? "",
    }));
}

export async function deleteConversation(id: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user?.employeeId) return false;
  const supabase = createAdminSupabase();

  const { data: conv } = await supabase
    .from("assistant_conversations")
    .select("id, user_employee_id")
    .eq("id", id)
    .maybeSingle();
  if (
    !conv ||
    (conv as { user_employee_id: string }).user_employee_id !==
      user.employeeId
  )
    return false;

  // assistant_messages cascade via FK on conversation delete.
  const { error } = await supabase
    .from("assistant_conversations")
    .delete()
    .eq("id", id);
  return !error;
}
