/// <reference types="expo/types" />
// Tracked twin of the auto-generated (and gitignored) expo-env.d.ts.
// CI never runs `expo start`, so expo-env.d.ts doesn't exist there — without
// this reference, tsc on CI can't type CSS side-effect imports (TS2882 on
// `import "../../global.css"`) and process.env.EXPO_PUBLIC_* degrades to any
// (breaking ClerkProvider's publishableKey overload). Harmless duplicate of
// expo-env.d.ts on dev machines where both exist.
