/**
 * Android notification channels — the single source both sides read.
 *
 * Android 8+ requires every notification to belong to a channel. The channel is
 * created **on the device**; the server names it by id in the Expo push payload.
 * If those two ids disagree the notification is silently delivered on an
 * auto-created "Miscellaneous" channel at default importance — no heads-up
 * banner, no sound, and FCM free to defer it while the device dozes. That
 * failure is invisible in logs, which is exactly why the ids live here rather
 * than being typed out in two places.
 *
 * Channel settings are **immutable after first creation**: once a channel
 * exists on a device, importance and sound can only be changed by the user, not
 * by the app. Changing importance therefore requires a NEW channel id, not an
 * edit — hence the version suffix convention below.
 *
 * iOS ignores all of this.
 */

export type AndroidChannelId = "approvals_v1" | "updates_v1";

export type AndroidChannel = {
  id: AndroidChannelId;
  /** Shown in Android's per-app notification settings, so it must read well. */
  name: string;
  description: string;
  /** Maps to expo-notifications `AndroidImportance`. */
  importance: "high" | "default";
};

/**
 * Two channels, not one: someone drowning in payslip and document notifications
 * must be able to mute those without also muting the approvals that block their
 * team. Android exposes this per channel, so splitting them is the only way to
 * offer it.
 *
 * Ids carry a `_v1` suffix because channel settings are immutable once created
 * — raising importance later means shipping `approvals_v2`, and a bare
 * `approvals` id would leave no room to do that cleanly.
 */
export const ANDROID_CHANNELS: readonly AndroidChannel[] = [
  {
    id: "approvals_v1",
    name: "Approvals",
    description: "Requests waiting for your decision — leave, attendance, overtime, payroll.",
    importance: "high",
  },
  {
    id: "updates_v1",
    name: "Updates",
    description: "Decisions on your requests, payslips, and documents to acknowledge.",
    importance: "default",
  },
];

export const DEFAULT_ANDROID_CHANNEL: AndroidChannelId = "updates_v1";

/**
 * Which channel a notification type belongs on.
 *
 * Only work that is *blocked on the recipient* earns the high-importance
 * channel. Everything else is information about something already decided, and
 * interrupting someone for it is how an app trains people to swipe
 * notifications away without reading them.
 *
 * Unknown types fall to `updates_v1` — a new notification type must be an
 * explicit decision to interrupt, never an accidental one.
 */
export function channelForNotificationType(type: string | null | undefined): AndroidChannelId {
  return type === "approval_pending" ? "approvals_v1" : DEFAULT_ANDROID_CHANNEL;
}

/**
 * FCM delivery priority for a channel.
 *
 * `high` wakes a dozing device; `normal` may be batched until the next
 * maintenance window. This must track channel importance — a high-importance
 * channel delivered at normal priority still arrives late, which looks like the
 * feature is broken.
 */
export function pushPriorityForChannel(
  channelId: AndroidChannelId,
): "high" | "normal" {
  return channelId === "approvals_v1" ? "high" : "normal";
}
