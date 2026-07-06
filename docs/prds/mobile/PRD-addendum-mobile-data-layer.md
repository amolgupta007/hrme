# PRD Addendum: Mobile Data Layer & Perceived Performance

**Applies to:** PRD 2 — Staff Self-Service (JambaHR Mobile)
**Status:** Draft — pending approval
**Owner:** Amol
**Context:** The core migration plan (Expo SDK 57, expo-router, NativeWind v4, Clerk sign-in, BFF `/api/mobile/me`) is approved. This addendum adds the data-layer requirements that determine perceived speed: instant cold starts, optimistic interactions, and offline resilience for field staff.

---

## 1. Goals

- App renders meaningful content within ~1s of cold start, even on poor networks.
- Punch in/out and leave apply feel instant (optimistic UI, background sync).
- Field staff on patchy networks (factories, sites, shops) never lose a punch.
- Every screen loads via a single composed BFF call — no client-side request waterfalls.

## 2. Non-Goals

- Full offline-first sync engine (CRDTs, conflict-free replication) — out of scope.
- Web app data-layer changes — this addendum is mobile-only.
- Push notification infrastructure (separate PRD).

---

## 3. Requirements

### 3.1 Query & Cache Layer — TanStack Query + MMKV

- Add `@tanstack/react-query` as the single data-fetching layer for all API calls. No ad-hoc `fetch` in components.
- Persist the query cache to disk with `react-native-mmkv` via `@tanstack/query-persist-client` so cold starts hydrate from last-known data, then revalidate in background (stale-while-revalidate).
- Default `staleTime`: 60s for dashboard/me data; 5min for static reference data (holiday list, policies); 0 for attendance status.
- Cache is keyed per Clerk user + org ID. Sign-out or org switch clears the persisted cache (DPDP hygiene — no cross-user data on shared devices).

**Acceptance:** Kill the app, relaunch in airplane mode → home screen renders last-known attendance status, leave balance, and profile without a spinner.

### 3.2 Optimistic Updates

- Punch in/out: UI flips state immediately on tap; mutation fires in background; on failure, state rolls back with a toast and the punch enters the offline queue (3.3).
- Leave apply: request appears in "Pending" list immediately with a local temp ID; reconciled with server ID on success.
- Use TanStack Query mutation `onMutate`/`onError`/`onSettled` pattern; no custom state machines.

**Acceptance:** On a throttled 3G profile, punch button responds in <100ms visually.

### 3.3 Offline Punch Queue

- Punches made while offline are written to an MMKV-backed queue with device timestamp, GPS coordinates (if JambaGeo enabled), and a client-generated UUID (idempotency key).
- Queue drains automatically on connectivity restore (`@react-native-community/netinfo` listener) and on app foreground.
- Server endpoint accepts the idempotency key and deduplicates — replayed punches never create duplicates.
- Queued punches are visible to the user with a "syncing" badge; failures after 3 retries surface a persistent banner.

**Acceptance:** Punch in airplane mode → toggle connectivity → punch appears in server records exactly once, with original device timestamp.

### 3.4 List & Image Performance

- Replace all `FlatList` usage with `@shopify/flash-list` (attendance history, team lists, payslip list).
- All remote images (avatars, org logos) via `expo-image` with `cachePolicy="disk"`.
- Payslip PDFs downloaded lazily and cached to the document directory; never bundled into list queries.

**Acceptance:** 12-month attendance history (350+ rows) scrolls at 60fps on an iPhone SE-class device.

### 3.5 One Endpoint Per Screen (BFF Discipline)

- Extend the `/api/mobile/me` pattern: each primary screen gets a single composed endpoint returning exactly the shape the screen renders.
  - `/api/mobile/home` — attendance status, today's shift, leave balance summary, pending approvals count.
  - `/api/mobile/attendance?month=` — paired punches, regularization status, summary stats.
  - `/api/mobile/payslips` — list metadata only (PDF fetched on demand).
- Response types live in `@jambahr/shared` as the contract; both server and app import from there.
- No screen may issue more than one request for initial render (pull-to-refresh and pagination excluded).

**Acceptance:** Network inspector shows exactly 1 API call on first render of each core screen.

### 3.6 Region Alignment (Infra)

- Verify Vercel serverless function region is `bom1` (Mumbai) for the mobile BFF routes.
- Confirm Supabase project region is `ap-south-1`.
- If misaligned, migrate before mobile launch — target p50 BFF latency <150ms from Indian networks.

**Acceptance:** p50 latency of `/api/mobile/home` measured from a Pune 4G connection is <150ms.

---

## 4. New Dependencies

| Package | Purpose |
|---|---|
| `@tanstack/react-query` | Data fetching, caching, mutations |
| `@tanstack/react-query-persist-client` | Cache persistence bridge |
| `react-native-mmkv` | Fast synchronous disk storage (cache + offline queue) |
| `@shopify/flash-list` | High-performance lists |
| `expo-image` | Cached image rendering |
| `@react-native-community/netinfo` | Connectivity detection for queue drain |

All are Expo SDK 57 compatible; MMKV and FlashList require a dev build (already planned — not Expo Go dependent for release builds).

## 5. Sequencing

1. Query layer + MMKV persistence (foundation — everything else builds on it)
2. BFF composed endpoints (`/home`, `/attendance`, `/payslips`) + shared types
3. Optimistic punch + leave mutations
4. Offline punch queue + idempotent server handling
5. FlashList/expo-image sweep
6. Region verification (can run in parallel, infra-only)

## 6. Risks

- **MMKV in Expo Go:** MMKV needs native code — spike screens tested in Expo Go must fall back to in-memory cache. Release/dev builds unaffected.
- **Idempotency on server:** requires a unique constraint on the punch idempotency key column — needs a Supabase migration before 3.3 ships.
- **Optimistic rollback UX:** rejected punches (e.g., outside attendance zone) must roll back clearly, not silently — copy needed for the error toast.
