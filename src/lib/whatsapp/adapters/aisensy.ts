import type { ProviderConfig, SendTemplateInput, SendTemplateResult, WhatsAppProvider } from "../types";

export function aisensyAdapter(cfg: ProviderConfig): WhatsAppProvider {
  return {
    name: "aisensy",
    async sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
      if (!cfg.apiKey) return { ok: false, error: "AiSensy API key missing" };
      const templateName = cfg.templateMap[input.templateKey];
      if (!templateName) return { ok: false, error: `No template mapped for ${input.templateKey}` };
      try {
        const res = await fetch(cfg.endpoint ?? "https://backend.aisensy.com/campaign/t1/api/v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: cfg.apiKey,
            campaignName: templateName,
            destination: input.to,
            templateParams: Object.values(input.variables),
          }),
        });
        if (!res.ok) return { ok: false, error: `AiSensy HTTP ${res.status}` };
        const json = (await res.json().catch(() => ({}))) as { messageId?: string };
        return { ok: true, providerMessageId: json.messageId };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "AiSensy send failed" };
      }
    },
  };
}
