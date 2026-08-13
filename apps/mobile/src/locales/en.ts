/**
 * English strings — the canonical locale and the shape every other locale must
 * match (Mobile PRD-04 §3: "structure strings for future Hindi/Marathi
 * localization … English-only content for now").
 *
 * Deliberately a typed nested object rather than a `t("a.b.c")` string-key API:
 *
 *  - a missing or misspelled key is a **compile** error, not a runtime `[a.b.c]`
 *    leaking into the UI;
 *  - renaming a string is a safe refactor with editor support;
 *  - interpolation is a plain function, so parameter types are checked too.
 *
 * Adding a locale means writing another module of the same shape and typing it
 * `satisfies Strings` — the compiler then lists everything left to translate.
 *
 * **Migration status:** strings are moved here screen by screen. D5 surfaces
 * (location-verified clock-in, the version gate) are the reference
 * implementation; older screens still hold their copy inline and are being
 * migrated as they're touched. Put NEW user-facing copy here.
 */
export const en = {
  common: {
    close: "Close",
    continue: "Continue",
    notNow: "Not now",
    retry: "Retry",
    signOut: "Sign out",
    done: "Done",
  },

  location: {
    consent: {
      title: "Location at clock-in",
      intro: (org: string) =>
        `${org} has turned on location-verified clock-in. When you punch in or out, JambaHR reads your location once and records whether you were at one of ${org}'s offices.`,
      points: {
        whenTitle: "Only at the moment you punch",
        whenBody:
          "Nothing is read while the app is in the background or closed. There is no continuous trail.",
        employerTitle: "What your employer sees",
        employerBody:
          "Either the office you punched from, or that you were remote and the general area — for example “Andheri East, Mumbai”. Never your exact address.",
        controlTitle: "You stay in control",
        controlBody:
          "You can turn location off for JambaHR at any time in your device Settings.",
      },
      requiredWarning: (org: string) =>
        `${org} requires a location to clock in. Without it, your punch won't be recorded — speak to your admin if you can't share it.`,
      optionalNote:
        "If you decline, your punches are still recorded — they just won't carry a location.",
      continueA11y: "Continue and choose location permission",
    },

    /** Appended to every failure message, so the outcome is never ambiguous. */
    outcomeSuffix: {
      blocking: " Your organisation requires location to clock in.",
      nonBlocking: " Your punch was recorded without a location.",
    },
    outcome: {
      denied:
        "Location permission is off. Turn it on for JambaHR in your device Settings.",
      servicesOff: "Location services are switched off on this device.",
      timeout: "Couldn't get a location fix — try moving near a window.",
      unavailable:
        "This app version can't read location. Ask your admin for an updated build.",
      error: "Couldn't read your location.",
    },

    chip: {
      atOffice: "At office",
      remote: "Remote",
      /** e.g. "Remote · Andheri East, Mumbai" */
      remoteAt: (place: string) => `Remote · ${place}`,
      lastPunchA11y: (label: string) => `Last punch: ${label}`,
    },
  },

  punch: {
    in: "Punch in",
    out: "Punch out",
    errors: {
      clockSkew: "Your device clock looks off. Fix the time and try again.",
      attendanceDisabled: "Attendance isn't enabled for your organization.",
      inactiveEmployee: "Your employee record isn't active. Contact your admin.",
      noMembership: "You're not a member of this organization.",
      locationRequired:
        "Your organisation requires a location to clock in. Turn on location for JambaHR in Settings and try again.",
      generic: "Couldn't record your punch. Please try again.",
    },
  },

  update: {
    title: "Update JambaHR",
    body: "This version of the app is no longer supported. Update to keep clocking in, applying for leave, and viewing payslips.",
    cta: "Update now",
    ctaA11y: "Update the app",
    noLinkFallback:
      "Update JambaHR from the App Store, or ask your administrator for the latest build.",
    youHave: (version: string) => `You have ${version}`,
    unknownVersion: "Unknown version",
    required: (minVersion: string) => ` · ${minVersion} required`,
  },
} as const;

/** The shape every locale must satisfy. */
export type Strings = typeof en;
