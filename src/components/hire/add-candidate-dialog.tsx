"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createCandidate } from "@/actions/hire";

const SOURCE_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "referral", label: "Referral" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "naukri", label: "Naukri" },
  { value: "indeed", label: "Indeed" },
  { value: "other", label: "Other" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddCandidateDialog({ open, onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [source, setSource] = useState("direct");
  const [saving, setSaving] = useState(false);

  const inputCls =
    "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";

  async function handleSave() {
    if (!name.trim()) return toast.error("Name is required");
    if (!email.trim()) return toast.error("Email is required");

    setSaving(true);
    const result = await createCandidate({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      linkedin_url: linkedin.trim() || undefined,
      source,
    });
    setSaving(false);

    if (result.success) {
      toast.success("Candidate added");
      router.refresh();
      onClose();
    } else {
      toast.error(result.error);
    }
  }

  function handleClose() {
    setName("");
    setEmail("");
    setPhone("");
    setLinkedin("");
    setSource("direct");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Candidate</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium">Full Name *</label>
            <input
              className={inputCls}
              placeholder="e.g. Priya Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email *</label>
            <input
              type="email"
              className={inputCls}
              placeholder="priya@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Phone</label>
              <input
                className={inputCls}
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Source</label>
              <select
                className={inputCls}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">LinkedIn URL</label>
            <input
              className={inputCls}
              placeholder="https://linkedin.com/in/priya"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {saving ? "Adding…" : "Add Candidate"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
