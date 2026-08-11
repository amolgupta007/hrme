import "../../global.css";
import { Sentry } from "@/lib/sentry";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Stack } from "expo-router";
import { QueryProvider } from "@/lib/query";
import { SessionProvider } from "@/lib/session";

/**
 * Root Stack (Slice 2 Task 5). Previously a bare `<Slot />` — promoted to a
 * Stack navigator so the new top-level screens (`attendance`, `payslips`,
 * `profile`) opened off the `(tabs)` group get a real back nav + header.
 * `(auth)`, `index`, and `(tabs)` keep their own chrome (or none) via
 * `headerShown: false` here — unchanged from the previous Slot behavior.
 */
function RootLayout() {
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
          </Stack>
        </SessionProvider>
      </QueryProvider>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
