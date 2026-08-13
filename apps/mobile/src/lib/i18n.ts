import { en, type Strings } from "@/locales/en";

/**
 * Localisation entry point (Mobile PRD-04 §3).
 *
 * One locale ships today, so this resolves to a module-level constant rather
 * than React context — every consumer, component or not, imports the same
 * object and there is no provider to forget to mount.
 *
 * **Adding locales.** Write `src/locales/hi.ts` typed
 * `satisfies Strings` (the compiler then enumerates everything missing), add it
 * to `LOCALES`, and replace `strings` with a context-backed `useStrings()` so a
 * locale change re-renders. Deliberately not built ahead of a real second
 * locale: context plumbing with exactly one value is machinery pretending to be
 * a feature, and swapping it in later is a mechanical change because every call
 * site already goes through this module.
 */

export type LocaleCode = "en";

const LOCALES: Record<LocaleCode, Strings> = { en };

export const DEFAULT_LOCALE: LocaleCode = "en";

/**
 * The active string table.
 *
 * Usage: `import { strings } from "@/lib/i18n"` then `strings.punch.in`.
 * Interpolated entries are functions: `strings.update.youHave("1.2.0")`.
 */
export const strings: Strings = LOCALES[DEFAULT_LOCALE];

/**
 * Hook form, for components that should re-render when the locale becomes
 * switchable. Identical output to `strings` today — using it in components
 * means those call sites need no change when a second locale lands.
 */
export function useStrings(): Strings {
  return strings;
}
