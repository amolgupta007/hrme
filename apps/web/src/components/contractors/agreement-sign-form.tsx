"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signAgreement, declineAgreement } from "@/actions/contractor-agreements";

interface AgreementSignFormProps {
  token: string;
  contractorName: string;
  autoSign?: boolean;
}

export function AgreementSignForm({ token, contractorName, autoSign = false }: AgreementSignFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(contractorName);
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);

  // Focus the input when autoSign is true, but do NOT auto-submit.
  // The typed name must be a deliberate click.
  useEffect(() => {
    if (autoSign && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoSign]);

  async function handleSign() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Please type your full legal name to sign.");
      return;
    }
    setSigning(true);
    try {
      const result = await signAgreement(token, trimmed);
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success("Agreement signed successfully.");
        router.refresh();
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSigning(false);
    }
  }

  async function handleDecline() {
    setDeclining(true);
    try {
      const result = await declineAgreement(token);
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success("You have declined this agreement.");
        router.refresh();
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setDeclining(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signature">
          Type your full legal name to sign
        </Label>
        <Input
          id="signature"
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full legal name"
          disabled={signing || declining}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSign();
          }}
        />
        <p className="text-xs text-muted-foreground">
          By clicking &ldquo;Sign agreement&rdquo; you confirm you have read and agree to the terms above.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSign}
          disabled={signing || declining || name.trim().length < 2}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {signing ? "Signing…" : "Sign agreement"}
        </Button>

        <button
          type="button"
          onClick={handleDecline}
          disabled={signing || declining}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
        >
          {declining ? "Declining…" : "Decline"}
        </button>
      </div>
    </div>
  );
}
