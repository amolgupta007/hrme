"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LEAD_STAGES,
  stageBadgeVariant,
  stageLabel,
  type LeadStage,
} from "@/lib/geo/stages";
import type { LeadCardData } from "./lead-card";

export function LeadsList({ leads }: { leads: LeadCardData[] }) {
  const [stage, setStage] = useState<LeadStage | "all">("all");
  const [q, setQ] = useState("");

  const filtered = leads.filter((l) => {
    if (stage !== "all" && l.stage !== stage) return false;
    if (
      q &&
      !`${l.name} ${l.company ?? ""}`.toLowerCase().includes(q.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search by name or company…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={stage}
          onValueChange={(v) => setStage(v as LeadStage | "all")}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {LEAD_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {stageLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="self-center text-sm text-muted-foreground ml-auto">
          {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No leads match the current filters.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead className="text-right">Value (&#x20B9;)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/geo/leads/${lead.id}`}
                      className="hover:underline text-primary"
                    >
                      {lead.name}
                    </Link>
                    {lead.contact_phone && (
                      <a
                        href={`tel:${lead.contact_phone}`}
                        className="block text-xs text-muted-foreground hover:text-foreground"
                        aria-label={`Call ${lead.name} at ${lead.contact_phone}`}
                      >
                        {lead.contact_phone}
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.company ?? <span className="italic">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={stageBadgeVariant(lead.stage)}
                      aria-label={`Stage: ${stageLabel(lead.stage)}`}
                      className="text-[10px]"
                    >
                      {stageLabel(lead.stage)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.assignee_name ?? (
                      <span className="italic text-amber-700">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {lead.value_inr !== null && lead.value_inr > 0
                      ? lead.value_inr.toLocaleString("en-IN")
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
