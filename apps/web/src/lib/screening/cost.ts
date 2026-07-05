// USD per 1M tokens. Keep rates here; update when Anthropic changes pricing.
const RATE_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};
const FALLBACK = RATE_USD_PER_MTOK["claude-sonnet-4-6"];
const USD_TO_INR = 86;
const INR_PER_PAISA = 100;

export function screeningCostPaise(args: { model: string; inputTokens: number; outputTokens: number }): number {
  const rate = RATE_USD_PER_MTOK[args.model] ?? FALLBACK;
  const usd =
    (args.inputTokens / 1_000_000) * rate.input + (args.outputTokens / 1_000_000) * rate.output;
  return Math.round(usd * USD_TO_INR * INR_PER_PAISA);
}
