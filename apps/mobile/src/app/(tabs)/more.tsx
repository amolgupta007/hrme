import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@clerk/clerk-expo";
import { hasPermission } from "@jambahr/shared";
import { useSession } from "@/lib/session";
import { useDeletionRequest } from "@/lib/account";
import { AccountDeletionSheet } from "@/components/account-deletion-sheet";

/**
 * More tab — list shell (Task 5). Payslips/Profile navigate to the stacked
 * routes moved out of the old `(staff)` tab group; their content is still
 * the D1 placeholder (Task 7 fills it in). Sign out works today.
 */
export default function More() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { me } = useSession();
  const orgId = me?.orgId ?? null;
  const isAdmin = !!me && hasPermission(me.role, "admin");

  const [deleteVisible, setDeleteVisible] = useState(false);
  const deletionQuery = useDeletionRequest(orgId);
  const pendingDeletion = deletionQuery.data?.request ?? null;

  const name =
    [me?.employee?.firstName, me?.employee?.lastName].filter(Boolean).join(" ") || "—";
  const initial = (me?.employee?.firstName ?? "?").charAt(0).toUpperCase();

  const confirmSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-10 pt-2 gap-4"
        showsVerticalScrollIndicator={false}
      >
        <Text className="pt-2 text-[28px] font-extrabold leading-8 text-ink-900">More</Text>

        {/* Profile header row */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/profile")}
          className="flex-row items-center rounded-2xl border border-line bg-surface p-4 active:bg-brand-tint"
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-tint">
            <Text className="text-[17px] font-bold text-brand-pressed">{initial}</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-[17px] font-semibold text-ink-900" numberOfLines={1}>
              {name}
            </Text>
            <Text className="mt-0.5 text-[13px] text-ink-600" numberOfLines={1}>
              {me?.orgName ?? ""}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#6A727E" />
        </Pressable>

        {/* Owner/Admin: lightweight reports (D4 Task 13). Deep analysis stays
            web-only — this is present %/late count + leave-days summaries. */}
        {isAdmin ? (
          <View className="rounded-2xl border border-line bg-surface">
            <MoreRow
              icon="bar-chart-outline"
              label="Reports"
              onPress={() => router.push("/reports")}
              isLast
            />
          </View>
        ) : null}

        {/* Nav rows */}
        <View className="rounded-2xl border border-line bg-surface">
          <MoreRow
            icon="document-text-outline"
            label="Payslips"
            onPress={() => router.push("/payslips")}
          />
          <MoreRow
            icon="folder-outline"
            label="Documents"
            onPress={() =>
              Alert.alert("Documents", "Your documents are coming to mobile in an upcoming release.")
            }
            soon
          />
          <MoreRow
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push("/notifications")}
            isLast
          />
        </View>

        <View className="rounded-2xl border border-line bg-surface">
          <MoreRow
            icon="log-out-outline"
            label="Sign out"
            onPress={confirmSignOut}
            destructive
            isLast
          />
        </View>

        {/* Account deletion — request flow (Stage C). Pending → static status
            row; otherwise the actionable danger row. */}
        <View className="rounded-2xl border border-line bg-surface">
          {pendingDeletion ? (
            <View className="flex-row items-center px-4 py-3.5">
              <Ionicons name="time-outline" size={18} color="#B91C1C" />
              <View className="ml-3 flex-1">
                <Text className="text-[15px] font-medium text-danger">
                  Deletion requested
                </Text>
                <Text className="mt-0.5 text-[12px] text-ink-600">
                  Pending admin review. Your records are retained until then.
                </Text>
              </View>
            </View>
          ) : (
            <MoreRow
              icon="trash-outline"
              label="Delete my account"
              onPress={() => setDeleteVisible(true)}
              destructive
              isLast
            />
          )}
        </View>
      </ScrollView>

      <AccountDeletionSheet
        visible={deleteVisible}
        orgId={orgId}
        onClose={() => setDeleteVisible(false)}
      />
    </SafeAreaView>
  );
}

function MoreRow({
  icon,
  label,
  onPress,
  destructive = false,
  soon = false,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  soon?: boolean;
  isLast?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-center px-4 py-3.5 active:bg-brand-tint ${
        isLast ? "" : "border-b border-line"
      }`}
    >
      <Ionicons name={icon} size={18} color={destructive ? "#B91C1C" : "#3F4757"} />
      <Text
        className={`ml-3 flex-1 text-[17px] ${
          destructive ? "font-medium text-danger" : "text-ink-900"
        }`}
      >
        {label}
      </Text>
      {soon ? (
        <View className="rounded-full bg-brand-tint px-2 py-0.5">
          <Text className="text-[11px] font-semibold text-brand-pressed">Soon</Text>
        </View>
      ) : !destructive ? (
        <Ionicons name="chevron-forward" size={18} color="#6A727E" />
      ) : null}
    </Pressable>
  );
}
