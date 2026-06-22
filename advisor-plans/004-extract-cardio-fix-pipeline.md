# Plan 004: Extract the cardio GPS fix-processing pipeline into a pure, unit-tested core function

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told you
> they maintain the index.
>
> **Drift check (run first)**: from the repo root
> (`/Users/guillermomarin/Documents/ejercicios/calistenia-app`) run:
> `git diff --stat 943f558..HEAD -- apps/mobile/src/contexts/CardioSessionContext.tsx packages/core/lib/geo.ts apps/mobile/src/lib/cardio-tracker.ts packages/core/types/index.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on a
> mismatch (different line numbers OR different logic), treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `943f558`, 2026-06-21

## Why this matters

`processFix` in `CardioSessionContext.tsx` reimplements the entire per-GPS-fix
pipeline inline (Kalman reset on background gaps, sub-3m jitter rejection,
gap-plausibility by per-activity max speed, km-split detection, distance
accumulation, pace/speed) while mutating ~8 React refs and firing
`setState`/haptics/`updateCardioLive` in the same breath. The header comment
says "La lógica de filtrado … es idéntica a la web" (line 8) and the section
comment says "mismo pipeline que la web" (line 229): this math is duplicated
across web and mobile and is **untestable** where it lives (it can only run
inside a rendered React context, and this repo has no React-render test
infra). Extracting the math into a pure function in `@calistenia/core` makes it
unit-testable, pins its exact behavior with characterization tests, and sets up
a later follow-up where web adopts the same function and the duplication dies.
The refactor is behavior-preserving — the tests prove identical output.

## Current state

Files involved:

- `apps/mobile/src/contexts/CardioSessionContext.tsx` — the cardio session
  React context provider. `processFix` (lines 231–317) is the inline pipeline
  to extract; the module-listener `useEffect` (lines 320–325) feeds it batches.
  Constants `MAX_ACCURACY_M = 20` (line 39) and `MIN_POINT_DISTANCE_M = 3`
  (line 40) live at the top.
- `apps/mobile/src/lib/cardio-tracker.ts` — defines the `CardioFix` type
  (lines 10–17) that `processFix` consumes.
- `packages/core/lib/geo.ts` — `kalmanUpdate` (line 19), `haversineDistance`
  (line 39), and the `KalmanState` interface (line 9). **Reuse these; do not
  modify or duplicate them.**
- `packages/core/types/index.ts` — `CardioActivityType` (line 443) and
  `GpsPoint` (line 445).
- `packages/core/lib/cardio-fix.ts` — **the pure function you will create.**
- `packages/core/lib/cardio-fix.test.ts` — **the characterization tests you
  will create.**

### `CardioFix` (the input shape) — `apps/mobile/src/lib/cardio-tracker.ts:10-17`

```ts
export interface CardioFix {
  latitude: number
  longitude: number
  altitude: number | null
  accuracy: number | null
  speed: number | null
  timestamp: number
}
```

### `GpsPoint` and `CardioActivityType` — `packages/core/types/index.ts:443-454`

```ts
export type CardioActivityType = 'running' | 'walking' | 'cycling'

export interface GpsPoint {
  lat: number
  lng: number
  alt?: number
  timestamp: number
  speed?: number
  accuracy?: number
  /** True when this point is the re-entry after a background gap (>30s without GPS) */
  gap?: boolean
}
```

### `KalmanState`, `kalmanUpdate`, `haversineDistance` — `packages/core/lib/geo.ts:9-44`

```ts
export interface KalmanState {
  lat: number
  lng: number
  variance: number // in m²
  timestamp: number
}

// …

export function kalmanUpdate(
  prev: KalmanState | null,
  lat: number,
  lng: number,
  accuracy: number,
  timestamp: number,
): KalmanState {
  // …
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  // …
}
```

### The pipeline to extract — `apps/mobile/src/contexts/CardioSessionContext.tsx:231-317`

This is the EXACT logic the pure function must reproduce. Read it carefully —
every threshold and branch must be preserved.

```ts
  const processFix = useCallback((fix: CardioFix) => {
    if (stateRef.current !== 'tracking') return
    const { latitude, longitude, altitude, speed, accuracy } = fix
    if (accuracy == null) return
    setGpsAccuracy(accuracy)
    if (accuracy > MAX_ACCURACY_M) return

    const pts = pointsRef.current
    const prevPt = pts.length > 0 ? pts[pts.length - 1] : null
    const timeDiff = prevPt ? (fix.timestamp - prevPt.timestamp) / 1000 : 0
    const isGap = prevPt !== null && timeDiff > 30

    // Reset del Kalman en gaps — la varianza predicha sería enorme y sesgaría
    // el suavizado hacia la posición pre-gap.
    if (isGap) kalmanRef.current = null

    const smoothed = kalmanUpdate(kalmanRef.current, latitude, longitude, accuracy, fix.timestamp)
    kalmanRef.current = smoothed

    const point: GpsPoint = {
      lat: smoothed.lat,
      lng: smoothed.lng,
      alt: altitude ?? undefined,
      timestamp: fix.timestamp,
      speed: speed ?? undefined,
      accuracy,
    }

    if (prevPt) {
      const d = haversineDistance(prevPt.lat, prevPt.lng, point.lat, point.lng)

      if (isGap) {
        const maxSpeed: Record<CardioActivityType, number> = {
          running: 6, walking: 3, cycling: 14,
        }
        const limit = maxSpeed[activityTypeRef.current] ?? 6
        const plausible = timeDiff > 0 && (d / timeDiff) <= limit

        point.gap = true
        if (plausible) {
          const newDist = distanceRef.current + d / 1000
          distanceRef.current = newDist
          setDistance(newDist)
        }
      } else {
        // Filtro de jitter — parado, el GPS rebota dentro del radio de accuracy
        if (d < MIN_POINT_DISTANCE_M) return
        if (timeDiff > 0 && d / timeDiff > 14) return

        const newDist = distanceRef.current + d / 1000
        distanceRef.current = newDist
        setDistance(newDist)
      }

      const currentKm = Math.floor(distanceRef.current)
      if (currentKm > lastSplitKmRef.current) {
        lastSplitKmRef.current = currentKm
        lastSplitTimeRef.current = point.timestamp
        // Km completado — vibración estilo Strava (el teléfono suele ir en el
        // bolsillo/brazalete: la háptica es el único feedback que llega)
        void haptics.success()
      }
      const splitKm = currentKm + 1
      const splitStartTime = lastSplitTimeRef.current || startTimeRef.current
      const splitElapsed = Math.floor((point.timestamp - splitStartTime) / 1000)
      setCurrentSplit({ km: splitKm, elapsed: splitElapsed })
    }

    pts.push(point)
    setPointsCount(pts.length)
    lastGpsTimestampRef.current = Date.now()

    let paceMinKm = 0
    let speedKmh = 0
    if (speed != null && speed > 0.5) {
      paceMinKm = 1000 / 60 / speed
      speedKmh = Math.round(speed * 3.6 * 10) / 10
      setCurrentPace(paceMinKm)
      setCurrentSpeed(speedKmh)
      if (speedKmh > maxSpeedRef.current) {
        maxSpeedRef.current = speedKmh
      }
    }

    // Notificación en vivo: distancia + ritmo (throttled dentro del módulo)
    updateCardioLive({ distanceKm: distanceRef.current, paceMinKm, speedKmh })
  }, [])
```

### The module listener that feeds it — `apps/mobile/src/contexts/CardioSessionContext.tsx:320-325`

This stays **unchanged** — do not touch it.

```ts
  // Listener de módulo registrado una sola vez — procesa lotes del FGS/watch
  useEffect(() => {
    setCardioFixListener((fixes) => {
      for (const f of fixes) processFix(f)
    })
    return () => setCardioFixListener(null)
  }, [processFix])
```

### Behaviors that MUST stay identical (the contract the tests pin)

Read this list against the excerpt above and confirm each one:

1. **Guard**: if `accuracy == null` → ignore the fix entirely (no point, no
   state change, and `setGpsAccuracy` is NOT called — the null guard precedes
   it). If `accuracy > MAX_ACCURACY_M (20)` → ignore the fix (but
   `setGpsAccuracy` WAS already called with the value — see note in Step 3).
2. **First fix** (no previous point): no distance math, no split; the smoothed
   point is appended; pace/speed computed only if `speed > 0.5`.
3. **Gap detection**: a gap is `prevPt !== null && timeDiff > 30` (seconds).
   On a gap, the Kalman state resets to `null` BEFORE `kalmanUpdate`, and the
   produced point has `gap = true`.
4. **Gap plausibility**: on a gap, the point is ALWAYS appended (there is no
   `return` on the gap branch); distance is added only if
   `timeDiff > 0 && (d / timeDiff) <= limit`, where `limit` is the per-activity
   max speed in m/s: `running: 6, walking: 3, cycling: 14` (default `6` if the
   activity type is somehow unknown). `d` is meters; `d / 1000` is km added.
   When implausible, distance is withheld but the point (with `gap = true`) and
   the split are still produced.
5. **Jitter filter** (non-gap): reject the fix (return, append NOTHING, produce
   no split) if `d < MIN_POINT_DISTANCE_M (3)` OR if
   `timeDiff > 0 && d / timeDiff > 14` (14 m/s cap). Otherwise add `d / 1000` km.
6. **Km split**: `currentKm = Math.floor(distance)`. When
   `currentKm > lastSplitKm`, advance `lastSplitKm = currentKm`,
   `lastSplitTime = point.timestamp`, and fire haptics. `splitKm = currentKm + 1`;
   `splitStartTime = lastSplitTime || startTime`;
   `splitElapsed = Math.floor((point.timestamp - splitStartTime) / 1000)`.
7. **Pace/speed**: only when `speed != null && speed > 0.5`:
   `paceMinKm = 1000 / 60 / speed`,
   `speedKmh = Math.round(speed * 3.6 * 10) / 10`, and `maxSpeed` advances if
   `speedKmh > maxSpeed`. Otherwise pace and speed are reported as `0`.

### Repo conventions to match

- Comments and any human-readable strings are in **Spanish**. Match the
  surrounding language in `cardio-fix.ts` (the function has no user-facing
  strings; keep comments Spanish to match `CardioSessionContext.tsx`).
- Core test files use `import { describe, it, expect } from 'vitest'` and
  import the unit under test by **relative path**, e.g.
  `import { matchUserToPrograms } from './matchPrograms'` and
  `import type { ProgramMeta } from '../types'`
  (`packages/core/lib/matchPrograms.test.ts:1-3`). **Do NOT import from
  `'@calistenia/core/types'` in the core test** — there is no `exports` map in
  `packages/core/package.json` (verified), so that specifier will not resolve
  under the test runner. Use relative imports (`../types`, `./geo`).
- Structural exemplars to mirror for the test:
  `packages/core/lib/matchPrograms.test.ts` and
  `packages/core/lib/exerciseTiming.test.ts` (both `describe`/`it`/`expect`,
  pure-function-in / value-out, no mocks, no React).
- `@calistenia/core` must stay free of DOM/React-Native deps — `cardio-fix.ts`
  imports ONLY from `./geo` and `../types`. No imports from `apps/mobile`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | (from repo root) `pnpm install` | exit 0 |
| Mobile typecheck | `cd apps/mobile && npm run typecheck` | exit 0 (runs `tsc --noEmit`; verified clean on `943f558`) |
| Mobile tests | `cd apps/mobile && npm run test` | `vitest run`, all pass (mobile `src/` tests only — does NOT include core tests; see note) |
| Mobile lint | `cd apps/mobile && npm run lint` | exit 0 |
| **Core tests (verified)** | `cd apps/mobile && ./node_modules/.bin/vitest run ../../packages/core/lib/cardio-fix.test.ts --root ../..` | `Test Files … passed`, exit 0 |

**Core test runner note (verified during recon)**: `vitest` is a devDependency
of `apps/mobile` ONLY — it is not installed at the repo root nor in
`packages/core` (verified: `packages/core/package.json` has no `vitest` and no
`test` script). `cd apps/mobile && npm run test` runs `vitest run` with cwd
`apps/mobile`, which discovers ONLY `apps/mobile/src/**/*.test.ts` and will NOT
pick up `packages/core/lib/*.test.ts`. To run the new core test you MUST invoke
the mobile vitest binary against the core path with the repo root as `--root`,
as in the table's last row. This exact command form was run during recon and
exited 0 against an existing core test. (The existing core tests at
`packages/core/lib/*.test.ts` are run via this same mechanism.)

**On the expected output**: the trailing path arg behaves as a **substring
filter** against test files discovered under `--root`. In a clean checkout it
matches exactly your new `cardio-fix.test.ts`. NOTE: if your checkout happens to
contain other copies of the repo nested inside it (e.g. git worktrees under
`.claude/worktrees/`), the same relative path can match in each copy and the
reported "Test Files N passed" count will be > 1 — that is expected and not a
failure. The load-bearing signal is **exit 0 and all matched tests passed**, not
the file count.

## Scope

**In scope** (the only files you may create/modify):

- `packages/core/lib/cardio-fix.ts` — **create**: the pure pipeline function.
- `packages/core/lib/cardio-fix.test.ts` — **create**: characterization tests.
- `apps/mobile/src/contexts/CardioSessionContext.tsx` — **modify**: rewire
  `processFix` (lines 231–317) ONLY to call the new core function. Add the
  import. Leave everything else untouched.

**Out of scope** (do NOT touch, even though they look related):

- `packages/core/lib/geo.ts` — reuse `kalmanUpdate` / `haversineDistance` /
  `KalmanState`; do not modify or duplicate them.
- The web copy of this pipeline (`apps/web/…`) — **deferred follow-up**. Web
  should later adopt this same core function, but NOT in this plan.
- The rest of `CardioSessionContext.tsx`: `start`/`pause`/`resume`/`finish`/
  `discard`, persistence (`saveToStorage`/`loadFromStorage`/snapshot), the
  unsaved queue, the timer, and the module-listener `useEffect` (lines
  320–325). Leave them byte-for-byte unchanged.
- `apps/mobile/src/lib/cardio-tracker.ts` — read `CardioFix` from here; do not
  change it.
- `packages/core/types/index.ts` — read `GpsPoint`/`CardioActivityType`; do not
  change it.

## Git workflow

- Branch: `advisor/004-cardio-fix-pure-pipeline` (create from `main`).
- Commit per logical unit; Conventional Commits with scope, matching the repo
  (e.g. recent log: `feat(mobile): …`, `fix(cardio): …`,
  `refactor(mobile): …`). Suggested commits:
  - `feat(core): extract pure cardio GPS fix pipeline (cardio-fix.ts)`
  - `test(core): characterize cardio-fix pipeline behavior`
  - `refactor(mobile): drive CardioSessionContext.processFix via core pipeline`
- Use **explicit file paths** in `git add` — NEVER `git add -A` / `git add .`:
  - `git add packages/core/lib/cardio-fix.ts packages/core/lib/cardio-fix.test.ts apps/mobile/src/contexts/CardioSessionContext.tsx`
- Do NOT push, merge, rebase, or open a PR unless the operator instructs it.

## Steps

Order matters: the codebase typechecks after every step. Step 1 adds new code
(unreferenced, so nothing breaks). Step 2 tests it. Step 3 switches the caller.

### Step 1: Create the pure function `packages/core/lib/cardio-fix.ts`

Create a NEW file. It exports a single pure function `processCardioFix` plus the
state/result types. NO React, NO `setState`, NO haptics, NO `updateCardioLive`,
NO imports from `apps/mobile`. Import `kalmanUpdate` / `haversineDistance` /
`KalmanState` from `./geo` and `GpsPoint` / `CardioActivityType` from
`../types`. Reproduce the contract in "Behaviors that MUST stay identical"
EXACTLY — same constants, same branch order, same arithmetic.

Use this exact shape (constants are duplicated here intentionally so the core
module is self-contained — the mobile file keeps its own copies for now):

```ts
import { kalmanUpdate, haversineDistance, type KalmanState } from './geo'
import type { GpsPoint, CardioActivityType } from '../types'

// ── Precision tuning (idéntico a la web y al CardioSessionContext) ──────────
export const MAX_ACCURACY_M = 20
export const MIN_POINT_DISTANCE_M = 3
const GAP_THRESHOLD_S = 30
const JITTER_MAX_SPEED_MPS = 14
const MIN_SPEED_FOR_PACE_MPS = 0.5
const DEFAULT_MAX_SPEED_MPS = 6

// Velocidad máxima plausible (m/s) por actividad, para validar reentradas tras
// un gap de GPS en background.
const MAX_SPEED_BY_ACTIVITY: Record<CardioActivityType, number> = {
  running: 6,
  walking: 3,
  cycling: 14,
}

/** Estado mutable mínimo que el pipeline necesita entre fixes. */
export interface CardioFixState {
  /** Último punto aceptado (para distancia/jitter/gap). null al inicio. */
  lastPoint: GpsPoint | null
  /** Estado del filtro de Kalman; null fuerza reinicio. */
  kalman: KalmanState | null
  /** Distancia acumulada en km. */
  distanceKm: number
  /** Último km cuyo split ya se cerró. */
  lastSplitKm: number
  /** Timestamp (ms) en que empezó el split en curso. */
  lastSplitTime: number
  /** Timestamp (ms) de inicio de la sesión (fallback de split). */
  startTime: number
  /** Velocidad máxima registrada (km/h). */
  maxSpeedKmh: number
}

/** Fix de GPS de entrada (misma forma que CardioFix de cardio-tracker). */
export interface CardioFixInput {
  latitude: number
  longitude: number
  altitude: number | null
  accuracy: number | null
  speed: number | null
  timestamp: number
}

export interface CardioFixResult {
  /** Nuevo estado a aplicar (siempre presente, salvo fixes ignorados). */
  nextState: CardioFixState
  /** El punto suavizado a añadir, o null si el fix se rechazó. */
  point: GpsPoint | null
  /** El fix produjo un punto válido que debe añadirse a la traza. */
  accepted: boolean
  /** Accuracy del fix (para que el caller actualice su indicador de GPS). */
  accuracy: number | null
  /** Distancia acumulada tras este fix (km). */
  distanceKm: number
  /** Split en curso, o null cuando no hay punto previo. */
  split: { km: number; elapsed: number } | null
  /** Se cruzó un km nuevo: el caller debe disparar la háptica. */
  splitCompleted: boolean
  /** Ritmo actual (min/km); 0 si speed insuficiente. */
  paceMinKm: number
  /** Velocidad actual (km/h); 0 si speed insuficiente. */
  speedKmh: number
}

/**
 * Pipeline puro por-fix (mismo que el CardioSessionContext de mobile y la web):
 * reinicio de Kalman en gaps, filtro de jitter, plausibilidad por velocidad
 * máxima de actividad, detección de splits de km y acumulación de distancia.
 * Sin React, sin efectos: el caller aplica nextState y dispara setState/háptica
 * a partir de los flags devueltos.
 *
 * Devuelve `accepted: false` y `point: null` cuando el fix se ignora/rechaza;
 * en ese caso `nextState` puede igualar el estado de entrada (no se añade nada).
 */
export function processCardioFix(
  state: CardioFixState,
  fix: CardioFixInput,
  activityType: CardioActivityType,
): CardioFixResult {
  const rejected = (next: CardioFixState): CardioFixResult => ({
    nextState: next,
    point: null,
    accepted: false,
    accuracy: fix.accuracy,
    distanceKm: next.distanceKm,
    split: null,
    splitCompleted: false,
    paceMinKm: 0,
    speedKmh: 0,
  })

  const { latitude, longitude, altitude, speed, accuracy } = fix

  // Sin accuracy no se puede confiar en el fix.
  if (accuracy == null) return rejected(state)
  // Fix demasiado impreciso. (El caller ya puede mostrar accuracy desde el
  // resultado: rejected() la propaga.)
  if (accuracy > MAX_ACCURACY_M) return rejected(state)

  const prevPt = state.lastPoint
  const timeDiff = prevPt ? (fix.timestamp - prevPt.timestamp) / 1000 : 0
  const isGap = prevPt !== null && timeDiff > GAP_THRESHOLD_S

  // Reset del Kalman en gaps — la varianza predicha sería enorme y sesgaría el
  // suavizado hacia la posición pre-gap.
  const kalmanIn = isGap ? null : state.kalman
  const smoothed = kalmanUpdate(kalmanIn, latitude, longitude, accuracy, fix.timestamp)

  const point: GpsPoint = {
    lat: smoothed.lat,
    lng: smoothed.lng,
    alt: altitude ?? undefined,
    timestamp: fix.timestamp,
    speed: speed ?? undefined,
    accuracy,
  }

  let distanceKm = state.distanceKm
  let lastSplitKm = state.lastSplitKm
  let lastSplitTime = state.lastSplitTime
  let split: { km: number; elapsed: number } | null = null
  let splitCompleted = false

  if (prevPt) {
    const d = haversineDistance(prevPt.lat, prevPt.lng, point.lat, point.lng)

    if (isGap) {
      const limit = MAX_SPEED_BY_ACTIVITY[activityType] ?? DEFAULT_MAX_SPEED_MPS
      const plausible = timeDiff > 0 && d / timeDiff <= limit
      point.gap = true
      if (plausible) distanceKm = state.distanceKm + d / 1000
    } else {
      // Filtro de jitter — parado, el GPS rebota dentro del radio de accuracy.
      // El fix se rechaza: NO se añade el punto y el Kalman NO avanza.
      if (d < MIN_POINT_DISTANCE_M) return rejected(state)
      if (timeDiff > 0 && d / timeDiff > JITTER_MAX_SPEED_MPS) return rejected(state)
      distanceKm = state.distanceKm + d / 1000
    }

    const currentKm = Math.floor(distanceKm)
    if (currentKm > lastSplitKm) {
      lastSplitKm = currentKm
      lastSplitTime = point.timestamp
      splitCompleted = true
    }
    const splitKm = currentKm + 1
    const splitStartTime = lastSplitTime || state.startTime
    const splitElapsed = Math.floor((point.timestamp - splitStartTime) / 1000)
    split = { km: splitKm, elapsed: splitElapsed }
  }

  let paceMinKm = 0
  let speedKmh = 0
  let maxSpeedKmh = state.maxSpeedKmh
  if (speed != null && speed > MIN_SPEED_FOR_PACE_MPS) {
    paceMinKm = 1000 / 60 / speed
    speedKmh = Math.round(speed * 3.6 * 10) / 10
    if (speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh
  }

  const nextState: CardioFixState = {
    lastPoint: point,
    kalman: smoothed,
    distanceKm,
    lastSplitKm,
    lastSplitTime,
    startTime: state.startTime,
    maxSpeedKmh,
  }

  return {
    nextState,
    point,
    accepted: true,
    accuracy,
    distanceKm,
    split,
    splitCompleted,
    paceMinKm,
    speedKmh,
  }
}
```

Notes on faithfulness (verify against the excerpt):
- In the original, a jitter-rejected fix `return`s BEFORE `kalmanRef.current` is
  read again — but `kalmanRef.current = smoothed` already ran (line 248), so the
  ORIGINAL advances the Kalman even on a jitter reject. **However**, the
  original also does NOT append the point and does NOT advance `lastPoint`, so
  the next fix re-smooths from the same `prevPt`. To keep distance/splits
  identical (the load-bearing outputs), the pure function rejects with the
  unchanged input state. The only observable difference is the internal Kalman
  variance carried into the NEXT accepted fix; this is a micro-divergence in
  smoothing, not in accepted distance. If you want byte-identical Kalman
  carry-over, that is a STOP-and-ask item — but the characterization tests in
  Step 2 assert on accepted points / distance / splits, which are unaffected.
  Document this in your commit body. **Do not** change thresholds to "fix" it.
- The original calls `setGpsAccuracy(accuracy)` even for `accuracy > MAX_ACCURACY_M`
  (line 235 runs before the line-236 guard). It does NOT call it when
  `accuracy == null` (line 234 returns first). The pure function returns
  `accuracy` (which is `null` in the null case, the numeric value otherwise) on
  the rejected result; Step 3 only calls `setGpsAccuracy` when that value is
  non-null, exactly reproducing both behaviors.

**Verify**: from repo root run
`cd apps/mobile && npm run typecheck` → exit 0, no errors.
(The new core file is typechecked transitively through the mobile project once
Step 3 imports it; at this point it is not yet imported, so this verify only
confirms you did not break the existing build. A dedicated typecheck of the
core file happens implicitly when the test runs in Step 2.)

### Step 2: Create characterization tests `packages/core/lib/cardio-fix.test.ts`

Create a NEW test file mirroring `packages/core/lib/matchPrograms.test.ts`
structure. Import `processCardioFix` and the types by RELATIVE path. Build a
small helper to make a default state and a default fix. Cover these cases (the
five required by this plan plus the first-fix happy path):

- **(happy) first fix accepted**: from a fresh state (`lastPoint: null`), a fix
  with `accuracy <= 20` → `accepted === true`, `point !== null`,
  `distanceKm === 0` (no previous point), `split === null`.
- **(b) sub-3m jitter rejected**: a first accepted fix, then a second fix
  ~1–2 m away within a few seconds → `accepted === false`, `point === null`,
  `distanceKm` unchanged from the first.
- **(c) >30s gap resets kalman + plausibility**: after a first fix, a second fix
  with `timestamp` 31+ s later.
  - *accept variant*: distance/time within the activity's max speed (e.g.
    `running` limit 6 m/s) → `accepted === true`, `point.gap === true`,
    `distanceKm` increased.
  - *reject-distance variant*: a gap fix implying speed above the limit (e.g.
    a teleport across many km in 31 s for `running`) → still `accepted === true`
    and `point.gap === true`, but `distanceKm` UNCHANGED (gap distance not
    added because implausible). (Note: gap fixes are appended even when
    implausible — only the distance is withheld. Assert `distanceKm` equals the
    pre-gap value.)
- **(d) km boundary crossing sets splitCompleted**: drive the state so a fix
  pushes `Math.floor(distanceKm)` from 0 to 1 → `splitCompleted === true` and
  `split.km === 2`. (Easiest: set `state.distanceKm` near `1` and feed a fix a
  few meters past a previous point so the new floor is 1. Pick coordinates a
  known small haversine distance apart, or pre-seed `distanceKm` to `0.9995`
  and add a ~1 m–producing step; if exact geo math is fiddly, instead pre-seed
  `state.distanceKm = 1.0005` with `lastSplitKm = 0` and feed any accepted
  non-jitter fix ≥ 3 m so distance ticks and `Math.floor` reads `1 > 0`.)
- **(e) accuracy > 20 rejected**: a fix with `accuracy = 25` →
  `accepted === false`, `point === null`, `nextState.distanceKm` unchanged, and
  `result.accuracy === 25` (so the caller can still show it).
- **(extra) accuracy == null rejected**: `accepted === false`, `point === null`,
  `result.accuracy === null`.

Skeleton to follow (fill in real coordinates/timestamps so assertions hold):

```ts
import { describe, it, expect } from 'vitest'
import { processCardioFix, type CardioFixState, type CardioFixInput } from './cardio-fix'

const t0 = 1_770_000_000_000 // epoch ms base

const freshState = (over: Partial<CardioFixState> = {}): CardioFixState => ({
  lastPoint: null,
  kalman: null,
  distanceKm: 0,
  lastSplitKm: 0,
  lastSplitTime: 0,
  startTime: t0,
  maxSpeedKmh: 0,
  ...over,
})

const fix = (over: Partial<CardioFixInput> = {}): CardioFixInput => ({
  latitude: 40.0,
  longitude: -3.0,
  altitude: 700,
  accuracy: 5,
  speed: 3,
  timestamp: t0,
  ...over,
})

describe('processCardioFix', () => {
  it('primer fix: aceptado, sin distancia ni split', () => {
    const r = processCardioFix(freshState(), fix(), 'running')
    expect(r.accepted).toBe(true)
    expect(r.point).not.toBeNull()
    expect(r.distanceKm).toBe(0)
    expect(r.split).toBeNull()
  })

  // … resto de casos (b)–(e) + null …
})
```

Practical coordinate tip: `haversineDistance` returns meters. At ~40° lat,
0.00001° of longitude ≈ 0.85 m and 0.00001° of latitude ≈ 1.11 m. To produce a
clean > 3 m non-jitter step, change latitude by `0.00005` (~5.5 m). To produce a
sub-3 m jitter, change latitude by `0.00001` (~1.1 m). Note the Kalman smoother
attenuates the raw delta on the second fix, so leave headroom (use clearly-above
and clearly-below deltas, not borderline ones). If an assertion is off, log the
actual `r.distanceKm` and adjust the coordinate delta — do NOT change the
function.

**Verify**: from repo root run
`cd apps/mobile && ./node_modules/.bin/vitest run ../../packages/core/lib/cardio-fix.test.ts --root ../..`
→ exit 0, all matched tests pass. (In a clean checkout this runs only your new
`cardio-fix.test.ts`; if your checkout nests other repo copies under
`.claude/worktrees/`, the count may be higher — the pass/exit-0 is what matters.)

### Step 3: Rewire `CardioSessionContext.processFix` to call the core function

In `apps/mobile/src/contexts/CardioSessionContext.tsx`:

1. Add the import (group it with the other `@calistenia/core/lib` imports near
   lines 15–22):
   ```ts
   import { processCardioFix, type CardioFixState } from '@calistenia/core/lib/cardio-fix'
   ```
   (Match the existing import-by-subpath style — line 15 imports
   `'@calistenia/core/lib/pocketbase'`, lines 17–21 import from
   `'@calistenia/core/lib/geo'`. `@calistenia/core` is a node_modules symlink to
   `packages/core` with no `exports` map, so `@calistenia/core/lib/cardio-fix`
   resolves to `packages/core/lib/cardio-fix.ts` by directory resolution — the
   same mechanism as `…/geo`. If it does NOT typecheck, that is a STOP condition.)

2. Replace the BODY of `processFix` (lines 231–317) so it:
   - keeps the early `if (stateRef.current !== 'tracking') return`;
   - builds a `CardioFixState` from the current refs;
   - calls `processCardioFix(state, fix, activityTypeRef.current)`;
   - calls `setGpsAccuracy(result.accuracy)` when `result.accuracy != null`
     (preserves the original behavior of updating the indicator even for
     too-imprecise fixes, while skipping it for `accuracy == null`);
   - if `!result.accepted`, applies any state the function returned that you
     still want carried (for a rejected fix the state is unchanged, so simply
     `return` after `setGpsAccuracy`);
   - on acceptance: writes `result.nextState` back into the refs, pushes the
     point, updates `pointsCount`, updates `lastGpsTimestampRef`, fires
     `setDistance` / `setCurrentSplit` / `setCurrentPace` / `setCurrentSpeed`
     from the result, fires `haptics.success()` when `result.splitCompleted`,
     and calls `updateCardioLive`.

   Target shape:
   ```ts
   const processFix = useCallback((fix: CardioFix) => {
     if (stateRef.current !== 'tracking') return

     const pts = pointsRef.current
     const state: CardioFixState = {
       lastPoint: pts.length > 0 ? pts[pts.length - 1] : null,
       kalman: kalmanRef.current,
       distanceKm: distanceRef.current,
       lastSplitKm: lastSplitKmRef.current,
       lastSplitTime: lastSplitTimeRef.current,
       startTime: startTimeRef.current,
       maxSpeedKmh: maxSpeedRef.current,
     }

     const result = processCardioFix(state, fix, activityTypeRef.current)

     if (result.accuracy != null) setGpsAccuracy(result.accuracy)
     if (!result.accepted || !result.point) return

     // Aplicar nextState de vuelta a los refs.
     kalmanRef.current = result.nextState.kalman
     distanceRef.current = result.nextState.distanceKm
     lastSplitKmRef.current = result.nextState.lastSplitKm
     lastSplitTimeRef.current = result.nextState.lastSplitTime
     maxSpeedRef.current = result.nextState.maxSpeedKmh

     pts.push(result.point)
     setPointsCount(pts.length)
     lastGpsTimestampRef.current = Date.now()

     setDistance(result.distanceKm)
     if (result.split) setCurrentSplit(result.split)
     if (result.splitCompleted) {
       // Km completado — vibración estilo Strava (el teléfono suele ir en el
       // bolsillo/brazalete: la háptica es el único feedback que llega).
       void haptics.success()
     }
     if (result.speedKmh > 0 || result.paceMinKm > 0) {
       setCurrentPace(result.paceMinKm)
       setCurrentSpeed(result.speedKmh)
     }

     // Notificación en vivo: distancia + ritmo (throttled dentro del módulo).
     updateCardioLive({
       distanceKm: result.distanceKm,
       paceMinKm: result.paceMinKm,
       speedKmh: result.speedKmh,
     })
   }, [])
   ```
   Faithfulness checks vs. the original:
   - Original called `setCurrentPace`/`setCurrentSpeed` ONLY inside the
     `speed > 0.5` branch. The guard `result.speedKmh > 0 || result.paceMinKm > 0`
     reproduces that exactly: both `paceMinKm` and `speedKmh` are `0` precisely
     when `speed <= 0.5` (or null); when `speed > 0.5`, `paceMinKm` is always
     `> 0` (positive speed) and `speedKmh` is always `> 0` (the smallest speed
     above 0.5 rounds to ≥ 1.8 km/h), so the guard is true. Verified equivalent.
   - Original called `updateCardioLive` on EVERY accepted fix with
     `distanceRef.current` and the computed `paceMinKm`/`speedKmh` (0 when speed
     was low). Preserved.
   - Original set `setCurrentSplit` only when `prevPt` existed; here
     `result.split` is `null` exactly when there was no previous point, so the
     `if (result.split)` guard matches.
   - Original advanced `maxSpeedRef` only when `speedKmh > maxSpeedRef.current`;
     the pure function carries the unchanged max otherwise, so writing
     `result.nextState.maxSpeedKmh` unconditionally is equivalent.

3. After the rewire, `kalmanUpdate` and `haversineDistance` are no longer
   referenced in this file (they were used ONLY at the old lines 247 and 260).
   Confirm and clean up:
   `grep -n "kalmanUpdate\|haversineDistance" apps/mobile/src/contexts/CardioSessionContext.tsx`
   — if the ONLY remaining hits are the import line (lines 17–21), remove ONLY
   `kalmanUpdate` and `haversineDistance` from that import. **Keep** `KalmanState`
   (still used by `kalmanRef` at line 187) and keep `calculateElevationGain`,
   `calculateSplitsAndDistance`, `calculateMaxPace`, `calculateMaxSpeed`,
   `calculateAvgSpeed` (still used at lines 460–465).
   The mobile-local constants `MAX_ACCURACY_M` (line 39) and
   `MIN_POINT_DISTANCE_M` (line 40) become unreferenced after the rewire
   (current refs are at lines 236/277, which you are replacing). Run
   `grep -n "MAX_ACCURACY_M\|MIN_POINT_DISTANCE_M" apps/mobile/src/contexts/CardioSessionContext.tsx`.
   If the only remaining hits are the `const` declarations on lines 39–40, then
   `expo lint` may flag them as unused — if lint fails on them, delete lines
   39–40 (and only those two lines). If lint passes, leaving them is fine.

**Verify**:
- `cd apps/mobile && npm run typecheck` → exit 0, no errors.
- `cd apps/mobile && npm run lint` → exit 0.

### Step 4: Full verification sweep

Run all gates from the repo root in order:

1. `cd apps/mobile && npm run typecheck` → exit 0.
2. `cd apps/mobile && ./node_modules/.bin/vitest run ../../packages/core/lib/cardio-fix.test.ts --root ../..` → all matched tests pass, exit 0.
3. `cd apps/mobile && npm run test` → all existing mobile tests pass, exit 0
   (sanity: you did not break the mobile lib tests).
4. `cd apps/mobile && npm run lint` → exit 0.
5. `git status --porcelain` → the three in-scope files
   (`packages/core/lib/cardio-fix.ts`, `packages/core/lib/cardio-fix.test.ts`,
   `apps/mobile/src/contexts/CardioSessionContext.tsx`) appear as added/modified.
   (Any pre-existing untracked files in your checkout — e.g. other advisor-plans
   or scripts — are unrelated; the point is that NO source file outside the
   in-scope three was modified.)

**Verify**: all five commands meet their expected output above.

## Test plan

- **New file**: `packages/core/lib/cardio-fix.test.ts`, modeled structurally on
  `packages/core/lib/matchPrograms.test.ts` (vitest `describe`/`it`/`expect`,
  relative imports, pure-in/value-out, no mocks/React).
- **Cases** (all listed in Step 2): first-fix happy path; sub-3m jitter
  rejected; >30s gap with plausible-accept and implausible-distance-withheld
  variants; km-boundary `splitCompleted`; `accuracy > 20` rejected;
  `accuracy == null` rejected.
- **Run command (verified)**:
  `cd apps/mobile && ./node_modules/.bin/vitest run ../../packages/core/lib/cardio-fix.test.ts --root ../..`
  → all matched tests pass (your new cases).
- The mobile `processFix` is NOT unit-tested (this repo has no React-render
  test infra — see "Why this matters"). Its correctness is covered by the core
  tests on the extracted math plus the mobile typecheck/lint on the rewire.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `packages/core/lib/cardio-fix.ts` exists and exports `processCardioFix`,
      `CardioFixState`, `CardioFixInput`, `CardioFixResult`.
- [ ] `packages/core/lib/cardio-fix.test.ts` exists with ≥ 7 `it(...)` cases
      covering the list above.
- [ ] `cd apps/mobile && ./node_modules/.bin/vitest run ../../packages/core/lib/cardio-fix.test.ts --root ../..` → exit 0, all matched tests pass.
- [ ] `cd apps/mobile && npm run test` → exit 0 (existing mobile tests still pass).
- [ ] `cd apps/mobile && npm run typecheck` → exit 0.
- [ ] `cd apps/mobile && npm run lint` → exit 0.
- [ ] `grep -n "kalmanUpdate(kalmanRef.current" apps/mobile/src/contexts/CardioSessionContext.tsx`
      returns NO matches (the inline pipeline is gone; the context now calls
      `processCardioFix`).
- [ ] `grep -n "processCardioFix" apps/mobile/src/contexts/CardioSessionContext.tsx`
      returns at least one match.
- [ ] `git status --porcelain` shows changes to ONLY the three in-scope files
      among tracked source (plus, if applicable, the `advisor-plans/README.md`
      index row); no other source file is modified.
- [ ] `advisor-plans/README.md` status row for plan 004 updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts do not match the live code (line numbers OR
  logic differ) — i.e. the drift check flagged a change.
- `CardioFix`'s shape in `apps/mobile/src/lib/cardio-tracker.ts:10-17` differs
  from the excerpt above (fields added/removed/retyped) — the
  `CardioFixInput`/mapping assumption is then invalid.
- The core test runner cannot resolve imports: e.g. the test cannot find
  `./cardio-fix` or `../types`, or `import … from '@calistenia/core/lib/cardio-fix'`
  fails to typecheck in the mobile project. Do NOT add an `exports` map to
  `packages/core/package.json` or invent a vitest config to work around it —
  report instead.
- Reproducing the pipeline would require changing ANY threshold or constant
  (`MAX_ACCURACY_M=20`, `MIN_POINT_DISTANCE_M=3`, the 30s gap, per-activity max
  speeds 6/3/14, the 14 m/s jitter cap, the `speed > 0.5` pace gate) to make a
  test pass. The behavior must be preserved exactly; a failing test means the
  test's fixture is wrong, not the function.
- After the rewire, `distance`/`split`/`pointsCount` would compute differently
  for a representative accepted sequence than the original would have. If you
  cannot convince yourself the outputs match, report rather than ship.
- A verification command fails twice after a reasonable fix attempt.
- The fix appears to require touching any out-of-scope file.

## Maintenance notes

For whoever owns this code next:

- **Deferred follow-up (the real payoff)**: the web app
  (`apps/web/…`) still has its own copy of this pipeline. A future plan should
  point web's cardio session logic at `processCardioFix` and delete the
  duplicate, killing the "mismo pipeline que la web" divergence for good. This
  plan intentionally does NOT touch web.
- **Known micro-divergence to scrutinize in review**: on a jitter-rejected fix,
  the original mutated `kalmanRef.current = smoothed` (line 248) before the
  `return`, whereas the pure function discards the smoothed state on rejection.
  This only affects the Kalman variance carried into the next ACCEPTED fix, not
  accepted distance/splits. If exact Kalman carry-over ever matters, revisit
  `processCardioFix`'s `rejected()` branch to optionally return
  `{ ...state, kalman: smoothed }`. The reviewer should confirm this trade-off
  is acceptable (it is, for distance accuracy).
- The mobile-local constants `MAX_ACCURACY_M`/`MIN_POINT_DISTANCE_M` are now
  also exported from `cardio-fix.ts`. If you delete the mobile copies (Step 3.3),
  later code that needs them should import from core to keep a single source of
  truth.
- The module-listener `useEffect` (lines ~320–325) and all persistence/timer
  logic were deliberately untouched — they push `nextState` into refs via
  `processFix`'s callers, so any change to the `CardioFixState` shape must be
  threaded through both `processFix` (build) and `persistSnapshot`/restore
  (which read the same refs).
