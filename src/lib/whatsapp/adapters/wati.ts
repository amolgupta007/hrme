import type { ProviderConfig, SendTemplateInput, SendTemplateResult, WhatsAppProvider } from "../types";

export function watiAdapter(cfg: ProviderConfig): WhatsAppProvider {
  return {
    name: "wati",
    async sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
      if (!cfg.apiKey || !cfg.endpoint) return { ok: false, error: "WATI apiKey/endpoint missing" };
      const templateName = cfg.templateMap[input.templateKey];
      if (!templateName) return { ok: false, error: `No template mapped for ${input.templateKey}` };
      try {
        const url = `${cfg.endpoint.replace(/\/$/, "")}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(input.to)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({
            template_name: templateName,
            broadcast_name: templateName,
            parameters: Object.entries(input.variables).map(([name, value]) => ({ name, value })),
          }),
        });
        if (!res.ok) return { ok: false, error: `WATI HTTP ${res.status}` };
        const json = (await res.json().catch(() => ({}))) as { id?: string };
        return { ok: true, providerMessageId: json.id };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "WATI send failed" };
      }
    },
  };
}
