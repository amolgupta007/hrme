import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import { Suspense } from "react";
import { PostHogProvider } from "@/components/layout/posthog-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "JambaHR — HR Management for Growing Teams",
    template: "%s | JambaHR",
  },
  description:
    "All-in-one HR platform for small and medium businesses. Manage employees, leaves, reviews, training, and payroll — without hiring an HR team.",
  keywords: [
    "HR software",
    "employee management",
    "leave management",
    "performance reviews",
    "SMB HR",
    "payroll",
  ],
  icons: {
    icon: "/Jamba.png",
    apple: "/Jamba.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/onboarding"
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={{
        variables: {
          colorPrimary: "hsl(172, 50%, 36%)",
          borderRadius: "0.625rem",
        },
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}
        >
          <Suspense>
            <PostHogProvider>
              {children}
              <Toaster
                position="bottom-right"
                toastOptions={{
                  className: "font-sans",
                }}
              />
            </PostHogProvider>
          </Suspense>
        </body>
      </html>
    </ClerkProvider>
  );
}
