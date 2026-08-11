import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MobileProfile, MobileProfileAddress } from "@jambahr/shared";
import { useSession } from "@/lib/session";
import { useMobileQuery } from "@/lib/query";
import { profileQueryKey } from "@/lib/profile";
import { roleBadge } from "@/lib/directory";
import { ProfileEditSheet } from "@/components/profile-edit-sheet";

function initials(first: string, last: string): string {
  return ((first.charAt(0) ?? "") + (last.charAt(0) ?? "")).toUpperCase() || "?";
}

function formatAddress(a: MobileProfileAddress | null): string | null {
  if (!a) return null;
  const parts = [a.line1, a.line2, a.city, a.state, a.pincode].map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** "1990-04-14" → "14 Apr 1990" (plain parse, no tz shift). */
function formatDob(dob: string | null): string | null {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return dob;
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Profile view (view-broad / edit-narrow). Shows the full GET /api/mobile/profile
 * payload — contact, personal, addresses, emergency contact — plus PAN/Aadhaar
 * rendered MASKED (last-4) and read-only. Salary is never in this payload. The
 * "Edit profile" action opens a sheet limited to the mobile whitelist. Avatar
 * editing is deferred (no image picker dep in this build) — the current avatar
 * renders read-only.
 */
export function ProfileScreen() {
  const { me } = useSession();
  const orgId = me?.orgId ?? null;
  const [editOpen, setEditOpen] = useState(false);

  const query = useMobileQuery<MobileProfile>(
    profileQueryKey(orgId),
    "/api/mobile/profile",
    { orgId, enabled: !!orgId, staleTime: 5 * 60_000 }
  );

  const p = query.data;
  const badge = roleBadge(me?.role ?? "employee");

  return (
    <>
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
            <View className="h-40 rounded-2xl bg-[#EFF1F3]" />
            <View className="h-48 rounded-2xl bg-[#EFF1F3]" />
            <View className="h-48 rounded-2xl bg-[#EFF1F3]" />
          </View>
        ) : !p ? (
          <View className="mt-6 items-center rounded-2xl border border-line bg-surface px-6 py-10">
            <Ionicons name="alert-circle-outline" size={24} color="#B91C1C" />
            <Text className="mt-3 text-[15px] font-semibold text-ink-900">
              Couldn&apos;t load your profile
            </Text>
            <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
              Pull to refresh once you&apos;re back online.
            </Text>
          </View>
        ) : (
          <>
            {/* Identity header */}
            <View className="items-center rounded-2xl border border-line bg-surface px-5 py-6">
              {p.avatarUrl ? (
                <Image
                  source={{ uri: p.avatarUrl }}
                  style={{ width: 88, height: 88, borderRadius: 44 }}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View className="h-[88px] w-[88px] items-center justify-center rounded-full bg-brand-tint">
                  <Text className="text-[30px] font-bold text-brand-pressed">
                    {initials(p.firstName, p.lastName)}
                  </Text>
                </View>
              )}
              <Text className="mt-3 text-[20px] font-bold text-ink-900">
                {p.firstName} {p.lastName}
              </Text>
              {p.designation ? (
                <Text className="mt-0.5 text-[15px] text-ink-600">{p.designation}</Text>
              ) : null}
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

            {/* Edit action (secondary — reserves the brand primary for the sheet's Save) */}
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditOpen(true)}
              className="h-12 flex-row items-center justify-center rounded-[14px] bg-brand-tint active:opacity-80"
            >
              <Ionicons name="create-outline" size={18} color="#0E5E4F" />
              <Text className="ml-2 text-[15px] font-semibold text-brand-pressed">Edit profile</Text>
            </Pressable>

            {/* Contact */}
            <Section title="CONTACT">
              <InfoRow label="Work email" value={p.email} />
              <InfoRow label="Personal email" value={p.personalEmail} />
              <InfoRow label="Phone" value={p.phone} last />
            </Section>

            {/* Personal */}
            <Section title="PERSONAL">
              <InfoRow label="Gender" value={p.gender} />
              <InfoRow label="Pronouns" value={p.pronouns} />
              <InfoRow label="Marital status" value={p.maritalStatus} />
              <InfoRow label="Date of birth" value={formatDob(p.dateOfBirth)} />
              <InfoRow label="Country" value={p.country} last />
            </Section>

            {/* Addresses */}
            {formatAddress(p.communicationAddress) || formatAddress(p.permanentAddress) ? (
              <Section title="ADDRESS">
                <InfoRow label="Communication" value={formatAddress(p.communicationAddress)} />
                <InfoRow label="Permanent" value={formatAddress(p.permanentAddress)} last />
              </Section>
            ) : null}

            {/* Emergency contact */}
            <Section title="EMERGENCY CONTACT">
              <InfoRow label="Name" value={p.emergencyContact.name} />
              <InfoRow label="Phone" value={p.emergencyContact.phone} />
              <InfoRow label="Relationship" value={p.emergencyContact.relationship} last />
            </Section>

            {/* Identity — masked, read-only */}
            <Section title="IDENTITY">
              <InfoRow label="PAN" value={p.panMasked} masked />
              <InfoRow label="Aadhaar" value={p.aadhaarMasked} masked last />
            </Section>
            <Text className="px-1 text-[12px] leading-4 text-ink-400">
              PAN and Aadhaar are shown masked and can only be changed by your admin.
            </Text>
          </>
        )}
      </ScrollView>

      {p ? (
        <ProfileEditSheet
          visible={editOpen}
          profile={p}
          orgId={orgId}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
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
  masked = false,
  last = false,
}: {
  label: string;
  value: string | null;
  masked?: boolean;
  last?: boolean;
}) {
  return (
    <View className={`flex-row items-center justify-between gap-3 py-3 ${last ? "" : "border-b border-line"}`}>
      <Text className="shrink-0 text-[15px] text-ink-600">{label}</Text>
      <View className="min-w-0 flex-1 flex-row items-center justify-end">
        {masked && value ? (
          <Ionicons name="lock-closed" size={12} color="#9AA1AB" style={{ marginRight: 4 }} />
        ) : null}
        <Text className="text-right text-[15px] font-medium text-ink-900" numberOfLines={2}>
          {value ?? "—"}
        </Text>
      </View>
    </View>
  );
}
