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

/**
 * Mobile-only design palette (Phase D "Jambahr iOS app design", 2026-07-17).
 * NOT drift-tested against the web theme — the design intentionally diverges
 * (brand `#17806D` vs web teal). Consumed only by `apps/mobile`
 * (tailwind.config.js). Do NOT feed these into `nativewindTheme` above or the
 * web `palette` — the drift test (apps/web/tests/design-tokens) must stay green.
 * Hex format so NativeWind + Tailwind can parse directly.
 */
const mobilePalette = {
  brand: { DEFAULT: "#17806D", pressed: "#0E5E4F", tint: "#E7F3F0" },
  ink: { 900: "#0B1220", 600: "#3F4757", 400: "#6A727E" },
  canvas: "#F7F7F4",
  surface: "#FFFFFF",
  line: "#E7E9EC",
  success: { DEFAULT: "#1E9E63", tint: "#E5F6EA", ontint: "#177245" },
  warning: { DEFAULT: "#B45309", tint: "#FBF0D9", ontint: "#8A5A06" },
  danger: { DEFAULT: "#DC2626", tint: "#FDE8E8", ontint: "#B91C1C" },
  info: { DEFAULT: "#3B63D8", tint: "#E8EEFC", ontint: "#2A4BB5" },
};

/**
 * Dark counterpart of `mobilePalette` (Mobile PRD-04 §1: "dark mode support
 * from day one (tokens, not hardcoded colors)").
 *
 * Role-preserving rather than a naive inversion: `canvas` stays the recessive
 * surface and `surface` the raised one, so a card still reads as sitting above
 * the page. Brand lightens (a 36%-lightness teal on near-black fails contrast);
 * tints become low-lightness washes of their hue instead of pale pastels, which
 * would glow. Ink ramps invert so ink-900 remains "most prominent text".
 *
 * ⚠️ NOT YET ACTIVE. `apps/mobile/app.json` still pins
 * `userInterfaceStyle: "light"`, and the components still carry light-mode
 * classes with some literal hex values (icon `color=` props in particular).
 * Turning dark mode on is a mechanical sweep — `dark:` variants plus replacing
 * literal hex `color` props with token lookups — that needs a device or
 * simulator to verify. Flipping the switch before that sweep would ship a
 * half-dark app, which is worse than a consistently light one.
 */
const mobilePaletteDark = {
  brand: { DEFAULT: "#2FA98F", pressed: "#26907A", tint: "#12312B" },
  ink: { 900: "#F2F4F7", 600: "#A3ACB9", 400: "#6B7480" },
  canvas: "#0C0F14",
  surface: "#161A21",
  line: "#252A33",
  success: { DEFAULT: "#37B87A", tint: "#10281C", ontint: "#5FD69B" },
  warning: { DEFAULT: "#D98324", tint: "#2C1F0C", ontint: "#EBA84E" },
  danger: { DEFAULT: "#EF4444", tint: "#2E1213", ontint: "#F98080" },
  info: { DEFAULT: "#6D8DEB", tint: "#141B2E", ontint: "#93AAF2" },
};

module.exports = {
  palette,
  radius,
  fontSize,
  nativewindTheme,
  mobilePalette,
  mobilePaletteDark,
};
