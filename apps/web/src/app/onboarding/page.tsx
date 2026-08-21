import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { OnboardingClient } from "./onboarding-client";

/**
 * Server gate for /onboarding.
 *
 * getCurrentUser() is the ONLY place the email/phone → employees auto-link runs
 * (it back-fills clerk_user_id for someone an admin added but who had never
 * signed in). Before this gate, that link only ever ran in the /dashboard
 * layout — so an invited employee whose post-sign-up redirect landed here was
 * shown the "ask your admin for an invite" wall forever, holding an invite that
 * would have worked, because nothing on this route ever resolved membership.
 *
 * Running it here means the link happens no matter which route auth lands on.
 */
export default async function OnboardingPage() {
  const userCtx = await getCurrentUser();

  // Already a member (or just linked by the call above) → straight to the app.
  if (userCtx) {
    redirect("/dashboard");
  }

  // Genuinely org-less. Surface WHICH identity we searched for, so a mismatch
  // between the invited address and the address they signed up with is visible
  // rather than a dead end.
  const clerkUser = await currentUser();
  const signedInEmail =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    null;
  const signedInPhone =
    clerkUser?.primaryPhoneNumber?.phoneNumber ??
    clerkUser?.phoneNumbers?.[0]?.phoneNumber ??
    null;

  return (
    <OnboardingClient
      signedInEmail={signedInEmail}
      signedInPhone={signedInPhone}
    />
  );
}
