import "../../global.css";
import { useEffect } from "react";
import { Sentry } from "@/lib/sentry";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { QueryProvider } from "@/lib/query";
import { SessionProvider } from "@/lib/session";
import { routeForNotificationType } from "@/lib/notifications";

/**
 * Root Stack (Slice 2 Task 5). Previously a bare `<Slot />` — promoted to a
 * Stack navigator so the new top-level screens (`attendance`, `payslips`,
 * `profile`) opened off the `(tabs)` group get a real back nav + header.
 * `(auth)`, `index`, and `(tabs)` keep their own chrome (or none) via
 * `headerShown: false` here — unchanged from the previous Slot behavior.
 */
function RootLayout() {
  const router = useRouter();

  // Push-tap routing (D3 Stage D). The response listener fires both for a
  // cold-start tap (app was killed) and a tap while backgrounded/foregrounded
  // — expo-notifications replays the launching response through this same
  // listener rather than requiring a separate cold-start check.
  //
  // Caveat: today's server-side trigger points (`notifyLeaveDecision` /
  // `notifyPayslipPaid` / `notifyDocAck` in apps/web/src/lib/mobile/notify.ts)
  // never populate the push message's `data` field, so
  // `content.data?.type` is currently always empty on a real device — this
  // falls back to the notifications list, which is always a correct
  // destination. Wiring `data: { type }` through those three call sites
  // would make the fallback the exception rather than the rule.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const type = response.notification.request.content.data?.type;
      const route = routeForNotificationType(typeof type === "string" ? type : undefined);
      router.push(route ?? "/notifications");
    });
    return () => sub.remove();
  }, [router]);

  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <QueryProvider>
        <SessionProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              // iOS otherwise labels the back button with the previous route
              // segment ("(tabs)"); show just the chevron.
              headerBackButtonDisplayMode: "minimal",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="attendance"
              options={{ headerShown: true, title: "Attendance" }}
            />
            <Stack.Screen
              name="payslips"
              options={{ headerShown: true, title: "Payslips" }}
            />
            <Stack.Screen
              name="payslip/[entryId]"
              options={{ headerShown: true, title: "Payslip" }}
            />
            <Stack.Screen
              name="profile"
              options={{ headerShown: true, title: "Profile" }}
            />
            <Stack.Screen
              name="notifications"
              options={{ headerShown: true, title: "Notifications" }}
            />
          </Stack>
        </SessionProvider>
      </QueryProvider>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
