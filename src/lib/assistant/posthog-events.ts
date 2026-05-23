import posthog from "posthog-js";

export type AssistantEvent =
  | { name: "assistant_panel_opened"; props: { source: "launcher" } }
  | { name: "assistant_message_sent"; props: { conversation_id: string; char_count: number } }
  | { name: "assistant_response_received"; props: { conversation_id: string; latency_ms: number; tokens_out: number } }
  | { name: "assistant_tool_called"; props: { tool_name: string; ok: boolean; latency_ms: number } }
  | { name: "assistant_feedback_given"; props: { message_id: string; rating: -1 | 1 } }
  | { name: "assistant_rate_limited"; props: { conversation_id?: string; reason: string } }
  | { name: "insight_shown"; props: { rule_key: string } }
  | { name: "insight_clicked"; props: { rule_key: string } }
  | { name: "insight_dismissed"; props: { rule_key: string } }
  | { name: "insights_refreshed"; props: { count: number } };

export function trackAssistant<E extends AssistantEvent>(event: E): void {
  if (typeof window === "undefined") return;
  posthog?.capture(event.name, event.props);
}
