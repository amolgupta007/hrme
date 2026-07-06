const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Force a single react-native-css-interop instance. npm cannot hoist it to the
// repo root (peer conflict with the web app's React 18), so two copies exist:
// apps/mobile/node_modules/... (app-local) and node_modules/nativewind/node_modules/...
// (nested). NativeWind registers styles through one copy while the babel
// jsx-runtime wraps components with the other, and every className silently
// no-ops on device. Re-anchoring resolution at apps/mobile pins all imports —
// including nativewind's internal require — to the app-local copy.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "react-native-css-interop" ||
    moduleName.startsWith("react-native-css-interop/")
  ) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(__dirname, "package.json") },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
