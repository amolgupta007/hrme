// Plain module — NOT "use server". Touches a secret-free but PII-adjacent
// endpoint (Expo push tokens) and must never become a browser-callable RPC
// (mirrors gotcha #85: secret/PII helpers stay out of "use server" files).
//
// sendPush is best-effort: it is called from core server actions (leave
// approve/reject, payslip send) and a cron (doc reminders) and must NEVER
// throw — a push failure must not fail the action that triggered it.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Looks up Expo push tokens for the given employee ids, batches them to the
 * Expo Push API, and prunes any token whose receipt reports
 * `DeviceNotRegistered`. Swallows every error — never throws.
 */
export async function sendPush(
  supabase: any,
  employeeIds: string[],
  msg: PushMessage
): Promise<void> {
  if (!employeeIds || employeeIds.length === 0) return;

  try {
    const { data: tokenRows } = await supabase
      .from("push_tokens")
      .select("id, expo_push_token")
      .in("employee_id", employeeIds);

    const tokens = ((tokenRows ?? []) as Array<{ id: string; expo_push_token: string }>).filter(
      (t) => !!t.expo_push_token
    );
    if (tokens.length === 0) return;

    const batches = chunk(tokens, BATCH_SIZE);

    for (const batch of batches) {
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(
            batch.map((t) => ({
              to: t.expo_push_token,
              title: msg.title,
              body: msg.body,
              data: msg.data ?? {},
              sound: "default",
            }))
          ),
        });

        const json = await res.json().catch(() => null);
        const receipts: any[] = json?.data ?? [];

        for (let i = 0; i < receipts.length; i++) {
          const receipt = receipts[i];
          if (receipt?.details?.error === "DeviceNotRegistered") {
            const tokenRow = batch[i];
            if (tokenRow) {
              try {
                await supabase.from("push_tokens").delete().eq("id", tokenRow.id);
              } catch {
                // best-effort cleanup only
              }
            }
          }
        }
      } catch {
        // A batch failure must not stop the remaining batches or throw.
      }
    }
  } catch {
    // Never let a push failure break the caller's core action.
  }
}
