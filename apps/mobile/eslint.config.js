// https://docs.expo.dev/guides/using-eslint/
// Note: import individual utils to avoid eslint-config-expo/flat/default.js's
// `require('eslint/config')` call which resolves to the monorepo root eslint v8.
const coreConfig = require("eslint-config-expo/flat/utils/core");
const expoConfig = require("eslint-config-expo/flat/utils/expo");
const reactConfig = require("eslint-config-expo/flat/utils/react");
const typescriptConfig = require("eslint-config-expo/flat/utils/typescript");

module.exports = [
  ...coreConfig,
  ...typescriptConfig,
  ...reactConfig,
  ...expoConfig,
  {
    ignores: ["dist/*"],
  },
];
