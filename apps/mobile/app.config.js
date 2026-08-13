const fs = require("fs");
const path = require("path");

/**
 * Dynamic Expo config. `app.json` stays the readable, static source of truth;
 * this file only layers on the things that depend on the environment.
 *
 * ## Why this exists: FCM
 *
 * Android push needs an FCM `google-services.json`, which is credentials and so
 * is gitignored. Declaring `android.googleServicesFile` statically in `app.json`
 * would mean that *every* config read fails when the file is absent — local
 * `expo start`, `expo prebuild`, and the CI job that introspects the config on
 * every mobile PR. Contributors and CI would be blocked by a credential they
 * have no reason to hold.
 *
 * So the key is only set when the file is actually present. Missing file ⇒ the
 * Android build succeeds and simply has no remote push, which is the right
 * failure: loud in the release checklist, silent everywhere it doesn't matter.
 *
 * EAS builds get the file from the `GOOGLE_SERVICES_JSON` environment variable
 * (an EAS "file"-type secret); EAS materialises it on disk and sets the variable
 * to its path, which is why that is checked first.
 */
module.exports = ({ config }) => {
  const googleServicesFile = resolveGoogleServicesFile();

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};

function resolveGoogleServicesFile() {
  // EAS file-secret: the variable holds the path EAS wrote the file to.
  const fromEnv = process.env.GOOGLE_SERVICES_JSON;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  // Local: a developer who has downloaded it from the Firebase console.
  const local = path.join(__dirname, "google-services.json");
  if (fs.existsSync(local)) return local;

  return null;
}
