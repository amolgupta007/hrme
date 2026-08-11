import { useMemo, useState } from "react";
import { FlatList, Linking, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MobileDirectoryEntry, MobileDirectoryResponse } from "@jambahr/shared";
import { useSession } from "@/lib/session";
import { useMobileQuery } from "@/lib/query";
import { directoryQueryKey, roleBadge } from "@/lib/directory";

/**
 * People / directory tab (Task 7). Employee-safe projection from
 * GET /api/mobile/directory (no salary, no PAN/Aadhaar). Searchable by name or
 * department; rows carry a role badge and tap-to-call / tap-to-email
 * affordances when a phone/email is on file. Visible to all roles — the
 * directory is employee-safe.
 */
export function PeopleScreen() {
  const { me } = useSession();
  const orgId = me?.orgId ?? null;
  const [search, setSearch] = useState("");

  const query = useMobileQuery<MobileDirectoryResponse>(
    directoryQueryKey(orgId),
    "/api/mobile/directory",
    { orgId, enabled: !!orgId, staleTime: 5 * 60_000 }
  );

  const filtered = useMemo(() => {
    const entries = query.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.department ?? "").toLowerCase().includes(q)
    );
  }, [query.data, search]);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
      <View className="px-4 pb-2 pt-2">
        <Text className="pb-3 pt-2 text-[22px] font-bold text-ink-900">People</Text>
        {/* Search */}
        <View className="flex-row items-center rounded-xl border border-line bg-surface px-3">
          <Ionicons name="search" size={16} color="#9AA1AB" />
          <TextInput
            className="ml-2 h-11 flex-1 text-[15px] text-ink-900"
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or department"
            placeholderTextColor="#9AA1AB"
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#9AA1AB" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(e) => e.id}
        contentContainerClassName="px-4 pb-10 pt-1 gap-2.5"
        showsVerticalScrollIndicator={false}
        onRefresh={() => query.refetch()}
        refreshing={query.isRefetching}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <PersonRow entry={item} />}
        ListEmptyComponent={
          !query.data && query.isLoading ? (
            <View className="gap-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} className="h-[68px] rounded-2xl bg-[#EFF1F3]" />
              ))}
            </View>
          ) : (
            <View className="mt-6 items-center rounded-2xl border border-line bg-surface px-6 py-10">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-tint">
                <Ionicons name="people-outline" size={24} color="#17806D" />
              </View>
              <Text className="mt-3 text-[15px] font-semibold text-ink-900">
                {search ? "No matches" : "No teammates yet"}
              </Text>
              <Text className="mt-1 text-center text-[13px] leading-5 text-ink-600">
                {search
                  ? "Try a different name or department."
                  : "Your organization's directory will appear here."}
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

function PersonRow({ entry }: { entry: MobileDirectoryEntry }) {
  const badge = roleBadge(entry.roleBadge);
  return (
    <View className="flex-row items-center rounded-2xl border border-line bg-surface p-3">
      {entry.avatarUrl ? (
        <Image
          source={{ uri: entry.avatarUrl }}
          style={{ width: 44, height: 44, borderRadius: 22 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-tint">
          <Text className="text-[15px] font-bold text-brand-pressed">{entry.initials}</Text>
        </View>
      )}
      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-semibold text-ink-900" numberOfLines={1}>
          {entry.name}
        </Text>
        <View className="mt-1 flex-row items-center gap-1.5">
          <View className={`rounded-full px-2 py-0.5 ${badge.bg}`}>
            <Text className={`text-[11px] font-medium ${badge.fg}`}>{badge.label}</Text>
          </View>
          {entry.department ? (
            <Text className="text-[12px] text-ink-600" numberOfLines={1}>
              {entry.department}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row items-center gap-1">
        {entry.phone ? (
          <ContactButton icon="call-outline" onPress={() => Linking.openURL(`tel:${entry.phone}`)} />
        ) : null}
        {entry.email ? (
          <ContactButton icon="mail-outline" onPress={() => Linking.openURL(`mailto:${entry.email}`)} />
        ) : null}
      </View>
    </View>
  );
}

function ContactButton({
  icon,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={6}
      className="h-9 w-9 items-center justify-center rounded-full bg-brand-tint active:opacity-70"
    >
      <Ionicons name={icon} size={16} color="#0E5E4F" />
    </Pressable>
  );
}
