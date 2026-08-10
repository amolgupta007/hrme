import "../../global.css";
import { Sentry } from "@/lib/sentry";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { Slot } from "expo-router";
import { QueryProvider } from "@/lib/query";
import { SessionProvider } from "@/lib/session";

function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <QueryProvider>
        <SessionProvider>
          <Slot />
        </SessionProvider>
      </QueryProvider>
    </ClerkProvider>
  );
}

export default Sentry.wrap(RootLayout);
