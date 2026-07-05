// https://docs.expo.dev/guides/using-eslint/
// Note: manually ported from eslint-config-expo/flat/default.js (bypassing its
// `require('eslint/config')` call which resolves to the monorepo root eslint v8).
// Sync settings + languageOptions.globals if upstream default.js changes.
const coreConfig = require("eslint-config-expo/flat/utils/core");
const expoConfig = require("eslint-config-expo/flat/utils/expo");
const reactConfig = require("eslint-config-expo/flat/utils/react");
const typescriptConfig = require("eslint-config-expo/flat/utils/typescript");
const { allExtensions } = require("eslint-config-expo/flat/utils/extensions");
const globals = require("globals");

module.exports = [
  ...coreConfig,
  ...typescriptConfig,
  ...reactConfig,
  ...expoConfig,
  {
    settings: {
      "import/extensions": allExtensions,
      "import/resolver": {
        node: { extensions: allExtensions },
      },
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        __DEV__: "readonly",
        ErrorUtils: false,
        FormData: false,
        XMLHttpRequest: false,
        alert: false,
        cancelAnimationFrame: false,
        cancelIdleCallback: false,
        clearImmediate: false,
        fetch: false,
        navigator: false,
        process: false,
        requestAnimationFrame: false,
        requestIdleCallback: false,
        setImmediate: false,
        window: false,
        "shared-node-browser": true,
      },
    },
  },
  {
    ignores: ["dist/*"],
  },
];
