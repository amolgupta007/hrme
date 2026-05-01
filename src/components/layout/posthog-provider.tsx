"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const STORAGE_KEY = "jambahr-cookie-consent";

function PageviewTracker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialized = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
    posthog.capture("$pageview", { $current_url: window.location.origin + url });
  }, [pathname, searchParams, enabled]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [accepted, setAccepted] = useState(false);
  const initRan = useRef(false);

  useEffect(() => {
    const tryInit = () => {
      if (initRan.current) return;
      if (typeof window === "undefined") return;
      const consent = window.localStorage.getItem(STORAGE_KEY);
      if (consent !== "accepted") {
        setAccepted(false);
        return;
      }
      const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
      if (!key) return;
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: true,
        capture_pageleave: true,
      });
      initRan.current = true;
      setAccepted(true);
    };

    tryInit();
    const handler = () => tryInit();
    window.addEventListener("jambahr:consent-changed", handler);
    return () => window.removeEventListener("jambahr:consent-changed", handler);
  }, []);

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <PageviewTracker enabled={accepted} />
      {children}
    </PHProvider>
  );
}
