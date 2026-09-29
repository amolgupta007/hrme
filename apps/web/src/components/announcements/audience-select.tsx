"use client";

import * as React from "react";
import { Building2, Check, Search, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { AnnouncementAudienceOptions } from "@/actions/announcements";
import type { AudienceTarget, AudienceType } from "@/lib/announcements/ack-status";

interface AudienceSelectProps {
  options: AnnouncementAudienceOptions | null;
  audienceType: AudienceType;
  targets: AudienceTarget[];
  onChange: (next: { audienceType: AudienceType; targets: AudienceTarget[] }) => void;
  /** Frozen after publishing an ack-required announcement. */
  locked?: boolean;
}

/**
 * "Everyone" is the default and is clearly separate from targeting. While it
 * is selected the department + employee pickers are disabled and faded; the
 * chosen targets are kept, so switching back restores them.
 */
export function AudienceSelect({ options, audienceType, targets, onChange, locked }: AudienceSelectProps) {
  const [query, setQuery] = React.useState("");
  const targeted = audienceType === "targeted";
  const pickersDisabled = !targeted || !!locked;

  const has = (type: AudienceTarget["target_type"], id: string) =>
    targets.some((t) => t.target_type === type && t.target_id === id);

  function toggle(type: AudienceTarget["target_type"], id: string) {
    if (pickersDisabled) return;
    onChange({
      audienceType,
      targets: has(type, id)
        ? targets.filter((t) => !(t.target_type === type && t.target_id === id))
        : [...targets, { target_type: type, target_id: id }],
    });
  }

  const deptName = new Map(options?.departments.map((d) => [d.id, d.name]) ?? []);
  const empName = new Map(options?.employees.map((e) => [e.id, e.name]) ?? []);
  const q = query.trim().toLowerCase();
  const employees = (options?.employees ?? []).filter((e) => !q || e.name.toLowerCase().includes(q));

  const selectedDepts = targets.filter((t) => t.target_type === "department");
  const selectedEmps = targets.filter((t) => t.target_type === "employee");

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Audience" className="grid gap-2 sm:grid-cols-2">
        <ModeOption
          selected={!targeted}
          disabled={locked}
          onSelect={() => onChange({ audienceType: "all", targets })}
          icon={<Users className="h-4 w-4" />}
          title="Everyone"
          description="All current employees"
        />
        <ModeOption
          selected={targeted}
          disabled={locked}
          onSelect={() => onChange({ audienceType: "targeted", targets })}
          icon={<Building2 className="h-4 w-4" />}
          title="Specific people"
          description="Choose departments and/or employees"
        />
      </div>

      {locked && (
        <p className="text-xs text-muted-foreground">
          The audience is fixed once an announcement that needs acknowledgement is published. New joiners
          can be added from its acknowledgement page.
        </p>
      )}

      <fieldset
        disabled={pickersDisabled}
        aria-disabled={pickersDisabled}
        className={cn(
          "space-y-3 rounded-lg border border-border p-3 transition-opacity",
          pickersDisabled && "pointer-events-none select-none opacity-40"
        )}
      >
        <legend className="sr-only">Departments and employees</legend>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Departments</p>
          {options && options.departments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No departments yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(options?.departments ?? []).map((d) => {
                const on = has("department", d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle("department", d.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {on && <Check className="h-3 w-3" />}
                    {d.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Employees</p>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search employees"
              className="h-9 pl-8"
              aria-label="Search employees"
            />
          </div>
          <div className="scroll-thin max-h-44 overflow-y-auto rounded-md border border-border">
            {!options ? (
              <p className="p-3 text-xs text-muted-foreground">Loading…</p>
            ) : employees.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No matching employees.</p>
            ) : (
              employees.map((e) => {
                const on = has("employee", e.id);
                const viaDept = !on && !!e.department_id && has("department", e.department_id);
                return (
                  <label
                    key={e.id}
                    className="flex cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2 text-sm last:border-b-0 hover:bg-muted/60"
                  >
                    <input
                      type="checkbox"
                      checked={on || viaDept}
                      disabled={viaDept}
                      onChange={() => toggle("employee", e.id)}
                      className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
                    />
                    <span className="flex-1 truncate">{e.name}</span>
                    {viaDept && (
                      <span className="text-xs text-muted-foreground">
                        via {deptName.get(e.department_id!) ?? "department"}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>

        {(selectedDepts.length > 0 || selectedEmps.length > 0) && (
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
            {[...selectedDepts, ...selectedEmps].map((t) => (
              <span
                key={`${t.target_type}:${t.target_id}`}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
              >
                {t.target_type === "department" ? <Building2 className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                {(t.target_type === "department" ? deptName.get(t.target_id) : empName.get(t.target_id)) ?? "…"}
                <button
                  type="button"
                  onClick={() => toggle(t.target_type, t.target_id)}
                  className="rounded-full p-0.5 hover:bg-background"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}

function ModeOption(props: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      disabled={props.disabled}
      onClick={props.onSelect}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        props.selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          props.selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {props.icon}
      </span>
      <span>
        <span className="block text-sm font-medium">{props.title}</span>
        <span className="block text-xs text-muted-foreground">{props.description}</span>
      </span>
    </button>
  );
}
