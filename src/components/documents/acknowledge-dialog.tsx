"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { PenLine, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acknowledgeDocument } from "@/actions/documents";
import type { DocumentWithUrl } from "@/actions/documents";

interface AcknowledgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: DocumentWithUrl;
}

const inputCn =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

export function AcknowledgeDialog({
  open,
  onOpenChange,
  document: doc,
}: AcknowledgeDialogProps) {
  const [signatureName, setSignatureName] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) setSignatureName("");
  }, [open]);

  async function handleSign() {
    if (!signatureName.trim()) return;
    setLoading(true);
    const result = await acknowledgeDocument(doc.id, "type_name", signatureName.trim());
    setLoading(false);
    if (result.success) {
      toast.success(`"${doc.name}" signed`);
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm max-h-[90vh] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold flex items-center gap-2">
              <PenLine className="h-5 w-5 text-primary" />
              Sign Document
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 px-4 py-3">
              <p className="text-sm font-medium truncate">{doc.name}</p>
            </div>

            <p className="text-sm text-muted-foreground">
              By signing, you confirm you have read and agree to this document.
            </p>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Full name</label>
              <input
                className={inputCn}
                placeholder="Type your full name"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && signatureName.trim() && handleSign()}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                onClick={handleSign}
                disabled={!signatureName.trim() || loading}
              >
                {loading ? "Signing..." : "I Agree & Sign"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
