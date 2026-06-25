"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getIngestSecurity,
  regenerateIngestToken,
  setRequireIngestToken,
  type IngestSecurity,
} from "@/actions/attendance-devices";

const HOST = "https://jambahr.com";

export function IngestSecurityCard() {
  const [sec, setSec] = useState<IngestSecurity | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getIngestSecurity().then((r) => {
      if (r.success) setSec(r.data);
    });
  }, []);

  async function gen() {
    setBusy(true);
    const r = await regenerateIngestToken();
    setBusy(false);
    if (r.success) {
      setSec((s) => ({ token: r.data, requireToken: s?.requireToken ?? false }));
      toast.success("Ingest token generated");
    } else toast.error(r.error);
  }

  async function toggleRequire() {
    if (!sec) return;
    const next = !sec.requireToken;
    setBusy(true);
    const r = await setRequireIngestToken(next);
    setBusy(false);
    if (r.success) {
      setSec({ ...sec, requireToken: next });
      toast.success(next ? "Token now required" : "Token no longer required");
    } else toast.error(r.error);
  }

  function copy(t: string) {
    navigator.clipboard.writeText(t).then(() => toast.success("Copied"));
  }

  if (!sec) return null;
  const secureUrl = sec.token ? `${HOST}/iclock/${sec.token}` : null;

  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <ShieldCheck className="h-3.5 w-3.5" /> Device security
      </p>
      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
        By default any registered device serial is accepted. For stronger security, point your
        device at a secret server path — punches then carry a token the serial alone doesn&apos;t.
      </p>

      {secureUrl ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="text-xs">
            <span className="text-muted-foreground">
              Secure server path (set as the device&apos;s Server Address / Path):
            </span>
            <button
              type="button"
              onClick={() => copy(secureUrl)}
              className="mt-1 flex w-full items-center justify-between gap-2 rounded bg-muted px-2 py-1 font-mono text-xs hover:text-primary"
            >
              <span className="truncate">{secureUrl}</span>
              <Copy className="h-3 w-3 shrink-0 opacity-60" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sec.requireToken}
                onChange={toggleRequire}
                disabled={busy}
                className="h-3.5 w-3.5"
              />
              Require token (reject plain serial pushes)
            </label>
            <Button variant="ghost" size="sm" onClick={gen} disabled={busy}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Regenerate
            </Button>
          </div>
          {sec.requireToken && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Devices that can&apos;t set a custom server path will stop being accepted.
            </p>
          )}
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={gen} disabled={busy}>
          <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Generate ingest token
        </Button>
      )}
    </div>
  );
}
