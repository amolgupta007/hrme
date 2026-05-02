"use client";

import { useState, useEffect } from "react";
import { Receipt, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateGSTIN, getBillingDetails } from "@/actions/billing";

export function BillingDetailsCard() {
  const [gstin, setGstin] = useState("");
  const [original, setOriginal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBillingDetails().then((r) => {
      if (r.success) {
        setGstin(r.data.gstin ?? "");
        setOriginal(r.data.gstin);
      }
    });
  }, []);

  const dirty = gstin.trim().toUpperCase() !== (original ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateGSTIN(gstin);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setOriginal(gstin.trim().toUpperCase() || null);
      toast.success("Billing details updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Billing Details</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">GSTIN (optional)</label>
          <input
            type="text"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            placeholder="22ABCDE1234F1Z5"
            maxLength={15}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Your GSTIN is used to issue GST-compliant tax invoices. Optional.
          </p>
        </div>

        <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
