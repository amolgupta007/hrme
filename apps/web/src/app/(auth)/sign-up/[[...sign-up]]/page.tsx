import { SignUp } from "@clerk/nextjs";

export default function SignUpPage({
  searchParams,
}: {
  searchParams?: { email?: string };
}) {
  // Invite emails link here with ?email=<invited address>. Prefilling matters:
  // the auto-link in getCurrentUser() matches employees.email EXACTLY, so
  // someone who retypes a variant of their address signs up successfully and
  // then lands org-less with no idea why.
  const email = searchParams?.email?.trim();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      {/*
        Pin the destination in code rather than relying on the Clerk Dashboard's
        fallback. /dashboard is correct for BOTH audiences: an invited employee
        gets auto-linked to their org there, and a genuinely org-less founder is
        redirected on to /onboarding by the dashboard layout. Landing anywhere
        else skips the only code path that performs the link.
      */}
      <SignUp
        fallbackRedirectUrl="/dashboard"
        initialValues={email ? { emailAddress: email } : undefined}
      />
    </div>
  );
}
