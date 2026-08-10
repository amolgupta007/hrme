import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { palette, mobilePalette } from "@jambahr/config/tokens";
import type { MobileHomeResponse } from "@jambahr/shared/mobile/types";
import { useSession } from "@/lib/session";
import { useMobileQuery } from "@/lib/query";
import { homeQueryKey } from "@/lib/home";

/**
 * The converged 5-tab shell (Mobile Phase D Slice 2, Task 5). Staff and
 * admins share one tab group now — the old `(staff)`/`(admin)` split is
 * gone. Role-specific affordances (Approvals segment inside Leaves, admin
 * People/Grow extras) are gated inline within each tab's screen, not by
 * routing to a different tab set.
 */
export default function TabsLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { me } = useSession();
  const orgId = me?.orgId ?? null;

  // Leaves tab badge (2a design: "Leaves carries a count badge" for pending
  // approvals). Reuses the Home query key — TanStack dedupes this against
  // the fetch HomeScreen already makes, so mounting the tab bar costs no
  // extra network round trip once Home has loaded once.
  const home = useMobileQuery<MobileHomeResponse>(
    homeQueryKey(orgId),
    "/api/mobile/home",
    { orgId, staleTime: 60_000, enabled: !!orgId }
  );
  const pendingApprovals = home.data?.pendingApprovals ?? null;

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.light.primary,
        tabBarInactiveTintColor: palette.light.mutedForeground,
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          // Home renders its own large-title greeting (design language) — no nav bar.
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leaves"
        options={{
          title: "Leaves",
          tabBarBadge: pendingApprovals && pendingApprovals > 0 ? pendingApprovals : undefined,
          tabBarBadgeStyle: { backgroundColor: mobilePalette.danger.DEFAULT },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: "People",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="grow"
        options={{
          title: "Grow",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-up-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="menu-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
