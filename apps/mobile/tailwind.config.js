const { nativewindTheme, mobilePalette } = require("@jambahr/config/tokens");

/**
 * The mobile app layers the Phase D "iOS" design palette (`mobilePalette`) on
 * top of the shared web-derived `nativewindTheme` colors. Existing Phase C
 * components still use the web tokens (`bg-background`, `bg-primary`, …); the
 * new Home/Attendance screens use the design classes (`bg-brand`,
 * `text-ink-600`, `bg-canvas`, `bg-success-tint`, …). success/warning merge so
 * the web `foreground` shade survives while DEFAULT/tint/ontint come from the
 * design.
 */
const colors = {
  ...nativewindTheme.colors,
  brand: mobilePalette.brand,
  ink: mobilePalette.ink,
  canvas: mobilePalette.canvas,
  surface: mobilePalette.surface,
  line: mobilePalette.line,
  success: { ...nativewindTheme.colors.success, ...mobilePalette.success },
  warning: { ...nativewindTheme.colors.warning, ...mobilePalette.warning },
  danger: mobilePalette.danger,
  info: mobilePalette.info,
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: { ...nativewindTheme, colors } },
  plugins: [],
};
