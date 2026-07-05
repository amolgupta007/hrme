"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import * as React from "react";
import { switchActiveOrg } from "@/actions/active-org";
import { CreateOrgDialog } from "./create-org-dialog";
import type { OrgMembership } from "@/actions/active-org";

export function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: OrgMembership[];
  activeOrgId: string;
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);
  const active = orgs.find((o) => o.orgId === activeOrgId);

  async function select(orgId: string) {
    if (orgId === activeOrgId || switching) return;
    setSwitching(true);
    const r = await switchActiveOrg(orgId);
    if (r.success) {
      // Full reload so every server component re-resolves under the new org.
      window.location.href = "/dashboard";
    } else {
      setSwitching(false);
    }
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="truncate max-w-[160px]">{active?.name ?? "Organization"}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-60" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 min-w-[220px] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {orgs.length > 0 && (
              <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Your organizations
              </DropdownMenu.Label>
            )}
            {orgs.map((o) => (
              <DropdownMenu.Item
                key={o.orgId}
                onSelect={() => select(o.orgId)}
                className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent"
              >
                <span className="truncate">{o.name}</span>
                {o.orgId === activeOrgId && <Check className="h-4 w-4 shrink-0" />}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
                setCreateOpen(true);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent"
            >
              <Plus className="h-4 w-4" /> Create organization
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
