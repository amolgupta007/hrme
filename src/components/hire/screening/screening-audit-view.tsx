"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { getScreeningAudit } from "@/actions/screening";

export function ScreeningAuditView({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getScreeningAudit(jobId)
      .then((res) => {
        if (res.success) setRows(res.data);
      })
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) return <p className="py-4 text-sm text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="py-4 text-sm text-muted-foreground">No screening activity yet.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Action</TableHead>
          <TableHead className="text-center">Score</TableHead>
          <TableHead>Model</TableHead>
          <TableHead className="text-right">Cost (₹)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </TableCell>
            <TableCell className="capitalize">{r.action}</TableCell>
            <TableCell className="text-center tabular-nums">{r.payload?.score ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{r.payload?.model ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">
              {((r.cost_inr_paise ?? 0) / 100).toFixed(2)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
