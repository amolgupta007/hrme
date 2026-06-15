import type { ProviderConfig, WhatsAppProvider } from "../types";
import { aisensyAdapter } from "./aisensy";
import { watiAdapter } from "./wati";

/**
 * Centralized = JambaHR's own provider account, configured via env.
 * Reuses whichever underlying BSP is set in WHATSAPP_CENTRALIZED_PROVIDER.
 */
export function centralizedAdapter(): WhatsAppProvider {
  const cfg: ProviderConfig = {
    provider: "centralized",
    apiKey: process.env.WHATSAPP_CENTRALIZED_API_KEY ?? null,
    endpoint: process.env.WHATSAPP_CENTRALIZED_ENDPOINT ?? null,
    templateMap: {
      late_punch_alert: process.env.WHATSAPP_CENTRALIZED_TPL_LATE ?? "late_punch_alert",
      bonus_ineligible_alert: process.env.WHATSAPP_CENTRALIZED_TPL_INELIGIBLE ?? "bonus_ineligible_alert",
      late_warning: process.env.WHATSAPP_CENTRALIZED_TPL_WARN ?? "late_warning",
    },
    active: true,
  };
  const kind = (process.env.WHATSAPP_CENTRALIZED_PROVIDER ?? "aisensy").toLowerCase();
  return kind === "wati" ? watiAdapter(cfg) : aisensyAdapter(cfg);
}
