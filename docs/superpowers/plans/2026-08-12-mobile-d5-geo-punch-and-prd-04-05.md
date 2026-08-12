# Mobile D5 — Location-verified clock-in + PRD-04 (Design/UX) + PRD-05 (Release/Compliance)

**Date:** 2026-08-12 · **Status:** planned → executing
**Requested by:** Amol — "complete 04 and 05 of the mobile PRDs, and include geotagged clock-in"
**Constraint:** no fresh iPhone available → sequence device-independent work first; every
native addition must degrade gracefully so the *existing* dev build keeps working.

---

## 0. Naming decision

"Geotagged clock-in" describes the mechanism, not the promise. The admin-facing name is:

> **Location-verified clock-in**

…because what the owner is buying is *verification* (did this person punch from the office or
not?), and the punch outcome reads as a plain-English verdict:

| Outcome | Chip copy | Stored `geo_status` |
|---|---|---|
| Inside an office geofence | **At Head Office** | `office` |
| Outside every geofence, place resolved | **Remote · Andheri East, Mumbai** | `remote` |
| Coords captured, reverse-geocode failed | **Remote · location unavailable** | `remote` |
| No coords (permission denied, optional mode) | *(no chip)* | `null` |

Internal settings key: `organizations.settings.attendance.location_punch`.
Never "tracking" in user-facing copy — this is a **single point-in-time tag at punch**, not
continuous tracking (DPDP posture + Apple review; JambaGeo is the tracking product).

---

## 1. Feature design — Location-verified clock-in

### 1.1 Principles (locked)

1. **The server is authoritative.** The client sends `lat/lng/accuracyM` only. Office-vs-remote
   and the place label are resolved server-side. A client can never *claim* "I'm at the office".
2. **A punch is never lost to location.** Geocoding, geofence resolution and permission are all
   best-effort in `optional` mode. Failures degrade to `geo_status = null`, punch still records.
   (Mirrors the audit-write swallow, gotcha #52.)
3. **Off by default, per-org.** Whole feature dark unless an admin enables it — same shape as
   the late-punch policy.
4. **Reuses the punch-event stream.** No new write path: coords ride the existing
   `attendance_punch_events` insert (columns `lat`/`lng` already exist from migration 102).
5. **Zone filtering stays bypassed for mobile** (02A decision 3). Location-verification is a
   *label*, not an exclusion — a remote punch still counts as attendance. Deciding what to *do*
   about remote punches is the admin's job (they can see it), not the system's.

### 1.2 Data model — migration `107_location_verified_punch.sql`

**`locations`** (the existing office-sites table from 076, currently address-only) gains the
geofence:
```sql
lat               double precision NULL
lng               double precision NULL
geofence_radius_m integer NULL         -- per-site override; falls back to org default
```
A location with `lat`+`lng` becomes an office geofence. This is the right home: `locations`
already anchors biometric devices and attendance zones, so an office is one row that serves
devices *and* mobile geofencing.

**`attendance_punch_events`** gains the resolved verdict:
```sql
accuracy_m          double precision NULL   -- GPS accuracy the device reported
geo_status          text NULL CHECK (geo_status IN ('office','remote'))
matched_location_id uuid NULL REFERENCES locations(id) ON DELETE SET NULL
geo_label           text NULL               -- "Andheri East, Mumbai" / office name
```
`geo_status` is nullable = "not evaluated" (feature off, no coords, or resolution failed).
Index: `idx_punch_events_geo_status (org_id, geo_status) WHERE geo_status IS NOT NULL`.

No `attendance_records` rollup column in v1 — the day detail reads punch events, which already
carry everything. (Adding a rollup column means touching `recomputeAttendanceDay`, which is
shared with the live ADMS surface. Not worth the blast radius for a label.)

### 1.3 Org settings shape

`organizations.settings.attendance.location_punch`:
```ts
{
  enabled: boolean;            // master switch, default false
  mode: 'optional' | 'required';
  default_radius_m: number;    // 1..5000, default 200
}
```
- `optional` — ask for permission; if denied or unavailable, punch proceeds untagged.
- `required` — punch is **blocked** without coords (server returns 400 `location_required`).
  Deliberately a separate mode, not the default: a hard block on a GPS failure is a
  can't-clock-in incident, and that must be an explicit admin choice.

### 1.4 Pure logic — `packages/shared/src/attendance/geo-punch.ts`

Shared (web will want it later), pure, fully unit-tested:
```ts
haversineMeters(a: LatLng, b: LatLng): number
resolveGeoMatch(point, sites, opts) → { status, matchedSiteId, distanceM } | null
```
- Nearest matching site wins when geofences overlap.
- **Accuracy tolerance**: inside if `distance <= radius + min(accuracyM ?? 0, 100)`. A phone
  reporting ±80m at 220m from a 200m fence is given the benefit of the doubt; a garbage
  ±2000m fix is capped so it can't swallow the whole city.
- Returns `null` when there are no geofenced sites → status stays `null` (nothing to verify
  against; do NOT label everyone "remote" just because the admin hasn't drawn a fence yet).

### 1.5 Reverse geocoding — `apps/web/src/lib/geo/reverse-geocode.ts`

Mapbox Geocoding v5 reverse (`{lng},{lat}.json`), mirroring the existing `geocodeAddress`
idioms exactly (same token, 5s `AbortSignal.timeout`, null on every failure path):
```ts
reverseGeocode(lat, lng) → { locality, city, placeName } | null
```
`types=neighborhood,locality,place`. Label = `locality, city` when both resolve, else
`placeName`, else null. Only called when `geo_status === 'remote'` — an office match already
has a better label (the site's own name), which also keeps Mapbox calls proportional to
*exceptions*, not to every punch.

### 1.6 BFF changes

**`POST /api/mobile/attendance/punch`**
- Body gains `accuracyM?: number | null`. (`lat`/`lng` already in `PunchBodySchema`.)
- After the auth/skew guards, before the insert:
  1. Load `location_punch` settings. Feature off → behave exactly as today (zero new queries).
  2. `mode === 'required'` && no coords → **400 `location_required`**, nothing written.
  3. Coords present → load org geofenced sites → `resolveGeoMatch` →
     `office` (label = site name) or `remote` (label ← `reverseGeocode`, best-effort).
  4. Whole resolution wrapped so any throw ⇒ `geo_status = null` and the punch continues.
- Response `today` gains `lastPunchGeo`.

**`GET /api/mobile/home`** — `today.lastPunchGeo` on the same shape, so a cold Home render
shows the tag without re-punching.

**`GET /api/mobile/me`** — gains `attendance: { locationPunch: { enabled, mode } }` so the
client knows whether to ask for permission *before* the user taps Punch.

**`GET /api/mobile/attendance?month=`** — day detail punches gain `geoStatus` + `geoLabel`.

### 1.7 Shared DTO changes (`packages/shared/src/mobile/types.ts`)
```ts
export type MobilePunchGeo = {
  status: 'office' | 'remote';
  label: string | null;      // "Head Office" | "Andheri East, Mumbai"
  siteName: string | null;   // set only when status === 'office'
};
MobileTodayStatus.lastPunchGeo: MobilePunchGeo | null
MobilePunchRequest.accuracyM?: number | null
```

### 1.8 Mobile app

- **Dep**: `expo-location` (native → needs an EAS rebuild). `app.json` plugin with the
  purpose string: *"JambaHR records your location only at the moment you clock in or out, to
  confirm whether you punched from an office site. It does not track you in the background."*
- **`src/lib/use-punch-location.ts`** — `expo-location` loaded through a **feature-detect
  wrapper** (`requireOptional`) so the current dev build (no native module) returns
  `unavailable` instead of crashing. Returns
  `{ mode, ensurePermission(), acquire() }` with a 10s timeout and `Accuracy.Balanced`.
- **Consent sheet** (`location-consent-sheet.tsx`) shown *once* before the first OS prompt —
  DPDP notice copy: what's collected, when, why, that it's not background tracking, and that
  the admin can see it. Decision persisted in MMKV; re-shown if the OS permission is reset.
- **`use-punch.ts`**: when the feature is on, acquire coords before minting the punch. Coords
  are frozen into the queued entry alongside `clientEventId` — so an offline punch replays with
  *the location where it happened*, not where the phone was when it reconnected. This is the
  single most important correctness detail in the feature.
- **`required` mode + denied permission** → surface the copy path ("Your organization requires
  location to clock in — enable it in Settings") and don't enqueue.
- **TodayCard** shows the geo chip under the punch state; **day-detail sheet** shows per-punch
  location rows.

### 1.9 Web admin surface

- **Settings → Attendance → new `LocationPunchCard`**: enable toggle, mode selector, default
  radius, and a list of office sites showing which have coordinates + a "Set location" action
  (address → existing `geocodeAddress`, or paste lat/lng), with per-site radius override.
- Actions in `src/actions/attendance-locations.ts`: `getLocationPunchSettings`,
  `updateLocationPunchSettings`, `setLocationGeofence` — all `isAdmin`-guarded.
- Read-side display of the tag on web (Locations tab / punch review) is **out of scope for
  this pass** — data is stamped and queryable; surfacing it is a small follow-up.

### 1.10 Tests
- `packages/shared` — haversine against known distances, radius/accuracy boundary cases,
  overlapping fences, empty-site-list → null.
- Route tests — feature off (no behavior change), optional+no-coords, required+no-coords → 400,
  office match, remote + geocode success, remote + geocode failure, geo resolution throwing
  (punch must still succeed), offline replay preserving original coords.

---

## 2. PRD-04 — Design System, UX & Performance (close the gaps)

| Gap | Plan |
|---|---|
| **Dark mode** | `userInterfaceStyle: "automatic"`; add a `dark` variant to `mobilePalette` in `@jambahr/config/tokens`; NativeWind `darkMode: 'media'`; sweep components to `dark:` classes. **Needs a device/simulator to verify** — token + config layer lands now, the component sweep is flagged for the device pass. |
| **Haptics** | `expo-haptics` (feature-detected like location) — `Impact.Medium` on punch, `Notification.Success` on approve/submit, `Notification.Error` on rejection. |
| **i18n** | `src/lib/i18n.ts` + `src/locales/en.json`; a `t()` with typed keys and an ESLint-visible convention. Infrastructure + the new geo/consent strings land now; the full string migration is mechanical and tracked as a follow-up rather than half-done across 50 files. |
| **Accessibility** | `accessibilityLabel`/`accessibilityRole`/`accessibilityState` audit on interactive elements; dynamic-type check (no fixed heights on text rows). |
| **Cold start** | A measurable marker (`performance.now()` at module init → first Home paint) logged to Sentry as a transaction, so the <2s budget becomes observable instead of asserted. |

## 3. PRD-05 — Release & Compliance (what is actually codeable)

**Code / config (this pass):**
- `PrivacyInfo.xcprivacy` privacy manifest + third-party SDK audit table.
- `eas.json`: fill `submit.production`, add EAS Update channels + `runtimeVersion` policy.
- **Minimum-supported-version gate**: `GET /api/mobile/config` returning `minVersion` +
  `updateUrl`; mobile blocks with a force-upgrade screen when below. (PRD-05 §6.)
- `CHANGELOG.md` for `apps/mobile`.
- Maestro smoke flow + CI job (runs only on `apps/mobile` changes).
- Demo-tenant seed script (`scripts/seed-mobile-demo.sql`) for App Review.

**Documentation / drafted copy (this pass):**
- `docs/mobile-release/` — App Store review notes (B2B, employer-provisioned accounts,
  subscription bought on web), Privacy Nutrition Label answer sheet, Data Safety mirror,
  DPDP consent notice copy, privacy-policy mobile addendum, account-deletion behavior
  statement, and a founder checklist for everything only Amol can do (App Store Connect
  record, screenshots, listing copy, TestFlight recruitment, Play Console closed test).

**Explicitly NOT possible from here:** creating the App Store Connect record, uploading
builds, screenshots, submitting for review, Play Console registration.

---

## 4. Execution order (device-independence first)

1. Migration 107 + shared pure logic + tests
2. Reverse-geocode lib + BFF punch/home/me/attendance changes + route tests
3. Web admin settings card + actions
4. Mobile: location hook, consent sheet, punch wiring, TodayCard/day-detail chips
5. PRD-05 code + config + docs
6. PRD-04: haptics, i18n scaffold, a11y, cold-start marker, dark-mode token layer
7. Build/lint/test gate; write the device-pass checklist for when a phone is available

## 5. Known device-blocked items (cannot be verified without a rebuild)
- `expo-location` + `expo-haptics` are native → one EAS build before the geo feature can run
  on a phone. Until then the app runs with the feature auto-degraded to "unavailable".
- Dark-mode component sweep and the VoiceOver pass need a screen.
- Push production verification still needs a second, never-dev-built iPhone.
