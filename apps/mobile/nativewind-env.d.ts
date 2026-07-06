/// <reference types="nativewind/types" />
/// <reference types="react-native-css-interop/types" />
// The second reference is load-bearing for CI: nativewind/types chains to the
// css-interop copy NESTED under the root-hoisted nativewind, whose own
// `import ... from "react-native"` does not resolve on a clean linux
// `npm ci` layout — so the className module augmentation silently never
// applies and `tsc` fails with TS2769 on every styled component.
// Referencing the app-local copy directly resolves every hop from
// apps/mobile/node_modules (same react-native instance the app code sees).
// Sibling of the metro.config.js resolveRequest pin — same two-copy root cause.
