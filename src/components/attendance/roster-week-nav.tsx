"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

export function RosterWeekNav({ from, to, onChange }: Props) {
  function shift(days: number) {
    const newFrom = new Date(`${from}T00:00:00.000Z`);
    newFrom.setUTCDate(newFrom.getUTCDate() + days);
    const newTo = new Date(newFrom);
    newTo.setUTCDate(newTo.getUTCDate() + 6);
    onChange(newFrom.toISOString().slice(0, 10), newTo.toISOString().slice(0, 10));
  }
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" onClick={() => shift(-7)}><ChevronLeft className="h-4 w-4" /></Button>
      <span className="text-sm font-medium">{from} → {to}</span>
      <Button size="sm" variant="ghost" onClick={() => shift(7)}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  );
}
