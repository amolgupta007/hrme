export type TokenPalette = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  border: string;
  input: string;
  ring: string;
};

export declare const palette: { light: TokenPalette; dark: TokenPalette };
export declare const radius: { sm: number; md: number; lg: number };
export declare const fontSize: {
  xs: number; sm: number; base: number; lg: number;
  xl: number; "2xl": number; "3xl": number;
};
export declare const nativewindTheme: Record<string, unknown>;

export type MobileStatusColor = { DEFAULT: string; tint: string; ontint: string };
export type MobilePalette = {
  brand: { DEFAULT: string; pressed: string; tint: string };
  ink: { 900: string; 600: string; 400: string };
  canvas: string;
  surface: string;
  line: string;
  success: MobileStatusColor;
  warning: MobileStatusColor;
  danger: MobileStatusColor;
  info: MobileStatusColor;
};
export declare const mobilePalette: MobilePalette;

declare const tokens: {
  palette: { light: TokenPalette; dark: TokenPalette };
  radius: { sm: number; md: number; lg: number };
  fontSize: {
    xs: number; sm: number; base: number; lg: number;
    xl: number; "2xl": number; "3xl": number;
  };
  nativewindTheme: Record<string, unknown>;
  mobilePalette: MobilePalette;
};
export default tokens;
