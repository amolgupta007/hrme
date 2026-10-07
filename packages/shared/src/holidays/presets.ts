// Plain module — curated public-holiday presets that admins import from
// Settings → Holidays. One data file per year; a state or a year is added as
// data, no code change. Every file cites the notification it was copied from.

import { PRESETS_2026 } from "./presets/2026";
import { PRESETS_2027 } from "./presets/2027";

export type HolidayRegion = "national" | "MH";
export type HolidayKind = "gazetted" | "restricted" | "state";
export type HolidayPreset = { region: HolidayRegion; name: string; date: string; kind: HolidayKind };

export const PRESET_REGION_LABELS: Record<HolidayRegion, string> = {
  national: "National (central government)",
  MH: "Maharashtra",
};

const REGION_ORDER: HolidayRegion[] = ["national", "MH"];

const BY_YEAR: Record<number, HolidayPreset[]> = {
  2026: PRESETS_2026,
  2027: PRESETS_2027,
};

export const PRESET_YEARS: number[] = Object.keys(BY_YEAR).map(Number).sort((a, b) => a - b);

export function presetFor(year: number, region: HolidayRegion): HolidayPreset[] {
  return (BY_YEAR[year] ?? []).filter((p) => p.region === region).map((p) => ({ ...p }));
}

export function presetRegionsFor(year: number): HolidayRegion[] {
  const present = new Set((BY_YEAR[year] ?? []).map((p) => p.region));
  return REGION_ORDER.filter((r) => present.has(r));
}
