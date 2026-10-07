// Plain module — turns preset selections or an uploaded CSV into holiday rows.
// One holiday per (org, date): several holidays on one date are joined into a
// single row ("Independence Day / Milad-un-Nabi"), mandatory if any is.

import type { HolidayPreset } from "./presets";

export type HolidayDraft = { name: string; date: string; isOptional: boolean };

const MAX_NAME = 80;

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function presetToDrafts(rows: HolidayPreset[]): HolidayDraft[] {
  return rows.map((r) => ({ name: r.name, date: r.date, isOptional: r.kind === "restricted" }));
}

export function mergeHolidayDrafts(
  drafts: HolidayDraft[],
  existingDates: ReadonlySet<string>
): { rows: HolidayDraft[]; skipped: string[] } {
  const byDate = new Map<string, HolidayDraft[]>();
  for (const d of drafts) {
    const list = byDate.get(d.date) ?? [];
    list.push(d);
    byDate.set(d.date, list);
  }
  const rows: HolidayDraft[] = [];
  const skipped: string[] = [];
  for (const date of [...byDate.keys()].sort()) {
    if (existingDates.has(date)) {
      skipped.push(date);
      continue;
    }
    const group = byDate.get(date)!;
    const names = [...new Set(group.map((g) => g.name.trim()).filter(Boolean))];
    let name = names[0] ?? "";
    for (const n of names.slice(1)) {
      if (`${name} / ${n}`.length > MAX_NAME) break;
      name = `${name} / ${n}`;
    }
    rows.push({ name: name.slice(0, MAX_NAME), date, isOptional: group.every((g) => g.isOptional) });
  }
  return { rows, skipped };
}

/** Splits one CSV line, honouring double-quoted fields ("a, b" and "" escapes). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** YYYY-MM-DD, or DD/MM/YYYY and DD-MM-YYYY (how Excel exports Indian dates). */
function normaliseDate(raw: string): string | null {
  if (isValidIsoDate(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

const YES = new Set(["yes", "y", "true", "1", "optional"]);
const NO = new Set(["", "no", "n", "false", "0", "mandatory"]);

export function parseHolidayCsv(text: string): {
  drafts: HolidayDraft[];
  errors: { line: number; message: string }[];
} {
  const drafts: HolidayDraft[] = [];
  const errors: { line: number; message: string }[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    if (!raw.trim()) return;
    const [nameRaw = "", dateRaw = "", optRaw = ""] = splitCsvLine(raw);
    if (idx === 0 && nameRaw.toLowerCase() === "name" && dateRaw.toLowerCase() === "date") return;
    const name = nameRaw.trim();
    if (!name) return void errors.push({ line, message: "Name is required" });
    if (name.length > MAX_NAME) return void errors.push({ line, message: "Name must be 80 characters or fewer" });
    const date = normaliseDate(dateRaw);
    if (!date) return void errors.push({ line, message: "Date must be a real date (YYYY-MM-DD or DD/MM/YYYY)" });
    const opt = optRaw.toLowerCase();
    if (!YES.has(opt) && !NO.has(opt)) {
      return void errors.push({ line, message: `Optional must be yes or no (got "${optRaw}")` });
    }
    drafts.push({ name, date, isOptional: YES.has(opt) });
  });
  return { drafts, errors };
}
