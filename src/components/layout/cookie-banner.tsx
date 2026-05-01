"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "jambahr-cookie-consent";

type Decision = "accepted" | "rejected";

function readDecision(): Decision | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "accepted" || v === "rejected" ? v : null;
}

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("jambahr:open-cookie-settings"));
}

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (readDecision() === null) setShow(true);
    const onOpen = () => setShow(true);
    window.addEventListener("jambahr:open-cookie-settings", onOpen);
    return () => window.removeEventListener("jambahr:open-cookie-settings", onOpen);
  }, []);

  const decide = (decision: Decision) => {
    window.localStorage.setItem(STORAGE_KEY, decision);
    window.dispatchEvent(new CustomEvent("jambahr:consent-changed", { detail: decision }));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-2xl border border-border bg-white shadow-lg dark:bg-[#111118] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6">
        <p className="text-sm text-muted-foreground leading-relaxed flex-1">
          We use cookies for analytics. By clicking Accept, you agree to our{" "}
          <Link href="/privacy" className="text-primary underline-offset-4 hover:underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/privacy#cookies" className="text-primary underline-offset-4 hover:underline">
            Cookie Policy
          </Link>
          .
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => decide("rejected")}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted transition-colors"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => decide("accepted")}
            className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
