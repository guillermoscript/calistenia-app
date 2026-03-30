# Cardio GPS Reliability — Design Spec

**Date:** 2026-03-30
**Goal:** Make cardio GPS tracking reliable when the app is backgrounded briefly (30s–3min), so distance is never undercounted.

## Problem

When the user leaves the PWA (locks screen, switches apps, checks a message), the browser suspends JS and the GPS watch stops delivering points. On return, the session is alive but a chunk of distance is missing. Worse, the speed filter (`d/timeDiff > 14 m/s`) silently discards the first point back because the large time gap makes even normal movement look like teleportation.

## Changes

### A. Gap Interpolation (core fix)

**File:** `src/contexts/CardioSessionContext.tsx` — GPS callback (~line 211)

When a new GPS point arrives and `timeDiff > 30s` (gap detected):

1. **Bypass the existing `> 14 m/s` speed filter** for this point pair — the existing real-time speed guard is meaningless across a background gap. The per-activity plausibility check below replaces it for gap segments.
2. Calculate straight-line haversine distance between last point and new point.
3. Validate plausibility: distance must be ≤ `maxSpeedForActivity * timeDiff`.
   - Running: 6 m/s (21.6 km/h)
   - Walking: 3 m/s (10.8 km/h)
   - Cycling: 14 m/s (50.4 km/h) — same as the existing real-time guard, but now explicit per-activity
4. If plausible, add the straight-line distance to `distanceRef` **and push the point to `pointsRef` with `gap: true`**. This is critical: `finish()` recomputes total distance by re-traversing `pointsRef` via `calculateSplitsAndDistance()`, so the gap point must be in the array for the distance to survive into the saved session.
5. If implausible (e.g., user drove somewhere), don't add the point to `pointsRef` and don't add distance — effectively treat the gap as a pause. Push the point without adding distance so GPS tracking continues from the new location.

**Why straight-line, not OSRM?** OSRM is async and would complicate the real-time callback. Straight-line underestimates slightly but is instant and predictable. For gaps < 3 min while running, the error is small (paths are roughly linear over short distances). OSRM snapping already runs post-session for the map display.

### B. Last-Gasp Position Capture (best-effort)

**File:** `src/contexts/CardioSessionContext.tsx` — visibilitychange handler (~line 153)

On `visibilitychange: hidden`, after `persistSnapshot()`:
1. Call `navigator.geolocation.getCurrentPosition()` with `{ enableHighAccuracy: true, timeout: 3000 }`.
2. If a position arrives before the browser suspends JS, push it to `pointsRef` and update distance.
3. Then persist again with the new point included.

**Important caveat:** On iOS Safari and some Android browsers, `getCurrentPosition` called from a `visibilitychange: hidden` handler is frequently cancelled or never resolves because the browser suppresses async activity when hiding. This is a **best-effort optimization**, not a guaranteed fix. It will help in some cases (especially on Android Chrome where background JS survives slightly longer) but the real reliability comes from gap interpolation (Section A).

### C. GPS Health Monitor

**File:** `src/contexts/CardioSessionContext.tsx` — new ref + check in the existing 1-second timer

- Add `lastGpsTimestampRef`, updated every time a GPS point is accepted.
- Inside the existing 1-second `timerRef` interval, add a check: if `Date.now() - lastGpsTimestampRef.current > 15000` and `stateRef.current === 'tracking'` and `document.visibilityState === 'visible'`:
  - Call `clearWatch()` then `watchPosition()` again (restart GPS).
  - Set a transient `gpsReconnecting` flag for UI feedback.
- Reset the flag when a new point arrives.

**Timing note:** This monitor fires on resume, not in real-time. When the app is backgrounded, the 1-second interval is also paused. When the browser un-pauses it, the intervals catch up and the health check triggers. This is sufficient — the purpose is to restart a silently-dead `watchPosition` when the user returns to the app, not to detect stalls while backgrounded.

### D. Save Retry Queue

**File:** `src/contexts/CardioSessionContext.tsx` — `finish()` method (~line 372)

On PocketBase save failure:
1. Store the full `CardioSession` payload in localStorage under key `calistenia_cardio_unsaved` (as a JSON array).
2. On next `CardioSessionProvider` mount (app reopen), check for unsaved sessions.
3. Attempt to save them. On success, remove from queue. On failure, keep for next time.
4. Expose `unsavedCount` in the `CardioSessionContextValue` interface so UI can show a subtle indicator.

Max queue size: 5 sessions (to avoid localStorage bloat). FIFO — oldest dropped if full.

### E. Quality Indicator

**File:** `src/lib/geo.ts` — new function `assessTrackQuality(points: GpsPoint[], totalDistanceKm: number)`

The function receives the points array and total distance. It computes:
- `gapCount`: number of points with `gap === true`
- `gapDistanceKm`: sum of haversine distances for each gap segment (identified by `gap: true` on the second point of the pair). This is derivable from the points array because gap points are stored with their coordinates.
- `pointDensity`: `points.length / totalDistanceKm`

Return a quality object:
```ts
{ grade: 'good' | 'estimated' | 'poor', gapCount: number, gapDistanceKm: number }
```

Grading:
- `good`: no gaps, density > 10 pts/km
- `estimated`: has gaps but < 20% of total distance is interpolated
- `poor`: > 20% interpolated or density < 3 pts/km

**UI usage** (in session results page):
- `estimated`: show "~" before distance, dashed line segments on map for gaps
- `poor`: show warning that tracking had issues

### F. GpsPoint Type Update

**File:** `src/types/index.ts`

Add optional `gap?: boolean` field to `GpsPoint`. Points that are the "re-entry" after a background gap get this flag. Used by:
- `calculateSplitsAndDistance`: gap points are normal points — haversine between previous and gap point gives the interpolated distance. No special logic needed; the distance is already correct because the point is in the array.
- Map rendering: dashed line for gap segments
- Quality assessment: count gap points and sum their segment distances

## Files Changed

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `gap?: boolean` to `GpsPoint` |
| `src/contexts/CardioSessionContext.tsx` | Gap interpolation, last-gasp capture, GPS health monitor, save retry queue, `unsavedCount` in context interface |
| `src/lib/geo.ts` | `assessTrackQuality()` function |
| `src/pages/CardioSessionPage.tsx` | Quality indicator UI, unsaved sessions indicator |
| `src/components/cardio/RouteMap.tsx` | Dashed lines for gap segments |

## What This Does NOT Change

- No native wrapper, no Capacitor, no APK
- No service worker GPS tracking (not possible in web)
- No changes to PocketBase schema (gap flag lives in the JSON gps_points field)
- No changes to core distance calculation algorithms — `calculateSplitsAndDistance` already traverses all points; gap points are just normal points with a flag
- OSRM snapping continues to work post-session as before

## Edge Cases

- **User drives to a new location mid-session**: Gap interpolation rejects implausible distances. The point is still pushed (without adding distance) so tracking can continue from the new location.
- **GPS accuracy degrades after resume**: The existing accuracy > 30m filter still applies before gap detection runs. Gap interpolation only runs if the new point passes accuracy check.
- **Multiple rapid background/foreground cycles**: Each creates a small gap. Last-gasp capture minimizes each one. Health monitor ensures GPS restarts.
- **localStorage full**: Save retry queue fails silently (same as current snapshot behavior).
- **Session with 100% gaps**: Quality = `poor`, user warned. Distance shown as estimate.
- **`getCurrentPosition` never resolves on background**: No harm — the call is fire-and-forget with a 3s timeout. Gap interpolation handles the distance when the user returns.
