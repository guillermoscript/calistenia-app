# Plan 007: Move SessionView's RestScreen and ExerciseTimer nested views into their own files under `components/session/`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told you
> they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 943f558..HEAD -- apps/mobile/src/components/SessionView.tsx apps/mobile/src/components/session`
> If `SessionView.tsx` changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding. In
> particular, if the `RestScreen` function (currently lines 84–235), the
> `ExerciseTimer` function (currently lines 261–440), the module-level constants
> `LIME`/`MUTED`/`SCREEN_WIDTH` (lines 69–71), or the `Step` interface
> (lines 51–56) differ from the excerpts here, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: `advisor-plans/006-session-machine-extract.md` (session-machine extraction). Execute 006 first so its pure-logic tests exist as the safety net for this mechanical move.
- **Category**: tech-debt
- **Planned at**: commit `943f558`, 2026-06-21

## Why this matters

`apps/mobile/src/components/SessionView.tsx` is a 1362-line "god component" that
inlines six distinct screen components plus the main controller. Two of those
inlined components are large, self-contained UI widgets: `RestScreen` (the
rest-countdown ring with audio/haptic cues, ±seconds adjust, and notification
scheduling, ~152 lines) and `ExerciseTimer` (the timed-exercise circular ring
with a 3-2-1 "prepárate" pre-countdown, ~180 lines). Pulling them into their own
files under `apps/mobile/src/components/session/` shrinks the controller by
roughly a quarter, makes each widget independently readable and reviewable, and
sets up future work (e.g. plan 001's timer-UI changes) to touch a focused file
instead of the monolith. This is a **pure mechanical move** — no behavior, prop,
or rendering change. The safety net is the TypeScript compiler plus plan 006's
pure-logic tests; there is no React render-test infrastructure in this repo, so
do not add or expect render tests.

## Current state

Single source file in scope to edit: `apps/mobile/src/components/SessionView.tsx`
(the session controller; it defines six components inline). Two new component
files plus two small shared files will be created under
`apps/mobile/src/components/session/` (a directory that does **not yet exist** —
the executor creates it; verified absent at 943f558).

The sibling components live one level up, in `apps/mobile/src/components/`
(e.g. `Confetti.tsx`, `RepeatTrainingButton.tsx`). Because the project uses the
absolute path alias `@/* -> ./src/*` (verified in `apps/mobile/tsconfig.json`,
`compilerOptions.paths`), every `@/...` and `@calistenia/core/...` import string
moves **verbatim** to the new files — being one directory deeper does **not**
change those import strings.

> **Toolchain reality (read this — it changes how you verify):**
> - `tsc --noEmit` (the `typecheck` script) does **NOT** enable `noUnusedLocals`,
>   so leftover unused imports do **NOT** fail typecheck.
> - `expo lint` (the `lint` script) reports lint problems but **exits 0** even
>   with errors present. At 943f558 the baseline is already **196 errors / 47
>   warnings** across the workspace, and `SessionView.tsx` itself has several
>   pre-existing errors (e.g. line 87 "Cannot call impure function during
>   render", line 279 ref-in-render). The `@typescript-eslint/no-unused-vars`
>   rule is configured as a **warning**, not an error.
> - **Consequence**: neither typecheck nor lint's exit code will catch unused
>   imports, and lint exit 0 proves nothing new. To confirm you removed the
>   right imports, you MUST use the explicit per-identifier `grep` checks in
>   Step 4. Do NOT rely on lint output to find unused imports.
> - **Consequence 2**: the pre-existing lint errors inside `RestScreen`/
>   `ExerciseTimer` (e.g. lines 87, 279) are part of the verbatim blocks and will
>   travel with them into the new files. That is expected and is NOT a regression
>   you introduced — do not "fix" them (that would break the pure-move review).

### A. Module-level constants and the `Step` type both moved files depend on

`SessionView.tsx:51-71`:

```tsx
interface Step {
  exercise: Exercise
  setNumber: number
  totalSets: number
  section: 'warmup' | 'main' | 'cooldown'
}

function buildSteps(exercises: Exercise[]): Step[] {
  const steps: Step[] = []
  exercises.forEach(ex => {
    const total = ex.sets === 'múltiples' ? 3 : (parseInt(String(ex.sets)) || 1)
    for (let s = 1; s <= total; s++) {
      steps.push({ exercise: ex, setNumber: s, totalSets: total, section: ex.section || 'main' })
    }
  })
  return steps
}

const LIME = 'hsl(74 90% 45%)'
const MUTED = 'hsl(0 0% 55%)'
const SCREEN_WIDTH = Dimensions.get('window').width
```

(Exact lines: `interface Step` is **51–56**; `buildSteps` is **58–67**; `LIME`
is **69**, `MUTED` is **70**, `SCREEN_WIDTH` is **71**.)

- `RestScreen` uses the `Step` type (via its `RestScreenProps`) and the `LIME` and `MUTED` constants.
- `ExerciseTimer` uses `LIME` (in the `RING.running` literal at `SessionView.tsx:251` and the Play button at `:426`) and `MUTED` (the reset button at `SessionView.tsx:434`).
- `MUTED` is **also** used by the main controller — at the top-bar back/close icons (`:1228`, `:1244`) and the edge nav arrows (`:1306`, `:1311`). So `MUTED` must remain importable by `SessionView.tsx` after the move.
- `LIME` is **also** used by `RestScreen`'s ring (`:198`) — but inside the controller (outside the two moved components) `LIME` is not referenced; still, extracting it to a shared file keeps a single source of truth and `SessionView.tsx` will simply import it.
- `SCREEN_WIDTH` is used by the controller's swipe gesture (`SessionView.tsx:1089,1090,1095,1096`) and is **NOT** needed by either moved component — leave it in `SessionView.tsx`.
- `buildSteps` is used only by the controller (`SessionView.tsx:968`) — leave it in `SessionView.tsx`.

**Decision**: create `apps/mobile/src/components/session/constants.ts` exporting
`LIME` and `MUTED`, and `apps/mobile/src/components/session/types.ts` exporting
the `Step` interface. Both `SessionView.tsx` and the two new component files
import from those shared spots. This avoids duplicating constants and keeps a
single source of truth. (See Step 1.)

### B. `RestScreen` — the first component to move (`SessionView.tsx:73-235`)

The block runs from the `// ─── Rest screen ───…` comment (line 73) through the
function's closing brace (line 235). Verbatim header excerpt:

```tsx
// ─── Rest screen ──────────────────────────────────────────────────────────────

interface RestScreenProps {
  seconds: number
  exerciseId?: string
  nextStep: Step | null
  onSkip: () => void
  savedRest?: number
  onAdjust?: (exerciseId: string, seconds: number) => void
}

function RestScreen({ seconds: defaultSeconds, exerciseId, nextStep, onSkip, savedRest, onAdjust }: RestScreenProps) {
  const { t } = useTranslation()
  const initialSeconds = savedRest || defaultSeconds
  const endAtRef = useRef<number>(Date.now() + initialSeconds * 1000)
  ...
  return (
    <View className="flex-1 items-center justify-center gap-7 px-6">
      ...
    </View>
  )
}
```

(`interface RestScreenProps` starts at line 75; the `RestScreen` function is
lines **84–235**. Copy the entire block from line 73 through 235 exactly — the
header comment, the interface, and the function body.)

`RestScreen`'s dependencies, all of which already appear in `SessionView.tsx`'s import block (lines 4–49):

- React hooks: `useState`, `useEffect`, `useRef` (line 4)
- React Native: `View`, `AppState` (line 5)
- `useTranslation` from `'react-i18next'` (line 22)
- `Svg, { Circle }` from `'react-native-svg'` (line 23)
- `Text` from `'@/components/ui/text'` (line 26)
- `Button` from `'@/components/ui/button'` (line 27)
- `cn` from `'@/lib/utils'` (line 31)
- `scheduleRestEnd`, `cancelScheduled` from `'@/lib/notifications'` (line 32)
- `updateLiveRest`, `liveSessionHandlesRest` from `'@/lib/live-session'` (line 34)
- `sounds` (namespace) from `'@/lib/sounds'` (line 35)
- `haptics as haptic` from `'@/lib/haptics'` (line 36)
- The `Step` type and the `LIME` / `MUTED` constants (moved to shared files in Step 1).

`RestScreen` does **NOT** close over any SessionView local state or refs — it
receives everything via its props (`seconds`, `exerciseId`, `nextStep`, `onSkip`,
`savedRest`, `onAdjust`) and owns its own internal state. It is rendered at
`SessionView.tsx:1281-1289`:

```tsx
<RestScreen
  key={`rest-${stepIdx}`}
  seconds={currentStep?.exercise.rest || 90}
  exerciseId={currentStep?.exercise.id}
  nextStep={nextStep}
  onSkip={handleRestDone}
  savedRest={currentStep && getRestForExercise ? getRestForExercise(currentStep.exercise.id, currentStep.exercise.rest || 90) : undefined}
  onAdjust={setRestForExercise ? (id, secs) => { setRestForExercise(id, secs) } : undefined}
/>
```

### C. `ExerciseTimer` — the second component to move (`SessionView.tsx:239-440`)

This block includes the `// ─── Timed-exercise timer …` header comment (line
239), the module-level ring constants, the `TimerPhase` type, and the
`ExerciseTimer` function. Verbatim header excerpt:

```tsx
// ─── Timed-exercise timer (web Timer.tsx parity) ──────────────────────────────
// Circular SVG ring + "PREPÁRATE" 3-2-1 pre-countdown + ±seconds + phase states.
const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const T_SIZE = 184
const T_STROKE = 8
const T_R = (T_SIZE - T_STROKE) / 2
const T_CIRC = 2 * Math.PI * T_R
const T_HALF = T_SIZE / 2

const RING = {
  idle: 'hsl(199 89% 62%)',
  countdown: 'hsl(45 93% 58%)',
  running: LIME,
  urgent: 'hsl(0 84% 60%)',
  done: 'hsl(160 84% 60%)',
}
const AMBER = 'hsl(45 93% 58%)'
const URGENT = 'hsl(0 84% 60%)'
const TEAL = 'hsl(160 84% 60%)'

type TimerPhase = 'idle' | 'countdown' | 'running' | 'paused' | 'done'

function ExerciseTimer({ initialSeconds = 30 }: { initialSeconds?: number }) {
  ...
}
```

(Exact lines: the `// ─── Timed-exercise timer …` comment is line **239**; the
`// ─── Timer simple para ejercicios isTimer …` vestigial comment is line **237**;
`const AnimatedCircle` is **241**; `type TimerPhase` is **259**; the
`ExerciseTimer` function is **261–440**. Copy the module-level constants
`AnimatedCircle`, `T_SIZE`, `T_STROKE`, `T_R`, `T_CIRC`, `T_HALF`, `RING`,
`AMBER`, `URGENT`, `TEAL`, the `TimerPhase` type, AND the `ExerciseTimer`
function body, exactly.)

Note the `RING.running: LIME` reference inside the `RING` object literal (line
251) — it depends on the shared `LIME` constant; the reset button at line 434
uses `MUTED`. Both come from the shared constants file created in Step 1.

`ExerciseTimer`'s dependencies (all already in `SessionView.tsx`'s import block):

- React hooks: `useState`, `useEffect`, `useRef` (line 4)
- React Native: `View`, `Pressable` (line 5)
- `Animated`, `useSharedValue`, `useAnimatedProps`, `withTiming`, `Easing`, `ZoomIn` from `'react-native-reanimated'` (lines 6–19)
- `useTranslation` from `'react-i18next'` (line 22)
- `Svg, { Circle }` from `'react-native-svg'` (line 23)
- `Play`, `Pause`, `RotateCcw` from `'lucide-react-native'` (line 24)
- `Text` from `'@/components/ui/text'` (line 26)
- `sounds` from `'@/lib/sounds'` (line 35)
- `haptics as haptic` from `'@/lib/haptics'` (line 36)
- The `LIME` / `MUTED` constants (moved to shared file in Step 1).

`ExerciseTimer` does **NOT** close over any SessionView state. It is consumed by
the **`ExerciseScreen`** component, which STAYS in `SessionView.tsx`, at
`SessionView.tsx:554`:

```tsx
{exercise.isTimer && <ExerciseTimer initialSeconds={exercise.timerSeconds || 30} />}
```

So after moving `ExerciseTimer` out, `SessionView.tsx` must `import` it back to
keep that JSX resolving. **Naming**: the plan's title pairs the destination file
`TimerScreen.tsx`, but the component is named `ExerciseTimer`. Keep the component
name `ExerciseTimer` (so the call site at line 554 is unchanged); just place it in
the file `TimerScreen.tsx` and export it as a named export. Do NOT rename the
component.

### Conventions to match

- Code comments and user-facing copy are in **Spanish**; UI text uses i18n keys
  via `react-i18next` `t('...')`. The moved blocks already follow this — preserve
  every comment and string verbatim.
- Styling is **NativeWind `className` strings**. Do not convert to `StyleSheet`.
  The moved blocks already use inline `style={{...}}` only for SVG sizing and a
  few dynamic colors — keep those exactly.
- Imports use the absolute alias `@/*` (= `apps/mobile/src/*`) and
  `@calistenia/core/*`. Do **not** rewrite these to relative paths. The
  `@calistenia/core/types` subpath resolves to the package's `types/` directory
  and is used verbatim in `SessionView.tsx:38` today — reuse the exact string.
- Exemplar sibling component for file/import shape: `apps/mobile/src/components/Confetti.tsx`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | (from repo root) `pnpm install` | exit 0 |
| Mobile typecheck | `cd apps/mobile && npm run typecheck` | exit 0, no errors (runs `tsc --noEmit`) |
| Mobile tests | `cd apps/mobile && npm run test` | `vitest run`; all tests pass (3 mobile files + plan 006's new file) |
| Mobile lint | `cd apps/mobile && npm run lint` | runs `expo lint`; **always exits 0** even with pre-existing errors — used only as a non-gating sanity pass (see toolchain note) |
| Core tests (sanity only) | (from repo root) `./apps/mobile/node_modules/.bin/vitest run --root packages/core` | 5 files, 57 tests pass (verified on 943f558) |

Notes verified during recon (on 943f558):
- `cd apps/mobile && npm run test` collects ONLY the mobile test files under
  `apps/mobile/src/lib/__tests__/` (3 files, 13 tests). It does NOT pick up
  `packages/core` tests. Plan 006 adds its session-machine test in the mobile
  workspace, so after 006 this command runs those too.
- There is no `test` script and no vitest binary in `packages/core`; core tests
  run only via the mobile workspace's vitest binary with `--root packages/core`
  (verified: 5 files, 57 tests).
- `cd apps/mobile && npm run typecheck` is clean on 943f558 (advisor-verified,
  exit 0).
- `cd apps/mobile && npm run lint` exits 0 but reports 196 pre-existing errors /
  47 warnings at 943f558 (it is non-gating — see the toolchain note above).

## Scope

**In scope** (the only files you should create or modify):
- `apps/mobile/src/components/session/constants.ts` (create — exports `LIME`, `MUTED`)
- `apps/mobile/src/components/session/types.ts` (create — exports the `Step` interface)
- `apps/mobile/src/components/session/RestScreen.tsx` (create — the moved `RestScreen`)
- `apps/mobile/src/components/session/TimerScreen.tsx` (create — the moved `ExerciseTimer`)
- `apps/mobile/src/components/SessionView.tsx` (edit — remove the moved definitions; add imports; switch `LIME`/`MUTED`/`Step` to shared imports)
- `advisor-plans/README.md` (edit — status row for plan 007)

**Out of scope** (do NOT touch, even though they look related):
- Any behavior, prop, JSX, comment, sound, haptic, or notification-scheduling
  logic inside the moved blocks — this is a pure move. If you feel tempted to
  "clean up" anything (including pre-existing lint errors), don't; that defeats
  the diff-against-original review.
- The session-machine module and its tests — already created by plan 006; do not
  re-extract logic here.
- The other inlined components (`ExerciseScreen`, `SectionTransitionScreen`,
  `NoteScreen`, `TimingBar`, `CelebrateScreen`) — they stay in `SessionView.tsx`
  for this plan.
- `buildSteps` and `SCREEN_WIDTH` — controller-only; leave in `SessionView.tsx`.
- Web app, core package source (other than the read-only core-test sanity check).

## Git workflow

- Branch: `advisor/007-split-sessionview-nested-views` (create it before editing:
  `git checkout -b advisor/007-split-sessionview-nested-views`).
- Commit per step or per logical unit. Use Conventional Commits with a scope,
  matching the repo log (e.g. `refactor(mobile): move RestScreen into its own file`).
- Stage with **explicit file paths** only — never `git add -A` and never `git add .`.
  Example: `git add apps/mobile/src/components/session/RestScreen.tsx apps/mobile/src/components/SessionView.tsx`.
- Do NOT push, merge, rebase, or open a PR unless the operator explicitly tells you to.

## Steps

Order is chosen so the codebase typechecks after every step (each step removes a
definition and re-imports it in the same step).

### Step 1: Create the shared `constants.ts` and `types.ts`, and point SessionView at them

1. Create `apps/mobile/src/components/session/constants.ts` with exactly:

   ```ts
   // Constantes compartidas por las vistas de sesión (RestScreen, TimerScreen, SessionView).
   export const LIME = 'hsl(74 90% 45%)'
   export const MUTED = 'hsl(0 0% 55%)'
   ```

2. Create `apps/mobile/src/components/session/types.ts` with exactly:

   ```ts
   import type { Exercise } from '@calistenia/core/types'

   export interface Step {
     exercise: Exercise
     setNumber: number
     totalSets: number
     section: 'warmup' | 'main' | 'cooldown'
   }
   ```

3. In `SessionView.tsx`, DELETE the `interface Step { ... }` block (currently
   lines 51–56) and the two constant lines `const LIME = ...` and `const MUTED = ...`
   (currently lines 69–70). LEAVE `buildSteps` (lines 58–67) and
   `const SCREEN_WIDTH = Dimensions.get('window').width` (line 71) in place.

4. In `SessionView.tsx`, add these imports near the other `@/components` imports
   (e.g. just after line 49, the `RepeatTrainingButton` import):

   ```tsx
   import { LIME, MUTED } from '@/components/session/constants'
   import type { Step } from '@/components/session/types'
   ```

**Verify**: `cd apps/mobile && npm run typecheck` → exit 0, no errors.

### Step 2: Move `RestScreen` into `session/RestScreen.tsx` and import it back

1. Create `apps/mobile/src/components/session/RestScreen.tsx`. Its import header
   must declare exactly the dependencies listed in "Current state — B". Use this
   header, then paste the `// ─── Rest screen ───…` comment, the
   `RestScreenProps` interface, and the entire `RestScreen` function body
   **verbatim** from `SessionView.tsx` (currently lines 73–235):

   ```tsx
   import { useState, useEffect, useRef } from 'react'
   import { View, AppState } from 'react-native'
   import { useTranslation } from 'react-i18next'
   import Svg, { Circle } from 'react-native-svg'

   import { Text } from '@/components/ui/text'
   import { Button } from '@/components/ui/button'
   import { cn } from '@/lib/utils'
   import { scheduleRestEnd, cancelScheduled } from '@/lib/notifications'
   import { updateLiveRest, liveSessionHandlesRest } from '@/lib/live-session'
   import * as sounds from '@/lib/sounds'
   import { haptics as haptic } from '@/lib/haptics'
   import { LIME, MUTED } from '@/components/session/constants'
   import type { Step } from '@/components/session/types'

   // ─── Rest screen ──────────────────────────────────────────────────────────────

   interface RestScreenProps {
     // ... (verbatim from SessionView.tsx lines 75–82)
   }

   export function RestScreen(/* ...verbatim... */) {
     // ... entire body verbatim from lines 84–235 ...
   }
   ```

   The ONLY edit to the moved code is prefixing the function declaration with
   `export` (change `function RestScreen(` to `export function RestScreen(`).
   Everything else — props, hooks, comments, JSX, `eslint-disable` lines — is
   copied character-for-character. (Note: the moved block contains pre-existing
   lint findings, e.g. at the original line 87 — these are part of the verbatim
   code; do NOT alter them.)

2. In `SessionView.tsx`, DELETE the moved block: the `// ─── Rest screen ───…`
   comment, the `interface RestScreenProps { ... }`, and the entire `RestScreen`
   function (currently lines 73–235).

3. In `SessionView.tsx`, add the import (next to the imports added in Step 1):

   ```tsx
   import { RestScreen } from '@/components/session/RestScreen'
   ```

4. Confirm the render site (currently `SessionView.tsx:1281-1289`) is unchanged —
   it still references `<RestScreen ... />` with the same props.

**Verify**: `cd apps/mobile && npm run typecheck` → exit 0, no errors.

### Step 3: Move `ExerciseTimer` into `session/TimerScreen.tsx` and import it back

1. Create `apps/mobile/src/components/session/TimerScreen.tsx`. Header per
   "Current state — C", then paste the module-level ring constants
   (`AnimatedCircle`, `T_SIZE`, `T_STROKE`, `T_R`, `T_CIRC`, `T_HALF`, `RING`,
   `AMBER`, `URGENT`, `TEAL`), the `type TimerPhase = ...`, and the entire
   `ExerciseTimer` function **verbatim** from `SessionView.tsx` (currently the
   `const AnimatedCircle = ...` line through `ExerciseTimer`'s closing `}`, lines
   241–440). Keep the component **named** `ExerciseTimer`:

   ```tsx
   import { useState, useEffect, useRef } from 'react'
   import { View, Pressable } from 'react-native'
   import Animated, {
     useSharedValue,
     useAnimatedProps,
     withTiming,
     Easing,
     ZoomIn,
   } from 'react-native-reanimated'
   import { useTranslation } from 'react-i18next'
   import Svg, { Circle } from 'react-native-svg'
   import { Play, Pause, RotateCcw } from 'lucide-react-native'

   import { Text } from '@/components/ui/text'
   import * as sounds from '@/lib/sounds'
   import { haptics as haptic } from '@/lib/haptics'
   import { LIME, MUTED } from '@/components/session/constants'

   // ─── Timed-exercise timer (web Timer.tsx parity) ──────────────────────────────
   // Circular SVG ring + "PREPÁRATE" 3-2-1 pre-countdown + ±seconds + phase states.
   const AnimatedCircle = Animated.createAnimatedComponent(Circle)
   // ... rest of the ring constants, RING, AMBER, URGENT, TEAL, TimerPhase — verbatim

   export function ExerciseTimer({ initialSeconds = 30 }: { initialSeconds?: number }) {
     // ... entire body verbatim ...
   }
   ```

   The ONLY edit to the moved code is prefixing `function ExerciseTimer(` with
   `export`. Do NOT rename the component. The vestigial section comment
   `// ─── Timer simple para ejercicios isTimer ───…` at `SessionView.tsx:237`
   has no code effect; LEAVE it out of the new file (do not duplicate a header).
   Whether it stays in `SessionView.tsx` or is deleted with the block is your
   choice — but if you keep any comment, keep it verbatim.

2. In `SessionView.tsx`, DELETE the moved block: the
   `// ─── Timed-exercise timer …` comment (line 239), all the ring constants,
   the `TimerPhase` type, and the entire `ExerciseTimer` function (currently
   lines 239–440). Leave the `// ─── Exercise screen ───…` comment (line 442) and
   everything from `quickReps` onward intact.

3. In `SessionView.tsx`, add the import (next to the Step-1/Step-2 imports):

   ```tsx
   import { ExerciseTimer } from '@/components/session/TimerScreen'
   ```

4. Confirm the call site `{exercise.isTimer && <ExerciseTimer initialSeconds={exercise.timerSeconds || 30} />}`
   (currently `SessionView.tsx:554`, inside `ExerciseScreen`) is unchanged.

**Verify**: `cd apps/mobile && npm run typecheck` → exit 0, no errors.

### Step 4: Prune now-unused imports from SessionView

After Steps 2–3, some imports in `SessionView.tsx` are used ONLY by the moved
components and are now unused in the controller. Because `tsc` does NOT enable
`noUnusedLocals` and `no-unused-vars` is only a lint **warning** (exit code stays
0), the toolchain will NOT flag these — you MUST verify each with the explicit
`grep` below. Remove an identifier from an import ONLY if its grep returns no
matches outside the import line itself.

**Safe to remove (verified controller-unused after both moves):**

- `Play`, `Pause`, `RotateCcw` from `'lucide-react-native'` (line 24) — used only
  by `ExerciseTimer`. KEEP `ChevronLeft`, `ChevronRight`, `X` (still used in the
  top bar / nav arrows at `:1228,:1244,:1306,:1311`).
- `scheduleRestEnd`, `cancelScheduled` from `'@/lib/notifications'` (line 32) —
  used only by `RestScreen`. **KEEP `requestNotifPermission`** (same import line)
  — the controller uses it at `:1002`.
- `updateLiveRest`, `liveSessionHandlesRest` from `'@/lib/live-session'`
  (line 34) — used only by `RestScreen`. (Note: `useLiveSession` is a SEPARATE
  import from `'@/lib/use-live-session'` on line 33, used at `:1210` — KEEP it.)
- `useAnimatedProps` from `'react-native-reanimated'` (line 9) — used only by
  `ExerciseTimer` (`:270`).
- `Svg, { Circle }` from `'react-native-svg'` (line 23) — both `RestScreen` and
  `ExerciseTimer` used them; after both moves the controller no longer references
  `Svg` or `Circle`. Remove the whole line.
- `AppState` from the `react-native` destructured import (line 5) — used only by
  `RestScreen` (`:145`). Remove just `AppState` from the destructure; keep the
  rest (`View`, `ScrollView`, `Pressable`, `Alert`, `Linking`, `Dimensions`,
  `KeyboardAvoidingView`, `Platform`, `useWindowDimensions`).

**MUST KEEP — do NOT remove (still used by components that stay):**

- `ZoomIn` from `'react-native-reanimated'` (line 18) — used by `ExerciseTimer`
  (`:375`) AND by `CelebrateScreen` (`:833`), which STAYS. Removing it breaks the
  controller. KEEP it.
- `cn` from `'@/lib/utils'` (line 31) — still used by `ExerciseScreen`/`TimingBar`/
  others. KEEP.
- `sounds` (line 35) and `haptics as haptic` (line 36) — used widely by the
  controller and the staying components (11 and 14 references respectively). KEEP.
- `Button`, `Text`, `useTranslation` — used by staying components. KEEP.

For EACH identifier you intend to remove, run a grep first and confirm zero
matches outside the import line. Examples:

```
grep -nE '\b(Play|Pause|RotateCcw)\b' apps/mobile/src/components/SessionView.tsx
grep -nE '\b(scheduleRestEnd|cancelScheduled|updateLiveRest|liveSessionHandlesRest)\b' apps/mobile/src/components/SessionView.tsx
grep -nE '\b(useAnimatedProps|Svg|Circle|AppState)\b' apps/mobile/src/components/SessionView.tsx
```

After removing, run this guard to confirm the MUST-KEEP symbols are still present
and still referenced in usage (not just the import line):

```
grep -nE '\bZoomIn\b' apps/mobile/src/components/SessionView.tsx
```

Expected: at least 2 matches (the import on line ~18 and the `CelebrateScreen`
usage). If `ZoomIn` shows only the import line, you deleted the wrong block —
STOP and investigate.

**Verify**:
- `cd apps/mobile && npm run typecheck` → exit 0, no errors. (This is the real
  gate. If you accidentally removed a still-used import like `ZoomIn`, typecheck
  fails here.)
- `cd apps/mobile && npm run lint` → exits 0 (non-gating; pre-existing errors are
  expected — do not act on them). Optionally inspect, but do not treat its output
  as a pass/fail for this plan.

### Step 5: Run the test suite (plan 006's safety net) and check line-count reduction

1. `cd apps/mobile && npm run test` → all tests pass (the 3 existing mobile test
   files — 13 tests — plus plan 006's session-machine test). No test in this plan;
   006's tests are the regression net.

2. Confirm the controller shrank substantially:

   ```
   wc -l apps/mobile/src/components/SessionView.tsx
   ```

   Expected: roughly **1010–1075 lines** (down from 1362 — about a 290–350 line
   reduction: ~163 lines for the `RestScreen` block (73–235) + ~202 lines for the
   `ExerciseTimer` block (239–440), minus the ~5 import lines added and the
   `Step`/`LIME`/`MUTED` lines removed). If it is still above 1100, the move did
   not actually remove the blocks — STOP and investigate.

3. Confirm the two new component files exist:

   ```
   ls apps/mobile/src/components/session/RestScreen.tsx apps/mobile/src/components/session/TimerScreen.tsx
   ```

   Expected: both paths listed, no "No such file" error.

**Verify**: all three sub-checks above pass.

### Step 6: Confirm only in-scope files changed, then commit

1. `git status --porcelain` → only these paths appear (modified `M` or new `??`):
   - `apps/mobile/src/components/SessionView.tsx`
   - `apps/mobile/src/components/session/constants.ts`
   - `apps/mobile/src/components/session/types.ts`
   - `apps/mobile/src/components/session/RestScreen.tsx`
   - `apps/mobile/src/components/session/TimerScreen.tsx`
   - (later) `advisor-plans/README.md`

2. Stage with explicit paths and commit, e.g.:

   ```
   git add apps/mobile/src/components/session/constants.ts apps/mobile/src/components/session/types.ts apps/mobile/src/components/session/RestScreen.tsx apps/mobile/src/components/session/TimerScreen.tsx apps/mobile/src/components/SessionView.tsx
   git commit -m "refactor(mobile): move RestScreen and ExerciseTimer into components/session/"
   ```

3. Update the status row for plan 007 in `advisor-plans/README.md` to `DONE`,
   stage and commit that file separately.

**Verify**: `git status --porcelain` after committing → clean (or shows only an
uncommitted `advisor-plans/README.md` if you stage it separately).

## Test plan

- **No new tests are written by this plan.** There is no React render-test
  infrastructure in this repo (no `@testing-library/react-native`, no `jest-expo`,
  no vitest config; tests run in the default node environment); every existing
  test is a pure-function unit test. Rendering `RestScreen`/`ExerciseTimer` in a
  test is impossible here — do NOT attempt it.
- The safety net is (a) the TypeScript compiler (`npm run typecheck`), which
  proves the moved components and their props still wire up, and (b) plan 006's
  pure session-machine tests, which prove the controller's transition logic is
  unchanged.
- Verification: `cd apps/mobile && npm run test` → all pass, including plan 006's
  new test file. Structural pattern for any future logic test:
  `apps/mobile/src/lib/__tests__/live-activity-state.test.ts` (imports a pure
  function, asserts on its return — `describe`/`it`/`expect` from `'vitest'`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd apps/mobile && npm run typecheck` exits 0 with no errors
- [ ] `cd apps/mobile && npm run test` exits 0; all tests pass (the 3 baseline mobile files + plan 006's test file)
- [ ] `apps/mobile/src/components/session/RestScreen.tsx` and `apps/mobile/src/components/session/TimerScreen.tsx` both exist
- [ ] `apps/mobile/src/components/session/constants.ts` and `.../session/types.ts` both exist
- [ ] `grep -nE '^\s*function RestScreen\b|^\s*function ExerciseTimer\b' apps/mobile/src/components/SessionView.tsx` returns no matches (definitions moved out)
- [ ] `grep -nE "from '@/components/session/(RestScreen|TimerScreen)'" apps/mobile/src/components/SessionView.tsx` returns 2 matches (both imported back)
- [ ] `grep -nE '\bZoomIn\b' apps/mobile/src/components/SessionView.tsx` returns ≥1 match (the still-used `CelebrateScreen` reference at ~line 833 — proves you did not delete a still-used import)
- [ ] `wc -l apps/mobile/src/components/SessionView.tsx` reports < 1100 (down from 1362)
- [ ] `git status --porcelain` shows only the in-scope files
- [ ] `advisor-plans/README.md` status row for plan 007 updated to DONE

(Note: `npm run lint` is intentionally NOT a Done criterion — it exits 0
regardless of lint errors and the baseline already has 196 pre-existing errors,
so it cannot prove anything about this change.)

## STOP conditions

Stop and report back (do not improvise) if:

- The Drift check shows `SessionView.tsx` changed since 943f558 AND the
  `RestScreen` / `ExerciseTimer` functions or the `LIME`/`MUTED`/`Step`
  definitions no longer match the excerpts above.
- **Plan 006 has not been executed** (no session-machine module/tests exist):
  `cd apps/mobile && npm run test` shows only the 3 baseline mobile test files
  (13 tests) and no session-machine test. Without 006's safety net, report and
  wait — do not proceed.
- A nested component you are moving turns out to **close over SessionView local
  state, refs, or callbacks** that are not already passed as props (i.e. moving it
  would require adding new props or changing behavior). Per recon, `RestScreen`
  and `ExerciseTimer` do NOT close over parent state — both take everything via
  props and own their internal state. If you discover otherwise, name the exact
  variable(s) and STOP; this would no longer be a clean mechanical move.
- A reanimated **shared value** (e.g. the `offset` `useSharedValue` inside
  `ExerciseTimer`, line 269) appears to be created in one file and consumed across
  the file boundary. (It should not be — `offset` is local to `ExerciseTimer`.) If
  a shared value crosses files, STOP.
- `npm run typecheck` fails after a step and a single reasonable fix attempt does
  not resolve it (e.g. an import path you cannot make resolve, or a symbol you
  removed in Step 4 that turns out to still be referenced — re-add it and re-run).
- The fix appears to require editing any file outside the in-scope list.

## Maintenance notes

For the human/agent reviewing or owning this after it lands:

- **This must be a pure move.** The single most important review action: in the
  PR, diff each moved block against the original `SessionView.tsx` at 943f558 to
  confirm zero logic edits slipped in. A practical check:
  `git show 943f558:apps/mobile/src/components/SessionView.tsx | sed -n '84,235p'`
  should match `apps/mobile/src/components/session/RestScreen.tsx`'s function body
  line-for-line (modulo the added `export` keyword and the relocated imports);
  likewise lines `261,440` of the original against `TimerScreen.tsx`'s
  `ExerciseTimer`.
- `RestScreen`/`ExerciseTimer` carry **pre-existing** lint findings (e.g. the
  impure-call-during-render at the old line 87, ref-in-render at the old line 279).
  These travel with the verbatim move and are NOT new — do not flag them as
  introduced by this PR.
- `LIME` and `MUTED` now have a single source of truth in
  `apps/mobile/src/components/session/constants.ts`. Future session components
  should import from there rather than redeclaring the HSL strings.
- The component in `TimerScreen.tsx` is intentionally still named `ExerciseTimer`
  (file name ≠ export name) to avoid churning the call site. Plan 001 (timer UI
  parity) targets this same `ExerciseTimer`; after this plan it lives in its own
  file, so 001's "Current state" line numbers will need re-reading against
  `TimerScreen.tsx`.
- Deferred out of scope: extracting the remaining inlined screens
  (`ExerciseScreen`, `NoteScreen`, `CelebrateScreen`, `SectionTransitionScreen`,
  `TimingBar`) into `components/session/` — a sensible follow-up plan once this
  pattern is established, but not done here to keep the diff reviewable.