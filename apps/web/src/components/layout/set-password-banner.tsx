"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PASSWORD_PROMPT_STORAGE_KEY,
  shouldShowPasswordPrompt,
} from "@/lib/auth/sign-in-options";

function readDismissedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(PASSWORD_PROMPT_STORAGE_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

/**
 * Accounts are created for employees up front, without a password, so most
 * people only ever see "we'll email you a code". This nudges them to add one.
 * Dismissible; "Not now" hides it on this device for 30 days.
 */
export function SetPasswordBanner() {
  const { isLoaded, user } = useUser();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isLoaded || !user) return;
    setShow(
      shouldShowPasswordPrompt({
        passwordEnabled: user.passwordEnabled,
        dismissedAt: readDismissedAt(),
        now: Date.now(),
      })
    );
  }, [isLoaded, user]);

  if (!show) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(PASSWORD_PROMPT_STORAGE_KEY, String(Date.now()));
    } catch {
      // Storage blocked — hide for this page view only.
    }
    setShow(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-primary/20 bg-primary/5 px-6 py-3 text-sm">
      <KeyRound className="h-4 w-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-foreground">
        <span className="font-medium">Set a password</span>
        <span className="text-muted-foreground">
          {" "}
          so you can sign in without waiting for a code.
        </span>
      </p>
      <div className="flex items-center gap-2">
        <Button asChild size="sm">
          <Link href="/account/security">Set password</Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Not now
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
