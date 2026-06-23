# Smartwatch / Health Integration — Implementation Plan

**Phase 1 scope (decided):** Read-only **import**, **Android (Google Health Connect) first**, iOS (Apple HealthKit) later behind the same facade.
**Metrics:** Heart rate (workouts + cardio), Sleep, Body weight + body-fat, Steps + active calories.
**Status:** Plan only — no code written yet. Author: research workflow `wf_025a5b18-bb4` (2026-06-22).

---

## 0. Concept (so the model executing this doesn't get it wrong)

The app does **not** talk to a watch directly. It reads/writes the phone's **health hub**:

- Android → **Google Health Connect** (package `com.google.android.apps.healthdata`; built-in on Android 14+, Play-store app on 13–).
- iOS → **Apple HealthKit** (Phase 2).

Any watch the user owns (Apple Watch, Garmin, Fitbit, Samsung, Wear OS, Whoop…) writes into that hub; we read the hub. **No watchOS/WearOS companion app is in scope** — that is a separate, much larger effort and explicitly excluded.

Read-only means: we **pull** watch/hub data into our PocketBase. We do **not** write our calisthenics workouts back out (that is Phase 3, "two-way").

---

## 1. Stack & libraries

| Concern | Choice |
|---|---|
| Android lib | `react-native-health-connect` (matinzd, v3.5.x) |
| Android Expo plugin | `expo-health-connect` (matinzd, v0.1.x) — patches `AndroidManifest.xml`, sets the permission delegate in `MainActivity` |
| Build props | `expo-build-properties`: `minSdkVersion 26`, `compileSdkVersion 35`, `targetSdkVersion 35` |
| iOS lib (Phase 2) | `@kingstinct/react-native-healthkit` (Nitro) + peer `react-native-nitro-modules` |

Build feasibility is **routine** — the app is already bare-workflow with EAS + many config-plugin native modules (notifee, MapLibre, Sentry, location FGS, `@bacons/apple-targets`, `react-native-android-widget`). Adding a health module is the same pattern. No architectural blocker.

---

## 2. Long-pole items — START THESE DAY ONE (parallel to coding)

These gate the Android **release**, not the build, and have multi-week lead times:

1. **Google Play "Health Connect" Developer Declaration form** (Play Console → App content). Must list every data type read + justification. **~7-day review + 5–7 business-day whitelist propagation. Until approved/propagated, ALL Android app updates are blocked.** Submit before writing much code.
2. **Privacy policy** must add a health-data section: which types are read, that data is **never** used for advertising, retention/deletion. The URL shown in the Health Connect permission rationale screen must **exactly match** the Play Console URL.
3. **Permission rationale Activity** — Health Connect opens our privacy policy from its own permission UI. `expo-health-connect` registers the stub; we must point it at the live policy URL.

> ⚠️ Do **not** send any health data to Sentry / OpenPanel / any analytics. Both Apple and Google reject for this. Scrub it from breadcrumbs.

---

## 3. Workstreams (sequenced)

### WS1 — Native build setup
- `expo install react-native-health-connect expo-health-connect expo-build-properties`
- `apps/mobile/app.json`: add `expo-health-connect` to `plugins`; add `expo-build-properties` with `android.minSdkVersion: 26`, `compileSdkVersion: 35`, `targetSdkVersion: 35`. (Min was 24 → 26 drops <2% of devices; acceptable.)
- `npx expo prebuild --platform android --clean` then **EAS development build** (the app already has a `development` profile with `developmentClient: true`).
- On-device smoke test: `getSdkStatus()` returns `SDK_AVAILABLE`. If `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` → deep-link Play store HC page.
- Device must have a **screen lock** (PIN/biometric) or HC refuses to open — note for testers.

### WS2 — PocketBase schema (additive migrations only — safe, no `field.id` changes)
New collections:
- **`health_samples`** — raw imported samples. Fields: `user` (relation), `source` (select: `health_connect`|`healthkit`|`manual`), `data_type` (text), `value` (number), `unit` (text), `start_time` (date), `end_time` (date), `external_id` (text — HC record id / `clientRecordId`, for dedup), `metadata` (json), `synced_at` (autodate). Owner-locked API rules.
- **`daily_health_cache`** — one row per `user`+`date` for fast dashboard reads. Fields: `user`, `date`, `steps`, `active_calories`, `total_calories`, `resting_hr`, `hrv_ms`, `vo2max`, `sleep_minutes`, `sleep_quality`, `weight_kg`, `body_fat_pct`. Recomputed on each sync (upsert by user+date).

Additive fields on existing collections:
- `sleep_entries`: add `source` (select, default `manual`) + `external_id`.
- `weight_entries`: add `source`, `external_id`, **`body_fat_pct`** (number, nullable — no body-fat field exists anywhere today).
- `sessions`, `cardio_sessions`, `circuit_sessions`: add nullable `hr_avg`, `hr_max`, `calories_actual` (kcal). These let session-detail show real HR/burn matched from the hub. (App-owned rows, so populating derived HR is fine.)

Follow repo migration safety rules (preserve `field.id` on any later type change; up + down tested).

### WS3 — Core facade (`packages/core`)
Mirror the existing analytics/observability facade pattern.
- `packages/core/health/types.ts` — shared TS types: `HealthSample`, `SleepSample`, `WeightSample`, `DailyHealthSummary`, `WorkoutHRWindow`.
- `packages/core/health/bridge.ts` — `HealthBridge` interface: `getStatus()`, `requestPermissions(types)`, `getGranted()`, `readSteps/readActiveCalories/readSleep/readWeight/readBodyFat/readHeartRateSeries/readRestingHR/readHRV/readVO2Max(range)`, `openSettings()`.
- `packages/core/health/bridge.android.ts` — implement via `react-native-health-connect` (`initialize`, `requestPermission`, `readRecords`, `TimeRangeFilter`).
- `packages/core/health/bridge.ios.ts` — Phase-2 stub (returns `unsupported`).
- `packages/core/hooks/useHealthSync.ts` — exposes `{ status, isConnected, lastSyncedAt, connect(), sync(), disconnect() }`; React Query for state; persists `lastSyncedAt` per data type (settings or AsyncStorage).

Permission set (Android `READ_*` only for Phase 1): steps, active+total calories, sleep, weight, body-fat, heart-rate, resting-HR, HRV, VO2max, distance, exercise sessions. Declared in manifest via plugin. Handle **decline-twice = permanently blocked** → route user to HC app settings via `openSettings()`.

### WS4 — Import & mapping logic
- **Steps / active+total calories** → upsert `daily_health_cache` per day.
- **Sleep** (`SleepSessionRecord` w/ stages) → write to `sleep_entries` with `source='health_connect'`. **Skip any date that already has a `manual` entry** (user-entered wins); tag imported rows so UI can show a "from watch" chip. Map bedtime/wake/duration/awakenings; quality left null (HC has no 1–5 quality) or derived from stage ratio.
- **Weight + body-fat** (`WeightRecord`, `BodyFatRecord`) → `weight_entries` (`source` flag, new `body_fat_pct`); skip dates with manual entry.
- **Heart rate**: read `HeartRateRecord` series + `RestingHeartRateRecord` + HRV + VO2max. Daily resting/HRV/VO2max → `daily_health_cache`. Per-session HR → match HR samples to each session's `[started_at, finished_at]` window (cardio/circuit/race) or `completed_at − duration` window (strength) → compute `hr_avg`/`hr_max`, recompute `calories_actual` (replaces the crude MET estimate in `packages/core/lib/calories.ts`). Write back to the session row.
- **Dedup**: store HC `external_id`; query with `TimeRangeFilter.between(lastSyncedAt, now)`; default 30-day history limit (don't request `READ_HEALTH_DATA_HISTORY` in Phase 1).

### WS5 — Sync orchestration
- Trigger on `AppState` → `'active'` (debounced, e.g. once per few minutes) **+ a manual "Sincronizar ahora" button**.
- After PB writes, invalidate the relevant React Query keys (sleep, weight, cardio stats, nutrition, `fetchMonthActivity` in `packages/core/lib/monthActivity.ts`).
- **No background sync in Phase 1.** Document the future path: `READ_HEALTH_DATA_IN_BACKGROUND` + WorkManager periodic task inside a foreground service (Android requires a visible notification; pure silent polling is disallowed).

### WS6 — UI (brutalist-athletic spec-sheet system; Bebas/Mono/DM Sans; no `font-bold` with custom fonts; lime accent; hairlines > cards)
- **Connect screen** — new stacked route reachable from Profile (same pattern as reminders, `apps/mobile/src/app/...`). Explains what's read + why; CTA "Conectar con Health Connect". `getSdkStatus()` gating: unavailable → "Instala Health Connect" (Play deep-link); provider-update → prompt.
- **Settings**: connection toggle + last-synced timestamp; optional per-metric on/off.
- **Surface imported data**:
  - Session detail (`useSessionDetail` / cardio detail): HR badge (avg/max) + real calories when present.
  - Sleep screen: auto-filled entries with a "⌚ watch" source chip.
  - Weight chart: includes scale-synced entries + body-fat line.
  - Nutrition: feed `daily_health_cache.active_calories` into `calculateMacros`/`getRemainingMacros` (`useNutrition.ts`) for **dynamic** TDEE instead of the static activity-level multiplier.
- i18n keys in `es` + `en`.

### WS7 — iOS / HealthKit (Phase 2, later)
Same facade; implement `bridge.ios.ts` with `@kingstinct/react-native-healthkit`. Config-plugin adds `NSHealthShareUsageDescription` + entitlement; install `react-native-nitro-modules` peer; add `PrivacyInfo.xcprivacy`; App Store privacy disclosure. Gate all calls behind `isHealthDataAvailable()` (false on iPad/simulator).

---

## 4. Risks / gotchas (from research)
- HC not installed on Android <14 → must redirect to Play store install page.
- Decline-twice permanently blocks the permission dialog → handle by deep-linking HC settings.
- Device screen-lock required for HC to open.
- 30-day default read window (Phase 1 accepts this).
- Google declaration form blocks updates until approved — **the schedule driver**.
- Never pipe health data to analytics/Sentry.
- `react-native-health-connect` does **not** yet expose the ChangeLogs token API (issue #184) → use `lastSyncedAt` timestamp diffing; this misses deletions (acceptable for Phase 1).

## 5. Verification
- On-device (your Android, HC installed): grant perms → a watch-recorded sleep/workout/weight shows up after sync.
- `tsc` + `expo lint` green. PB migration up + down tested. No health data in Sentry breadcrumbs.

## 6. Effort
Android read-only, all four metric families: ~4–6 days code + the Google form lead time running in parallel. iOS Phase 2: ~3–5 days behind the same facade.
