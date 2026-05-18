import { createAdminSupabase } from "@/lib/supabase/server";

export async function getOrCreateConversation(args: {
  conversationId: string;
  orgId: string;
  userEmployeeId: string;
}): Promise<{ id: string; isNew: boolean }> {
  const supabase = createAdminSupabase();
  const { data: existing } = await supabase
    .from("assistant_conversations")
    .select("id")
    .eq("id", args.conversationId)
    .maybeSingle();
  if (existing) return { id: existing.id, isNew: false };

  const { data, error } = await supabase
    .from("assistant_conversations")
    .insert({
      id: args.conversationId,
      org_id: args.orgId,
      user_employee_id: args.userEmployeeId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data!.id as string, isNew: true };
}

export async function persistMessage(args: {
  conversationId: string;
  role: "user" | "assistant" | "tool" | "system";
  content?: string;
  toolCall?: unknown;
  toolResult?: unknown;
  finishReason?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<string> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("assistant_messages")
    .insert({
      conversation_id: args.conversationId,
      role: args.role,
      content: args.content ?? null,
      tool_call: args.toolCall ?? null,
      tool_result: args.toolResult ?? null,
      finish_reason: args.finishReason ?? null,
      model: args.model ?? null,
      input_tokens: args.inputTokens ?? null,
      output_tokens: args.outputTokens ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}
