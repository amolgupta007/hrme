"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createOrganization } from "@/actions/organizations";
import { LATEST_POLICY_VERSION } from "@/config/legal";

export function CreateOrgDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = React.useState("");
  const [accepted, setAccepted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a company name.");
      return;
    }
    if (!accepted) {
      toast.error("Please accept the Privacy Policy and Terms of Service.");
      return;
    }
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const result = await createOrganization({
        name: name.trim(),
        privacyAcceptedAt: now,
        termsAcceptedAt: now,
        policyVersionAccepted: LATEST_POLICY_VERSION,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // Full reload so the new active org resolves across all server components.
      window.location.href = "/dashboard";
    } catch (error: any) {
      toast.error(error?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new organization</DialogTitle>
          <DialogDescription>
            Spin up a separate workspace. You&apos;ll be its owner and can switch
            between organizations anytime.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Company name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              autoFocus
              className="h-11 w-full rounded-lg border border-input bg-background px-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
            />
            <span className="text-muted-foreground">
              I agree to the{" "}
              <Link href="/privacy" target="_blank" className="text-primary underline-offset-4 hover:underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/terms" target="_blank" className="text-primary underline-offset-4 hover:underline">
                Terms of Service
              </Link>
              .
            </span>
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !accepted || loading}>
              {loading ? "Creating…" : "Create organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
