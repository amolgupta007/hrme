"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  function renderList(title: string, hint: string, list: Req[], setList: (r: Req[]) => void) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{title}</h4>
          <Button variant="ghost" size="sm" onClick={() => setList([...list, { label: "", weight: 3 }])}>
            + Add
          </Button>
        </div>
        {list.length === 0 ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : (
          list.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                className="flex-1"
                value={r.label}
                placeholder="Requirement (e.g. 3+ yrs React)"
                onChange={(e) => editRow(list, setList, i, { label: e.target.value })}
              />
              <Select
                value={String(r.weight)}
                onValueChange={(v) => editRow(list, setList, i, { weight: Number(v) })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 · critical</SelectItem>
                  <SelectItem value="4">4 · high</SelectItem>
                  <SelectItem value="3">3 · medium</SelectItem>
                  <SelectItem value="2">2 · low</SelectItem>
                  <SelectItem value="1">1 · minor</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Remove requirement"
                onClick={() => setList(list.filter((_, idx) => idx !== i))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Screening criteria</CardTitle>
        <Button variant="outline" size="sm" onClick={suggest} disabled={pending}>
          {pending ? "Thinking…" : "Suggest from JD"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderList("Must-haves", "Add the requirements a candidate must meet. Weighted heaviest in scoring.", must, setMust)}
        {renderList("Nice-to-haves", "Optional strengths that lift a score but aren't dealbreakers.", nice, setNice)}
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="topk">Score the top</label>
          <Input
            id="topk"
            type="number"
            min={1}
            max={100}
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            className="w-20"
          />
          <span className="text-muted-foreground">ranked candidates</span>
        </div>
        <Button onClick={save} disabled={pending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          {pending ? "Saving…" : "Save criteria"}
        </Button>
      </CardContent>
    </Card>
  );
}
