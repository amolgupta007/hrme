"use client";

import { openCookieSettings } from "@/components/layout/cookie-banner";

export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCookieSettings}
      className={className ?? "block text-left hover:text-foreground transition-colors"}
    >
      Cookie settings
    </button>
  );
}
