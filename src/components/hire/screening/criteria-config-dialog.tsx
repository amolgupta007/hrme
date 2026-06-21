"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getScreeningConfig,
  upsertScreeningCriteria,
  suggestCriteriaFromJd,
} from "@/actions/screening";

type Req = { label: string; weight: number };

export function CriteriaConfigDialog({ jobId }: { jobId: string }) {
  const [must, setMust] = useState<Req[]>([]);
  const [nice, setNice] = useState<Req[]>([]);
  const [topK, setTopK] = useState(20);
  const [pending, start] = useTransition();

  useEffect(() => {
    getScreeningConfig(jobId).then((res) => {
      if (res.success && res.data) {
        setMust(res.data.must_haves ?? []);
        setNice(res.data.nice_to_haves ?? []);
        setTopK(res.data.top_k ?? 20);
      }
    });
  }, [jobId]);

  function suggest() {
    start(async () => {
      const res = await suggestCriteriaFromJd(jobId);
      if (res.success) {
        setMust(res.data.must_haves);
        setNice(res.data.nice_to_haves);
        toast.success("Suggested criteria from the job description");
      } else toast.error(res.error);
    });
  }

  function save() {
    start(async () => {
      const res = await upsertScreeningCriteria(jobId, { must_haves: must, nice_to_haves: nice, top_k: topK });
      if (res.success) toast.success("Criteria saved");
      else toast.error(res.error);
    });
  }

  function editRow(list: Req[], setList: (r: Req[]) => void, i: number, patch: Partial<Req>) {
    setList(list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function renderList(title: string, list: Req[], setList: (r: Req[]) => void) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{title}</h4>
          <Button variant="ghost" size="sm" onClick={() => setList([...list, { label: "", weight: 3 }])}>
            + Add
          </Button>
        </div>
        {list.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="flex-1 rounded border px-2 py-1 text-sm"
              value={r.label}
              placeholder="Requirement"
              onChange={(e) => editRow(list, setList, i, { label: e.target.value })}
            />
            <select
              className="rounded border px-2 py-1 text-sm"
              value={r.weight}
              onChange={(e) => editRow(list, setList, i, { weight: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((w) => (
                <option key={w} value={w}>
                  weight {w}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={() => setList(list.filter((_, idx) => idx !== i))}>
              ✕
            </Button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Screening criteria</h3>
        <Button variant="outline" size="sm" onClick={suggest} disabled={pending}>
          Suggest from JD
        </Button>
      </div>
      {renderList("Must-haves", must, setMust)}
      {renderList("Nice-to-haves", nice, setNice)}
      <div className="flex items-center gap-2 text-sm">
        <label>Score top</label>
        <input
          type="number"
          min={1}
          max={100}
          value={topK}
          onChange={(e) => setTopK(Number(e.target.value))}
          className="w-20 rounded border px-2 py-1"
        />
        <span>candidates</span>
      </div>
      <Button onClick={save} disabled={pending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
        {pending ? "Saving…" : "Save criteria"}
      </Button>
    </div>
  );
}
