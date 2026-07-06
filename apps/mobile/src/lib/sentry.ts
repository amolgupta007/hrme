import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (!dsn && __DEV__) {
  console.log("[sentry] EXPO_PUBLIC_SENTRY_DSN not set — error capture disabled");
}

Sentry.init({
  dsn,
  enabled: !!dsn, // no-op locally when the DSN isn't set
  tracesSampleRate: 0.2,
  sendDefaultPii: false, // DPDP posture: no user PII by default
});

export { Sentry };
