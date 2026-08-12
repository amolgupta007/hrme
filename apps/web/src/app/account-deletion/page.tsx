import Link from "next/link";
import Image from "next/image";

export const dynamic = "force-static";

export const metadata = {
  title: "Delete your JambaHR account",
  description:
    "How to request deletion of your JambaHR account and personal data, from the mobile app or by email.",
};

/**
 * Public account-deletion page.
 *
 * Google Play requires a **publicly reachable URL** describing account deletion
 * — reachable without installing the app or signing in — even when an in-app
 * path exists. Apple accepts the in-app path alone, but a single honest page
 * serves both stores and the DPDP "how do I exercise my rights" question.
 *
 * The content has to match reality: JambaHR is B2B, so an employee's record is
 * jointly governed by their employer's statutory obligations. Deletion is a
 * request routed to the employer, and this page says so plainly rather than
 * promising an erasure the product cannot perform.
 *
 * Must stay in the middleware public matcher — see `middleware.ts`.
 */
export default function AccountDeletionPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0a0a0f]">
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-white/80 backdrop-blur-xl dark:bg-[#0a0a0f]/80">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Image src="/Jamba.png" alt="JambaHR" width={30} height={30} className="rounded-md" />
            <span>
              <span className="text-primary">Jamba</span>HR
            </span>
          </Link>
        </div>
      </nav>

      <article className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight">Deleting your account</h1>
        <p className="mt-3 text-muted-foreground">
          This page explains how to request deletion of your JambaHR account and what happens to
          your data afterwards. It applies to the JambaHR mobile app
          (<code className="text-sm">com.jambahr.mobile</code>) and the web portal.
        </p>

        <div className="prose prose-neutral mt-10 max-w-none dark:prose-invert">
          <h2>How to request deletion</h2>
          <p>You can request deletion in either of these ways:</p>
          <ul>
            <li>
              <strong>In the mobile app</strong> — open <strong>More → Profile</strong> and choose{" "}
              <strong>Delete my account</strong>. You can add an optional reason.
            </li>
            <li>
              <strong>By email</strong> — write to{" "}
              <a href="mailto:support@jambahr.com">support@jambahr.com</a> from the address
              registered with your employer, asking for your account to be deleted.
            </li>
          </ul>

          <h2>What happens next</h2>
          <p>
            JambaHR is workplace software. Your account exists because your employer created it,
            and your employment records belong to them — so a deletion request is recorded and
            sent to your organisation&apos;s administrators, who complete the offboarding. We do
            this rather than deleting immediately because attendance, leave and payroll records
            are your employer&apos;s statutory obligation to retain under Indian law, and removing
            them unilaterally would put them in breach.
          </p>

          <h2>What is deleted</h2>
          <ul>
            <li>Your ability to sign in, once your employer completes offboarding.</li>
            <li>
              Your push notification tokens and device session data — these are removed as soon as
              you sign out.
            </li>
            <li>
              Profile details your employer is not required to keep, such as your personal contact
              number and emergency-contact details.
            </li>
          </ul>

          <h2>What is retained, and for how long</h2>
          <p>
            Attendance records, leave history, payslips and payroll data are retained by your
            employer for the period required by their policy and by applicable Indian law,
            typically several years for statutory payroll records. They are kept for that purpose
            only, and are not used for anything else once you have left.
          </p>

          <h2>If you are an employer</h2>
          <p>
            Organisations can request deletion of their entire JambaHR workspace, including all
            employee records, by writing to{" "}
            <a href="mailto:support@jambahr.com">support@jambahr.com</a> from a registered owner or
            admin address. We will confirm the request before acting on it.
          </p>

          <h2>Questions or complaints</h2>
          <p>
            Contact us at <a href="mailto:support@jambahr.com">support@jambahr.com</a>. Details of
            our Grievance Officer under the Digital Personal Data Protection Act, 2023 are in our{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </article>
    </main>
  );
}
