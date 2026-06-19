"use client";

import { useEffect, useState } from "react";
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

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="p-4 text-sm text-muted-foreground">No screening activity yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1">When</th>
          <th>Action</th>
          <th>Score</th>
          <th>Model</th>
          <th>Cost (₹)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t">
            <td className="py-1">{new Date(r.created_at).toLocaleString()}</td>
            <td>{r.action}</td>
            <td>{r.payload?.score ?? "—"}</td>
            <td>{r.payload?.model ?? "—"}</td>
            <td>{((r.cost_inr_paise ?? 0) / 100).toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
