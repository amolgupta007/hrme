"use client";

import * as React from "react";
import { Building2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateOrgProfile } from "@/actions/settings";
import type { OrgProfile } from "@/actions/settings";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  business: "Business",
};

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-muted text-muted-foreground",
  growth: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  business: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

interface OrgProfileSectionProps {
  profile: OrgProfile;
}

export function OrgProfileSection({ profile }: OrgProfileSectionProps) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(profile.name);
  const [loading, setLoading] = React.useState(false);

  async function handleSave() {
    if (!name.trim() || name === profile.name) {
      setEditing(false);
      setName(profile.name);
      return;
    }
    setLoading(true);
    const result = await updateOrgProfile({ name: name.trim() });
    setLoading(false);
    if (result.success) {
      toast.success("Organization name updated");
      setEditing(false);
    } else {
      toast.error(result.error);
    }
  }

  function handleCancel() {
    setName(profile.name);
    setEditing(false);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-5">
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Organization Profile</h3>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground mb-0.5">Company Name</p>
            {editing ? (
              <input
                className="flex h-9 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 w-64"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") handleCancel();
                }}
              />
            ) : (
              <p className="font-medium">{profile.name}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {editing ? (
              <>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCancel} disabled={loading}>
                  <X className="h-4 w-4" />
                </Button>
                <Button size="icon" className="h-8 w-8" onClick={handleSave} disabled={loading}>
                  <Check className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Slug */}
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Slug</p>
          <p className="text-sm font-mono text-muted-foreground">{profile.slug}</p>
        </div>

        {/* Plan + employees */}
        <div className="flex items-center gap-6 pt-1">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Current Plan</p>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PLAN_COLORS[profile.plan] ?? PLAN_COLORS.starter}`}>
              {PLAN_LABELS[profile.plan] ?? profile.plan}
            </span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Employees</p>
            <p className="text-sm font-medium">
              {profile.employee_count}{" "}
              <span className="text-muted-foreground font-normal">/ {profile.max_employees}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
