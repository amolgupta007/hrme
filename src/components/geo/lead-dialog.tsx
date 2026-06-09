"use client";

interface LeadDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  lead?: any;
  assigneeOptions?: Array<{ id: string; name: string }>;
}

// Task 13 ships the real implementation.
export function LeadDialog(_props: LeadDialogProps) {
  return null;
}
