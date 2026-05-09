/**
 * Single read for env-driven feature flags. Pages, server actions, and
 * sidebar logic all import from here so we never typo `JAMBAHIRE_REFERRALS_ENABLED`
 * in 14 places.
 *
 * Convention: env var must be the literal string "true" to enable. Anything
 * else (undefined, "false", "0", "yes", ...) keeps the feature OFF.
 */

export function isReferralsEnabled(): boolean {
  return process.env.JAMBAHIRE_REFERRALS_ENABLED === "true";
}
