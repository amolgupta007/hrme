"use client";

import { useState } from "react";
import { toast } from "sonner";
import { upsertWhatsAppCredentials, sendTestWhatsApp, type WhatsAppCredsView } from "@/actions/whatsapp-credentials";

const PROVIDERS = ["centralized", "aisensy", "wati", "omni"] as const;

export function WhatsAppProviderCard({ initial }: { initial: WhatsAppCredsView | null }) {
  const [provider, setProvider] = useState<string>(initial?.provider ?? "centralized");
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? "");
  const [active, setActive] = useState(initial?.active ?? false);
  const [tplLate, setTplLate] = useState(initial?.templateMap?.late_punch_alert ?? "");
  const [tplWarn, setTplWarn] = useState(initial?.templateMap?.late_warning ?? "");
  const [tplBlock, setTplBlock] = useState(initial?.templateMap?.bonus_ineligible_alert ?? "");
  const [testPhone, setTestPhone] = useState("");

  async function save() {
    const res = await upsertWhatsAppCredentials({
      provider: provider as any,
      apiKey: apiKey ? apiKey : null,
      endpoint: endpoint ? endpoint : null,
      templateMap: { late_punch_alert: tplLate, late_warning: tplWarn, bonus_ineligible_alert: tplBlock },
      active,
    });
    if (res.success) { toast.success("WhatsApp settings saved"); setApiKey(""); }
    else toast.error(res.error);
  }

  async function test() {
    if (!testPhone) return toast.error("Enter a phone number");
    const res = await sendTestWhatsApp(testPhone);
    if (res.success) toast.success("Test message sent");
    else toast.error(res.error);
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">WhatsApp provider</h3>
      <p className="text-sm text-muted-foreground">Optional. If unset, late alerts go by email only. Omni adapter coming soon.</p>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Provider
          <select className="mt-1 w-full rounded-md border px-3 py-2" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {PROVIDERS.map((p) => <option key={p} value={p} disabled={p === "omni"}>{p}{p === "omni" ? " (soon)" : ""}</option>)}
          </select>
        </label>
        <label className="text-sm">Endpoint (optional)
          <input className="mt-1 w-full rounded-md border px-3 py-2" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
        </label>
        <label className="text-sm">API key {initial?.hasApiKey && <span className="text-xs text-muted-foreground">(saved — leave blank to keep)</span>}
          <input type="password" className="mt-1 w-full rounded-md border px-3 py-2" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </label>
        <label className="flex items-end gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">Template: late<input className="mt-1 w-full rounded-md border px-3 py-2" value={tplLate} onChange={(e) => setTplLate(e.target.value)} /></label>
        <label className="text-sm">Template: warn<input className="mt-1 w-full rounded-md border px-3 py-2" value={tplWarn} onChange={(e) => setTplWarn(e.target.value)} /></label>
        <label className="text-sm">Template: block<input className="mt-1 w-full rounded-md border px-3 py-2" value={tplBlock} onChange={(e) => setTplBlock(e.target.value)} /></label>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={save} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Save</button>
        <input className="rounded-md border px-3 py-2 text-sm" placeholder="+91… test number" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
        <button onClick={test} className="rounded-md border px-3 py-2 text-sm">Send test</button>
      </div>
    </div>
  );
}
