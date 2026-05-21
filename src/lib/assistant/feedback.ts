import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import type { ActionResult } from "@/types";

export async function submitFeedback(args: {
  conversationId: string;
  assistantIndex: number;
  rating: 1 | -1;
  comment?: string;
}): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user?.employeeId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  // Ownership: conversation must belong to this user.
  const { data: conv } = await supabase
    .from("assistant_conversations")
    .select("id, user_employee_id")
    .eq("id", args.conversationId)
    .maybeSingle();
  if (!conv || (conv as { user_employee_id: string }).user_employee_id !== user.employeeId) {
    return { success: false, error: "Not found" };
  }

  // Resolve ordinal → persisted assistant message id.
  const { data: msgs } = await supabase
    .from("assistant_messages")
    .select("id, created_at")
    .eq("conversation_id", args.conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: true });
  const row = (msgs ?? [])[args.assistantIndex] as { id: string } | undefined;
  if (!row) return { success: false, error: "Message not found" };

  const { error } = await supabase
    .from("assistant_feedback")
    .upsert(
      {
        message_id: row.id,
        user_employee_id: user.employeeId,
        rating: args.rating,
        comment: args.comment ?? null,
      },
      { onConflict: "message_id,user_employee_id" }
    );
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}
