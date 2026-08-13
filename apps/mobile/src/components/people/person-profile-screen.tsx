import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  MobilePersonLeaveBalance,
  MobilePersonProfile,
  MobilePersonRecentRequest,
} from "@jambahr/shared";
import { useSession } from "@/lib/session";
import { usePerson } from "@/lib/person";
import { roleBadge } from "@/lib/directory";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase() || "?";
}

/** Strip everything but digits — wa.me deep links want a bare numeric string. */
function whatsappDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** ISO instant → "9:31 AM" (device-local). Mirrors today-card.tsx's formatTime. */
function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "2026-08-14" → "14 Aug 2026" (plain parse, no tz shift). Mirrors profile-screen's formatDob. */
function formatDateOnly(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function titleCase(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Status → chip styling. Mirrors leave-request-card.tsx's statusChip. */
function requestStatusChip(status: string): { label: string; bg: string; fg: string } {
  switch (status) {
    case "approved":
      return { label: "Approved", bg: "bg-success", fg: "text-white" };
    case "rejected":
      return { label: "Rejected", bg: "bg-danger-tint", fg: "text-danger-ontint" };
    case "cancelled":
      return { label: "Cancelled", bg: "bg-[#EFF1F3]", fg: "text-ink-600" };
    default:
      return { label: "Pending", bg: "bg-warning-tint", fg: "text-warning-ontint" };
  }
}

/**
 * Owner/admin People quick-lookup mini-profile (Mobile D4, Task 12). Tapped
 * from the People tab (manager+ only — see people-screen.tsx). View-only:
 * contact + today's attendance + leave balance + recent requests, ending in
 * an "Edit on web" hint in place of any edit controls.
 *
 * NEVER renders salary/PAN/Aadhaar/bank — the BFF payload
 * (`MobilePersonProfile`, `/api/mobile/directory/[id]`) doesn't carry them,
 * so there's nothing to accidentally leak here even by omission-bug.
 */
export function PersonProfileScreen({ id }: { id: string }) {
  const { me } = useSession();
  const orgId = me?.orgId ?? null;

  const query = usePerson(orgId, id);
  const p = query.data;

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="px-4 pb-10 pt-4 gap-4"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />
      }
    >
      {!p && query.isLoading ? (
        <View className="gap-4">
          <View className="h-32 rounded-2xl bg-[#EFF1F3]" />
          <View className="h-40 rounded-2xl bg-[#EFF1F3]" />
          <View className="h-40 rounded-2xl bg-[#EFF1F3]" />
        </View>
      ) : !p ? (
        <View className="mt-6 items-center rounded-2xl border border-line bg-surface px-6 py-10">
          <Ionicons name="alert-circle-outline" size={24} color="#B91C1C" />
          <Text className="mt-3 text-[15px] font-semibold text-ink-900">
            Couldn&apos;t load this profile
          </Text>
          <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
            Pull to refresh once you&apos;re back online.
          </Text>
        </View>
      ) : (
        <ProfileContent profile={p} />
      )}
    </ScrollView>
  );
}

function ProfileContent({ profile: p }: { profile: MobilePersonProfile }) {
  const badge = roleBadge(p.role);

  return (
    <>
      {/* Identity header */}
      <View className="items-center rounded-2xl border border-line bg-surface px-5 py-6">
        <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-brand-tint">
          <Text className="text-[26px] font-bold text-brand-pressed">{initials(p.name)}</Text>
        </View>
        <Text className="mt-3 text-[19px] font-bold text-ink-900">{p.name}</Text>
        <View className="mt-2 flex-row items-center gap-2">
          <View className={`rounded-full px-2.5 py-0.5 ${badge.bg}`}>
            <Text className={`text-[12px] font-medium ${badge.fg}`}>{badge.label}</Text>
          </View>
          {p.department ? (
            <View className="rounded-full bg-[#EFF1F3] px-2.5 py-0.5">
              <Text className="text-[12px] font-medium text-ink-600">{p.department}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Contact */}
      {p.phone || p.personalEmail ? (
        <Section title="CONTACT">
          {p.phone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${p.name}`}
              onPress={() => Linking.openURL(`tel:${p.phone}`)}
              className="flex-row items-center justify-between gap-3 border-b border-line py-3 active:opacity-70"
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="call-outline" size={16} color="#0E5E4F" />
                <Text className="text-[15px] text-ink-600">Phone</Text>
              </View>
              <Text className="text-[15px] font-medium text-brand-pressed">{p.phone}</Text>
            </Pressable>
          ) : null}
          {p.whatsappOptIn && p.phone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Message ${p.name} on WhatsApp`}
              onPress={() => Linking.openURL(`https://wa.me/${whatsappDigits(p.phone!)}`)}
              className="flex-row items-center justify-between gap-3 border-b border-line py-3 active:opacity-70"
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="logo-whatsapp" size={16} color="#0E5E4F" />
                <Text className="text-[15px] text-ink-600">WhatsApp</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#6A727E" />
            </Pressable>
          ) : null}
          <InfoRow label="Personal email" value={p.personalEmail} last />
        </Section>
      ) : null}

      {/* Today's attendance */}
      <Section title="TODAY'S ATTENDANCE">
        {p.todayAttendance ? (
          <>
            <View className="flex-row items-center justify-between gap-3 border-b border-line py-3">
              <Text className="text-[15px] text-ink-600">Status</Text>
              <View
                className={`rounded-full px-2.5 py-0.5 ${
                  p.todayAttendance.status === "clocked_in" ? "bg-success-tint" : "bg-warning-tint"
                }`}
              >
                <Text
                  className={`text-[12px] font-medium ${
                    p.todayAttendance.status === "clocked_in"
                      ? "text-success-ontint"
                      : "text-warning-ontint"
                  }`}
                >
                  {p.todayAttendance.status === "clocked_in" ? "Clocked in" : "Clocked out"}
                </Text>
              </View>
            </View>
            <InfoRow label="Clock in" value={formatTime(p.todayAttendance.clockIn)} />
            <InfoRow label="Clock out" value={formatTime(p.todayAttendance.clockOut)} last />
          </>
        ) : (
          <InfoRow label="Status" value="No punch recorded today" last />
        )}
      </Section>

      {/* Leave balance */}
      <Section title="LEAVE BALANCE">
        {p.leaveBalance.length === 0 ? (
          <InfoRow label="Balance" value="No policies configured" last />
        ) : (
          p.leaveBalance.map((b: MobilePersonLeaveBalance, i: number) => (
            <InfoRow
              key={b.type}
              label={titleCase(b.type)}
              value={`${b.remaining} remaining`}
              last={i === p.leaveBalance.length - 1}
            />
          ))
        )}
      </Section>

      {/* Recent requests */}
      <Section title="RECENT REQUESTS">
        {p.recentRequests.length === 0 ? (
          <InfoRow label="Requests" value="No requests yet" last />
        ) : (
          p.recentRequests.map((r: MobilePersonRecentRequest, i: number) => {
            const chip = requestStatusChip(r.status);
            const last = i === p.recentRequests.length - 1;
            return (
              <View
                key={`${r.type}-${r.when}-${i}`}
                className={`flex-row items-center justify-between gap-3 py-3 ${last ? "" : "border-b border-line"}`}
              >
                <View className="flex-1 pr-3">
                  <Text className="text-[15px] font-medium text-ink-900">{titleCase(r.type)}</Text>
                  <Text className="mt-0.5 text-[12px] text-ink-400">{formatDateOnly(r.when)}</Text>
                </View>
                <View className={`rounded-full px-2.5 py-1 ${chip.bg}`}>
                  <Text className={`text-[13px] font-medium ${chip.fg}`}>{chip.label}</Text>
                </View>
              </View>
            );
          })
        )}
      </Section>

      {/* View-only screen — no edit controls. Edits happen on the web dashboard. */}
      <View className="flex-row items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
        <Ionicons name="desktop-outline" size={16} color="#6A727E" />
        <Text className="flex-1 text-[12px] leading-4 text-ink-400">
          To edit {p.name.split(" ")[0]}&apos;s details, use the People page on the web dashboard.
        </Text>
      </View>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        {title}
      </Text>
      <View className="rounded-2xl border border-line bg-surface px-4">{children}</View>
    </View>
  );
}

function InfoRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string | null;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between gap-3 py-3 ${last ? "" : "border-b border-line"}`}
    >
      <Text className="shrink-0 text-[15px] text-ink-600">{label}</Text>
      <Text
        className="min-w-0 flex-1 text-right text-[15px] font-medium text-ink-900"
        numberOfLines={2}
      >
        {value ?? "—"}
      </Text>
    </View>
  );
}
