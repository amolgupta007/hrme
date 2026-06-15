"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type TargetRow = { target_type: "department" | "employee"; target_id: string };

export function LatePolicyTargetsSelect({
  departments,
  employees,
  value,
  onChange,
}: {
  departments: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string; department_id: string | null }>;
  value: TargetRow[];
  onChange: (next: TargetRow[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value.map((t) => `${t.target_type}:${t.target_id}`)), [value]);

  function toggle(type: "department" | "employee", id: string) {
    const key = `${type}:${id}`;
    if (selected.has(key)) onChange(value.filter((t) => `${t.target_type}:${t.target_id}` !== key));
    else onChange([...value, { target_type: type, target_id: id }]);
  }

  const summary =
    value.length === 0
      ? "No one selected"
      : `${value.filter((t) => t.target_type === "department").length} dept(s), ${value.filter((t) => t.target_type === "employee").length} employee(s)`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm"
      >
        <span className="text-muted-foreground">{summary}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-2 shadow-md">
          <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">Departments</p>
          {departments.map((d) => (
            <Row key={d.id} label={d.name} checked={selected.has(`department:${d.id}`)} onClick={() => toggle("department", d.id)} />
          ))}
          <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase text-muted-foreground">Employees</p>
          {employees.map((e) => (
            <Row key={e.id} label={e.name} checked={selected.has(`employee:${e.id}`)} onClick={() => toggle("employee", e.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
      <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "bg-primary text-primary-foreground" : ""}`}>
        {checked && <Check className="h-3 w-3" />}
      </span>
      {label}
    </button>
  );
}
