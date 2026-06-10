"use client";

import { MessageCircle, Phone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPhoneForWhatsApp } from "@/lib/geo/contact";

interface LeadMobileActionsProps {
  leadName: string;
  phone: string | null;
  onLogVisit: () => void;
  enabled: boolean;
}

/**
 * Sticky-bottom action bar for mobile. md:hidden — desktop already
 * promotes Log Visit to the page-level h1 row, so this bar only earns
 * its place on small viewports where the timeline-card header CTA sits
 * far below the fold.
 *
 * The "Log visit" button is the primary; quick-dial and WhatsApp sit
 * alongside as compact icon buttons so the operator can act without
 * scrolling back up to the info card. Respects safe-area-inset for
 * notched phones.
 */
export function LeadMobileActions({
  leadName,
  phone,
  onLogVisit,
  enabled,
}: LeadMobileActionsProps) {
  if (!enabled) return null;
  const wa = formatPhoneForWhatsApp(phone);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
      role="region"
      aria-label="Lead quick actions"
    >
      <div className="mx-auto flex max-w-md items-center gap-2">
        <Button
          onClick={onLogVisit}
          className="flex-1"
          size="default"
        >
          <Plus className="h-4 w-4 mr-1.5" aria-hidden />
          Log visit
        </Button>
        {phone && (
          <a
            href={`tel:${phone}`}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-input text-foreground hover:bg-muted"
            aria-label={`Call ${leadName} at ${phone}`}
          >
            <Phone className="h-4 w-4" aria-hidden />
          </a>
        )}
        {wa && (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            aria-label={`Message ${leadName} on WhatsApp`}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}
