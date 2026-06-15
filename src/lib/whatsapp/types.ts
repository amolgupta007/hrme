export type WhatsAppTemplateKey = "late_punch_alert" | "bonus_ineligible_alert" | "late_warning";

export type SendTemplateInput = {
  to: string; // E.164 phone
  templateKey: WhatsAppTemplateKey;
  variables: Record<string, string>;
};

export type SendTemplateResult = { ok: boolean; providerMessageId?: string; error?: string };

export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult>;
}

export type ProviderConfig = {
  provider: "omni" | "aisensy" | "wati" | "meta" | "centralized";
  apiKey: string | null;
  endpoint: string | null;
  templateMap: Record<string, string>; // internal key → provider template name/id
  active: boolean;
};
