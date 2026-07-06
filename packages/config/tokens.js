/**
 * JambaHR design tokens — transcribed from apps/web/src/app/globals.css.
 * The web app keeps reading its CSS vars directly; this module exists for
 * non-CSS consumers (NativeWind / React Native). Drift is guarded by
 * apps/web/tests/design-tokens/tokens-drift.test.ts.
 * Color format: "hsl(H, S%, L%)" — parseable by React Native and Tailwind.
 */

const palette = {
  light: {
    background: "hsl(40, 20%, 99%)",
    foreground: "hsl(220, 20%, 10%)",
    card: "hsl(0, 0%, 100%)",
    cardForeground: "hsl(220, 20%, 10%)",
    primary: "hsl(172, 50%, 36%)",
    primaryForeground: "hsl(0, 0%, 100%)",
    secondary: "hsl(220, 14%, 96%)",
    secondaryForeground: "hsl(220, 20%, 20%)",
    muted: "hsl(220, 14%, 96%)",
    mutedForeground: "hsl(220, 10%, 46%)",
    accent: "hsl(32, 95%, 52%)",
    accentForeground: "hsl(0, 0%, 100%)",
    destructive: "hsl(0, 72%, 51%)",
    destructiveForeground: "hsl(0, 0%, 100%)",
    success: "hsl(142, 60%, 40%)",
    successForeground: "hsl(0, 0%, 100%)",
    warning: "hsl(38, 92%, 50%)",
    warningForeground: "hsl(0, 0%, 10%)",
    border: "hsl(220, 13%, 91%)",
    input: "hsl(220, 13%, 91%)",
    ring: "hsl(172, 50%, 36%)",
  },
  dark: {
    background: "hsl(220, 20%, 7%)",
    foreground: "hsl(220, 10%, 94%)",
    card: "hsl(220, 18%, 10%)",
    cardForeground: "hsl(220, 10%, 94%)",
    primary: "hsl(172, 50%, 45%)",
    primaryForeground: "hsl(0, 0%, 100%)",
    secondary: "hsl(220, 14%, 16%)",
    secondaryForeground: "hsl(220, 10%, 80%)",
    muted: "hsl(220, 14%, 16%)",
    mutedForeground: "hsl(220, 10%, 56%)",
    accent: "hsl(32, 90%, 55%)",
    accentForeground: "hsl(0, 0%, 100%)",
    destructive: "hsl(0, 62%, 50%)",
    destructiveForeground: "hsl(0, 0%, 100%)",
    success: "hsl(142, 55%, 45%)",
    successForeground: "hsl(0, 0%, 100%)",
    warning: "hsl(38, 88%, 55%)",
    warningForeground: "hsl(0, 0%, 10%)",
    border: "hsl(220, 14%, 18%)",
    input: "hsl(220, 14%, 18%)",
    ring: "hsl(172, 50%, 45%)",
  },
};

/** px; web --radius: 0.625rem (10px), md = radius-2px, sm = radius-4px */
const radius = { sm: 6, md: 8, lg: 10 };

/** Tailwind default scale, px — mobile uses system font in Phase C. */
const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
};

/** theme.extend fragment for NativeWind tailwind configs (light theme). */
const nativewindTheme = {
  colors: {
    background: palette.light.background,
    foreground: palette.light.foreground,
    card: { DEFAULT: palette.light.card, foreground: palette.light.cardForeground },
    primary: { DEFAULT: palette.light.primary, foreground: palette.light.primaryForeground },
    secondary: { DEFAULT: palette.light.secondary, foreground: palette.light.secondaryForeground },
    muted: { DEFAULT: palette.light.muted, foreground: palette.light.mutedForeground },
    accent: { DEFAULT: palette.light.accent, foreground: palette.light.accentForeground },
    destructive: { DEFAULT: palette.light.destructive, foreground: palette.light.destructiveForeground },
    success: { DEFAULT: palette.light.success, foreground: palette.light.successForeground },
    warning: { DEFAULT: palette.light.warning, foreground: palette.light.warningForeground },
    border: palette.light.border,
    input: palette.light.input,
    ring: palette.light.ring,
  },
  borderRadius: { sm: "6px", md: "8px", lg: "10px" },
};

module.exports = { palette, radius, fontSize, nativewindTheme };
