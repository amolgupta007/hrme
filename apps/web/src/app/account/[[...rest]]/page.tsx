import Link from "next/link";
import { UserProfile } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";

// Clerk's account page (profile, email/phone, password, sessions), mounted on a
// real route so emails and the dashboard banner can deep-link to
// /account/security to set a password. Outside /dashboard on purpose: it is
// account-level, not org-level, and needs no org context. Protected by
// middleware (not in the public matcher).
export default function AccountPage() {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
        <UserProfile path="/account" routing="path" />
      </div>
    </div>
  );
}
