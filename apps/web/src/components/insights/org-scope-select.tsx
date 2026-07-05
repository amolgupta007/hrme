"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Building2, Check, ChevronDown } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { EligibleOrg } from "@/lib/insights/org-scope";

export function OrgScopeSelect({
  eligibleOrgs,
  activeOrgId,
}: {
  eligibleOrgs: EligibleOrg[];
  activeOrgId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const raw = sp.get("orgs");
  const selected = new Set(raw ? raw.split(",").filter(Boolean) : [activeOrgId]);

  function apply(next: Set<string>) {
    const ids = eligibleOrgs.map((o) => o.id).filter((id) => next.has(id));
    const params = new URLSearchParams(Array.from(sp.entries()));
    // Only the active org selected → omit the param (clean default URL)
    if (ids.length <= 1 && ids[0] === activeOrgId) params.delete("orgs");
    else params.set("orgs", ids.join(","));
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    apply(next);
  }

  const label =
    selected.size <= 1
      ? eligibleOrgs.find((o) => selected.has(o.id))?.name ?? "This org"
      : `${selected.size} orgs`;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/[0.08]">
        <Building2 className="h-3.5 w-3.5 text-violet-300" />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[220px] rounded-lg border border-white/10 bg-slate-900 p-1 shadow-xl"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            Combine organizations
          </DropdownMenu.Label>
          {eligibleOrgs.map((o) => (
            <DropdownMenu.CheckboxItem
              key={o.id}
              checked={selected.has(o.id)}
              onSelect={(e) => {
                e.preventDefault();
                toggle(o.id);
              }}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none hover:bg-white/[0.06]"
            >
              <span className="truncate">
                {o.name}
                {o.id === activeOrgId ? " (current)" : ""}
              </span>
              {selected.has(o.id) && <Check className="h-4 w-4 text-violet-300" />}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
