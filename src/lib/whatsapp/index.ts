import type { ProviderConfig, WhatsAppProvider } from "./types";
import { aisensyAdapter } from "./adapters/aisensy";
import { watiAdapter } from "./adapters/wati";
import { centralizedAdapter } from "./adapters/centralized";

export * from "./types";

/** Resolve a provider from a per-org config. Returns null when no usable provider. */
export function resolveProvider(cfg: ProviderConfig | null): WhatsAppProvider | null {
  if (!cfg || !cfg.active) return null;
  switch (cfg.provider) {
    case "aisensy":
      return aisensyAdapter(cfg);
    case "wati":
      return watiAdapter(cfg);
    case "centralized":
      return centralizedAdapter();
    case "omni": // Follow-up: Omni adapter once its API is confirmed.
    case "meta": // Not in v1.
    default:
      return null;
  }
}
