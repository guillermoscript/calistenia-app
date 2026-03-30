# Cardio GPS Reliability — Design Spec

**Date:** 2026-03-30
**Goal:** Make cardio GPS tracking reliable when the app is backgrounded briefly (30s–3min), so distance is never undercounted.

## Problem

When the user leaves the PWA (locks screen, switches apps, checks a message), the browser suspends JS and the GPS watch stops delivering points. On return, the session is alive but a chunk of distance is missing. Worse, the speed filter (`d/timeDiff > 14 m/s`) silently discards the first point back because the large time gap makes even normal movement look like teleportation.

## Changes

### A. Gap Interpolation (core fix)

**File:** `src/contexts/CardioSessionContext.tsx` — GPS callback (~line 211)

When a new GPS point arrives and `timeDiff > 30s` (gap detected):

1. Skip the speed filter for this point pair — it's meaningless across a gap.
2. Calculate straight-line haversine distance between last point and new point.
3. Validate plausibility: distance must be ≤ `maxSpeedForActivity * timeDiff`.
   - Running: 6 m/s (21.6 km/h)
   - Walking: 3 m/s (10.8 km/h)
   - Cycling: 14 m/s (50.4 km/h)
4. If plausible, add the straight-line distance to `distanceRef`.
5. Mark the new point with `gap: true` flag so UI can render it differently.
6. If implausible (e.g., user drove somewhere), discard and don't add distance — treat as pause.

**Why straight-line, not OSRM?** OSRM is async and would complicate the real-time callback. Straight-line underestimates slightly but is instant and predictable. For gaps < 3 min while running, the error is small (paths are roughly linear over short distances). OSRM snapping already runs post-session for the map display.

### B. Last-Gasp Position Capture

**File:** `src/contexts/CardioSessionContext.tsx` — visibilitychange handler (~line 153)

On `visibilitychange: hidden`, after `persistSnapshot()`:
1. Call `navigator.geolocation.getCurrentPosition()` with `{ enableHighAccuracy: true, timeout: 3000 }`.
2. If a position arrives, push it to `pointsRef` and update distance.
3. Then persist again with the new point included.

This shrinks the gap from "last watchPosition delivery" to "moment of backgrounding", often reducing it from 3-5s to near-zero.

### C. GPS Health Monitor

**File:** `src/contexts/CardioSessionContext.tsx` — new interval inside `startTracking()`

- Track `lastGpsTimestamp` ref, updated every time a point is accepted.
- Every 10 seconds (via the existing timer or a new one), check: if `Date.now() - lastGpsTimestamp > 15000` and state is `tracking` and page is visible:
  - Call `clearWatch()` then `watchPosition()` again (restart GPS).
  - Set a transient `gpsReconnecting` state for UI feedback.
- Reset the health check when a new point arrives.

This catches the case where `watchPosition` silently dies after backgrounding on some Android browsers.

### D. Save Retry Queue

**File:** `src/contexts/CardioSessionContext.tsx` — `finish()` method (~line 372)

On PocketBase save failure:
1. Store the full `CardioSession` payload in localStorage under key `calistenia_cardio_unsaved`.
2. On next `CardioSessionProvider` mount (app reopen), check for unsaved sessions.
3. Attempt to save them. On success, remove from queue. On failure, keep for next time.
4. Expose `unsavedCount` in context so UI can show a subtle indicator.

Max queue size: 5 sessions (to avoid localStorage bloat). FIFO — oldest dropped if full.

### E. Quality Indicator

**File:** `src/lib/geo.ts` — new function `assessTrackQuality()`

Calculate:
- `gapCount`: number of point pairs with timeDiff > 30s
- `gapDistanceKm`: total interpolated distance
- `pointDensity`: points per km

Return a quality grade:
- `good`: no gaps, density > 10 pts/km
- `estimated`: has gaps but < 20% of total distance is interpolated
- `poor`: > 20% interpolated

**UI usage** (in session results page):
- `estimated`: show "~" before distance, dashed line segments on map for gaps
- `poor`: show warning that tracking had issues

### F. GpsPoint Type Update

**File:** `src/types.ts` (or wherever GpsPoint is defined)

Add optional `gap?: boolean` field to `GpsPoint`. Points that are the "re-entry" after a background gap get this flag. Used by:
- Map rendering: dashed line for gap segments
- Quality assessment: count gaps
- Splits: gaps don't break split logic (distance is already added)

## Files Changed

| File | Change |
|------|--------|
| `src/contexts/CardioSessionContext.tsx` | Gap interpolation, last-gasp capture, GPS health monitor, save retry queue |
| `src/lib/geo.ts` | `assessTrackQuality()` function |
| `src/types.ts` | Add `gap?: boolean` to `GpsPoint` |
| `src/pages/CardioSessionPage.tsx` | Quality indicator UI, gap segments on map |
| `src/components/cardio/RouteMap.tsx` | Dashed lines for gap segments |

## What This Does NOT Change

- No native wrapper, no Capacitor, no APK
- No service worker GPS tracking (not possible in web)
- No changes to PocketBase schema (gap flag lives in the JSON gps_points field)
- No changes to distance calculation algorithms (haversine, splits, pace)
- OSRM snapping continues to work post-session as before

## Edge Cases

- **User drives to a new location mid-session**: Gap interpolation rejects implausible distances, so driving 5km in 2min at "running" speed won't inflate distance.
- **GPS accuracy degrades after resume**: The existing accuracy > 30m filter still applies. Gap interpolation only runs if the new point passes accuracy check.
- **Multiple rapid background/foreground cycles**: Each creates a small gap. Last-gasp capture minimizes each one. Health monitor ensures GPS restarts.
- **localStorage full**: Save retry queue fails silently (same as current snapshot behavior).
- **Session with 100% gaps**: Quality = `poor`, user warned. Distance shown as estimate.
