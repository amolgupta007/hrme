"use client";

import * as React from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisbursementPreflightDialog } from "./disbursement-preflight-dialog";

interface Props {
  runId: string;
  disabled?: boolean;
}

export function PayNowButton({ runId, disabled }: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Wallet className="h-3.5 w-3.5 mr-1" /> Pay Now via RazorpayX
      </Button>
      {open && (
        <DisbursementPreflightDialog
          runId={runId}
          onClose={() => setOpen(false)}
          onInitiated={() => setOpen(false)}
        />
      )}
    </>
  );
}
