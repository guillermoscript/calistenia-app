# Plan 006: Extract SessionView step/phase logic into a pure, unit-tested `session-machine.ts`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, add/update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told you
> they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 943f558..HEAD -- apps/mobile/src/components/SessionView.tsx apps/mobile/src/lib/__tests__ apps/mobile/src/lib/session-machine.ts packages/core/types/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `943f558`, 2026-06-21

## Why this matters

`apps/mobile/src/components/SessionView.tsx` is a 1362-line "god component" that
mixes pure session-state logic (which step is current, where exercise
boundaries fall, what phase comes after a logged set) with rendering, timers,
gestures, and sharing. The pure logic — the most-used path in the whole app, run
on every set of every workout — currently has **zero test coverage** because it
is trapped inside the component and there is no React-render test infra to
exercise it. This plan extracts those pure functions into a new module
`apps/mobile/src/lib/session-machine.ts` and pins their behavior with
characterization unit tests. The result: real coverage on the hot path, a
smaller component, and a safe foundation for the later view-component extraction
(plan 007). This is a behavior-preserving refactor — the component must compute
exactly the same values after the change.

## Current state

Files involved:

- `apps/mobile/src/components/SessionView.tsx` — the god component. Contains the
  `Step` type (lines 51-56) and `buildSteps` (lines 58-67) near the top, and the
  step/phase logic to extract in the region lines 1013-1142.
- `packages/core/types/index.ts` — defines `Exercise` (lines 15-40). `buildSteps`
  consumes `Exercise[]`.
- `apps/mobile/src/lib/__tests__/live-activity-state.test.ts` — the EXACT
  structural pattern to mirror for the new test file (pure function, `vitest`
  `describe/it/expect`, small inline fixtures, no React render).

### The `Step` type and `buildSteps` — `SessionView.tsx:51-67` (VERBATIM)

```ts
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
```

(The `Step` interface occupies lines 51-56 and `buildSteps` occupies lines 58-67;
line 57 is blank.)

Note: `Step` is currently a non-exported, file-local `interface`. The extraction
must EXPORT it from the new module so the component can import it. `Exercise`
already comes from core — `SessionView.tsx:38` imports it:
`import type { Exercise, Workout, ExerciseLog, SetData, ExerciseTiming } from '@calistenia/core/types'`.

**`Step` is referenced in 4 more places in the file beyond its definition** — you
must NOT touch these; they keep working once `Step` is imported at the top:
- line 78: `nextStep: Step | null` (inside `RestScreenProps`)
- line 450: `step: Step` (inside `ExerciseScreenProps`)
- line 59: `const steps: Step[] = []` (inside `buildSteps`, which moves to the module)
- line 968: `const steps = useRef<Step[]>(buildSteps(workout.exercises)).current`

Because you add the `Step` import at the TOP of the file (Step 3a), it is in
scope for lines 78, 450, and 968. Do not be alarmed that `Step` references remain
after you delete the local `interface Step` — that is expected and correct.

### `Exercise` type — `packages/core/types/index.ts:15-40` (VERBATIM, relevant fields)

```ts
export interface Exercise {
  id: string
  name: string
  /** Usually a number, but can be a string like "múltiples" or "intentos" */
  sets: number | string
  reps: string
  rest: number
  // ...
  supersetGroup?: string  // exercises with same group ID are done back-to-back
  // ...
  section?: 'warmup' | 'main' | 'cooldown'
  // ...
}
```

Key facts the executor must honor:
- `sets` may be a number, a numeric string, or the Spanish literal `'múltiples'`
  (which means 3 sets). `parseInt(String(ex.sets)) || 1` falls back to 1 for
  non-numeric strings.
- `section` is optional; `buildSteps` defaults it to `'main'`.
- `supersetGroup` is optional; two adjacent exercises with the same non-empty
  `supersetGroup` are done back-to-back (no rest between them).

### Exercise boundaries — `SessionView.tsx:1018-1023` (VERBATIM)

```ts
  const exerciseBoundaries = useRef<number[]>(
    steps.reduce<number[]>((acc, s, i) => {
      if (i === 0 || s.exercise.id !== steps[i - 1].exercise.id) acc.push(i)
      return acc
    }, [])
  ).current
```

The pure part is the `steps.reduce(...)` body. The `useRef(...).current` wrapper
is a React memoization concern and stays in the component.

### Current exercise index — `SessionView.tsx:1025-1030` (VERBATIM)

```ts
  const currentExerciseIndex = exerciseBoundaries.findIndex((bIdx, i) => {
    const nextBoundary = exerciseBoundaries[i + 1] ?? steps.length
    return stepIdx >= bIdx && stepIdx < nextBoundary
  })
  const hasPrevExercise = currentExerciseIndex > 0
  const hasNextExercise = currentExerciseIndex < exerciseBoundaries.length - 1
```

Only the `findIndex(...)` (computing `currentExerciseIndex`, lines 1025-1028) is
extracted. It depends on `exerciseBoundaries`, `stepIdx`, and `steps.length`.
`hasPrevExercise` / `hasNextExercise` (lines 1029-1030) stay in the component
(they are trivial derived booleans; extracting them is out of scope).

### Post-set phase decision inside `handleLogged` — `SessionView.tsx:1111-1142` (VERBATIM)

```ts
  const handleLogged = useCallback(async ({ reps, note, weight, rpe }: { reps: string; note: string; weight?: number; rpe?: number }) => {
    const prEvent = await onLogSet(currentStep.exercise.id, workoutKey, { reps, note, weight, rpe })
    if (prEvent) {
      setPrCelebration({ event: prEvent, exerciseName: currentStep.exercise.name })
    }
    setSetsCount(c => c + 1)

    if (isLastStep) {
      setPhase('note')
      return
    }

    // Transición de sección (warmup→main o main→cooldown)
    const currentSection = currentStep.section
    const nextSection = nextStep?.section || 'main'
    if (currentSection !== nextSection) {
      setTransitionType(currentSection === 'warmup' ? 'warmup-to-main' : 'main-to-cooldown')
      pendingStepIdx.current = stepIdx + 1
      setPhase('section-transition')
      return
    }

    // Superset: sin descanso entre ejercicios del mismo grupo
    const currentGroup = currentStep.exercise.supersetGroup
    const nextExGroup = nextStep?.exercise.supersetGroup
    if (currentGroup && nextExGroup && currentGroup === nextExGroup) {
      setStepIdx(i => i + 1)
      setPhase('exercise')
    } else {
      setPhase('rest')
    }
  }, [currentStep, isLastStep, nextStep, onLogSet, workoutKey, stepIdx])
```

The pure decision — the branch order and conditions in lines 1118-1141 — is what
`nextPhaseAfterSet` must reproduce EXACTLY. Everything else in `handleLogged`
(the `await onLogSet`, `setPrCelebration`, `setSetsCount`, and the React state
setters `setPhase`/`setStepIdx`/`setTransitionType`/`pendingStepIdx.current`)
stays in the component; the component reads the discriminated result and performs
the side effects.

Branch order (this is the contract):
1. `isLastStep` → finish to note.
2. else if `currentStep.section !== (nextStep?.section || 'main')` → section
   transition; `transitionType` is `'warmup-to-main'` when
   `currentStep.section === 'warmup'`, otherwise `'main-to-cooldown'`; the
   pending next step index is `stepIdx + 1`.
3. else if both `currentStep.exercise.supersetGroup` and
   `nextStep.exercise.supersetGroup` are truthy AND equal → advance (no rest).
4. else → rest.

### Related component state types — `SessionView.tsx:970-974` (VERBATIM, for context only — do NOT change)

```ts
  const [stepIdx, setStepIdx] = useState<number>(initialProgress?.stepIdx ?? 0)
  const [phase, setPhase] = useState<SessionPhase>(initialProgress?.phase ?? 'exercise')
  const [setsCount, setSetsCount] = useState<number>(initialProgress?.setsCount ?? 0)
  const [transitionType, setTransitionType] = useState<'warmup-to-main' | 'main-to-cooldown'>('warmup-to-main')
  const pendingStepIdx = useRef<number | null>(null)
```

The `transitionType` union (`'warmup-to-main' | 'main-to-cooldown'`) must be the
type of the `transitionType` field in the `section-transition` result.
`SessionPhase` (defined at `SessionView.tsx:919`) is
`'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'`; do NOT
change it.

### Test infrastructure reality (CRITICAL — do not deviate)

- There is **NO** vitest config file and **NO** React-Native render test infra
  (no `@testing-library/react-native`, no `jest-expo`). Vitest runs in the
  DEFAULT node environment. Confirmed: no `vitest.config.*` anywhere in the repo.
- Every existing test is **pure logic**: it imports a pure function and asserts
  on its return value. Mirror `live-activity-state.test.ts` exactly.
- **NEVER** render a React component, hook, or context in a test. The functions
  you extract are plain functions with no React imports — that is the whole point.
- `apps/mobile`'s `npm run test` (= `vitest run`) auto-discovers test files
  under `apps/mobile/src/**`, so the new `session-machine.test.ts` is picked up
  with no config change. Verified: today `vitest run` finds 3 files / 13 tests
  under `src/lib/__tests__/`.
- The new module imports `Exercise` from core **type-only**
  (`import type { Exercise } from '@calistenia/core/types'`). Because it is a
  `type`-only import it is erased before runtime, so vitest never has to resolve
  the `@calistenia/core` workspace package — confirmed by running a throwaway
  probe test with this exact import + an `as Exercise` cast fixture (it passed).
  Keep ALL `Exercise` usage in the module and test as `import type` / `as`
  casts; do not add a runtime `import { something } from '@calistenia/core'`.
- Core tests live under `packages/core/lib/*.test.ts` but `packages/core` has NO
  vitest installed and NO `test` script. Core tests are run via mobile's vitest
  with an explicit `--dir`. Verified command below.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (from repo root) | `pnpm install` | exit 0 |
| Mobile typecheck (authoritative gate) | `cd apps/mobile && npm run typecheck` | exit 0, no errors (runs `tsc --noEmit`; clean on 943f558) |
| Mobile tests (incl. new file) | `cd apps/mobile && npm run test` | `vitest run`, all pass |
| Run only the new test file | `cd apps/mobile && npx vitest run src/lib/__tests__/session-machine.test.ts` | all pass |
| Core tests (via mobile vitest) | `cd apps/mobile && npx vitest run --dir ../../packages/core` | `Test Files 5 passed (5)`, `Tests 57 passed (57)` |
| Lint the NEW files only | `cd apps/mobile && npx eslint src/lib/session-machine.ts src/lib/__tests__/session-machine.test.ts` | exit 0, no problems |
| Lint SessionView (count guard) | `cd apps/mobile && npx eslint src/components/SessionView.tsx` | exit 1, `74 problems (72 errors, 2 warnings)` on baseline — see lint note below |

Notes verified during recon:
- `packages/core/package.json` has **no** `scripts` and **no** `vitest`
  dependency, so `cd packages/core && npx vitest run` fails with
  `vitest: command not found`. Use the mobile-vitest `--dir` form above to run
  core tests.
- Default `cd apps/mobile && npm run test` does NOT include `packages/core`
  tests — it only scans `apps/mobile`. That is fine: this plan's new test lives
  under `apps/mobile`.
- **LINT BASELINE IS DIRTY — do NOT use `npm run lint` as a pass/fail gate.**
  On commit `943f558`, `cd apps/mobile && npm run lint` exits **1** with
  **196 errors / 47 warnings** spread across many files; `SessionView.tsx`
  itself already accounts for **72 errors / 2 warnings** (74 problems), all
  pre-existing and OUT OF SCOPE for this plan. Running the whole-repo lint and
  expecting exit 0 is impossible here. Instead:
  - The two NEW files you create MUST lint clean (exit 0) on their own — verified
    pattern: `npx eslint src/lib/widget-snapshot.ts` (an existing pure lib file)
    exits 0.
  - `SessionView.tsx`'s problem count must NOT increase from its baseline of
    **74 problems (72 errors, 2 warnings)**. A pure extraction removes one
    function + one interface and adds one import, so the count should stay 74 or
    drop slightly — it must never go above 74.

## Suggested executor toolkit

- Optional: `vercel-react-native-skills` is irrelevant here (no rendering /
  perf work). You do not need it. The work is plain TypeScript + vitest.

## Scope

**In scope** (the only files you should create/modify):
- `apps/mobile/src/lib/session-machine.ts` (create)
- `apps/mobile/src/lib/__tests__/session-machine.test.ts` (create)
- `apps/mobile/src/components/SessionView.tsx` (modify — replace inline logic
  with imports; pure refactor, no behavior change)
- `advisor-plans/README.md` (add/update the status row for plan 006 only)

**Out of scope** (do NOT touch, even though they look related):
- Anything in `SessionView.tsx` outside the four extracted snippets: timers,
  the `RestScreen`/transition/note/celebrate render code, gestures
  (`swipeGesture`, `translateX`), share cards, `useEffect` blocks,
  `handleRestDone`, `handleSectionContinue`, `handleSkipWarmup`, and the
  `RestScreenProps`/`ExerciseScreenProps` interfaces (lines 78 and 450 reference
  `Step` and must keep working — leave them byte-identical). Leave all of this
  unchanged.
- The pre-existing lint errors in `SessionView.tsx` (or any other file) — do NOT
  try to fix them; they are unrelated to this plan.
- `packages/core/**` — do NOT move `Step` or `buildSteps` into core; the `Step`
  type is mobile-specific and stays in the mobile module.
- `hasPrevExercise` / `hasNextExercise`, `goToPrevExercise` / `goToNextExercise`
  — leave in the component (they wrap React state setters).
- Any change to rendering, props, the `SessionPhase` type, or the
  `transitionType` state — only the *source* of computed values changes.

## Git workflow

- Branch: `advisor/006-session-machine-extract` (create from `main` at `943f558`).
- Use **EXPLICIT file paths** in `git add` (never `git add -A`):
  `git add apps/mobile/src/lib/session-machine.ts apps/mobile/src/lib/__tests__/session-machine.test.ts apps/mobile/src/components/SessionView.tsx advisor-plans/README.md`
- Commit message style: Conventional Commits with scope, e.g.
  `refactor(mobile): extract pure session step/phase logic into session-machine`
  and `test(mobile): characterization tests for session-machine`. Co-authored-by
  lines are not required.
- There is a pre-existing untracked file `scripts/seed-social-notif-test.mjs` and
  several untracked `advisor-plans/00X-*.md` files. Do NOT stage, add, modify, or
  delete any of them.
- Do NOT push, merge, rebase, or open a PR unless the operator instructs it.

## Steps

Steps are ordered so the codebase typechecks after every step.

### Step 1: Create the pure module `session-machine.ts` (no component changes yet)

Create `apps/mobile/src/lib/session-machine.ts` with the four pure functions and
the exported `Step` type. Copy the logic VERBATIM from the excerpts above — do
not "improve" it. Import `Exercise` from core **type-only**. The file must
contain ZERO React imports (no `react`, no `react-native`, no hooks) and no
runtime import from `@calistenia/core`.

Produce exactly this shape (the bodies are copied from the "Current state"
excerpts):

```ts
// Lógica pura de la máquina de estados de la sesión, extraída de SessionView.
// Sin React ni hooks: funciones puras testeables. La base para el plan 007.
import type { Exercise } from '@calistenia/core/types'

export interface Step {
  exercise: Exercise
  setNumber: number
  totalSets: number
  section: 'warmup' | 'main' | 'cooldown'
}

/** Expande cada ejercicio en una serie de "pasos" (uno por set). */
export function buildSteps(exercises: Exercise[]): Step[] {
  const steps: Step[] = []
  exercises.forEach(ex => {
    const total = ex.sets === 'múltiples' ? 3 : (parseInt(String(ex.sets)) || 1)
    for (let s = 1; s <= total; s++) {
      steps.push({ exercise: ex, setNumber: s, totalSets: total, section: ex.section || 'main' })
    }
  })
  return steps
}

/** Índices de paso donde empieza cada ejercicio (para navegación prev/next). */
export function computeExerciseBoundaries(steps: Step[]): number[] {
  return steps.reduce<number[]>((acc, s, i) => {
    if (i === 0 || s.exercise.id !== steps[i - 1].exercise.id) acc.push(i)
    return acc
  }, [])
}

/** Índice del ejercicio actual dado el paso actual. -1 si stepIdx queda fuera de rango. */
export function findCurrentExerciseIndex(
  boundaries: number[],
  stepIdx: number,
  stepsLength: number,
): number {
  return boundaries.findIndex((bIdx, i) => {
    const nextBoundary = boundaries[i + 1] ?? stepsLength
    return stepIdx >= bIdx && stepIdx < nextBoundary
  })
}

export type NextPhaseResult =
  | { kind: 'note' }
  | { kind: 'section-transition'; transitionType: 'warmup-to-main' | 'main-to-cooldown'; nextStepIdx: number }
  | { kind: 'advance' }
  | { kind: 'rest' }

/**
 * Decide la fase tras registrar una serie. Reproduce EXACTAMENTE el orden de
 * ramas de handleLogged en SessionView:
 *   1. último paso → 'note'
 *   2. cambio de sección → 'section-transition'
 *   3. superset (mismo supersetGroup) → 'advance'
 *   4. resto → 'rest'
 */
export function nextPhaseAfterSet(args: {
  currentStep: Step
  nextStep: Step | null
  isLastStep: boolean
  stepIdx: number
}): NextPhaseResult {
  const { currentStep, nextStep, isLastStep, stepIdx } = args

  if (isLastStep) {
    return { kind: 'note' }
  }

  const currentSection = currentStep.section
  const nextSection = nextStep?.section || 'main'
  if (currentSection !== nextSection) {
    return {
      kind: 'section-transition',
      transitionType: currentSection === 'warmup' ? 'warmup-to-main' : 'main-to-cooldown',
      nextStepIdx: stepIdx + 1,
    }
  }

  const currentGroup = currentStep.exercise.supersetGroup
  const nextExGroup = nextStep?.exercise.supersetGroup
  if (currentGroup && nextExGroup && currentGroup === nextExGroup) {
    return { kind: 'advance' }
  }

  return { kind: 'rest' }
}
```

Important: `nextPhaseAfterSet` takes `stepIdx` as an argument (needed to compute
`nextStepIdx = stepIdx + 1`) so it stays pure. The component will pass its
`stepIdx` state in.

**Verify**:
- `cd apps/mobile && npm run typecheck` → exit 0, no errors.
- `cd apps/mobile && npx eslint src/lib/session-machine.ts` → exit 0, no problems.

### Step 2: Add characterization tests for `session-machine.ts`

Create `apps/mobile/src/lib/__tests__/session-machine.test.ts`, mirroring the
structure of `live-activity-state.test.ts` (`import { describe, it, expect } from 'vitest'`,
small inline fixtures, assert on return values). These tests pin CURRENT
behavior so plan 007 is safe.

Build a tiny `Exercise` fixture factory (only the fields the functions read —
`id`, `sets`, `section`, `supersetGroup`; cast with `as Exercise` since the
functions never read the other required fields). Keep `Exercise` as a
**type-only** import (it is erased at runtime — verified to resolve under vitest):

```ts
import { describe, it, expect } from 'vitest'
import type { Exercise } from '@calistenia/core/types'
import {
  buildSteps,
  computeExerciseBoundaries,
  findCurrentExerciseIndex,
  nextPhaseAfterSet,
  type Step,
} from '../session-machine'

// Fixture mínimo: las funciones solo leen id/sets/section/supersetGroup.
function ex(partial: Partial<Exercise> & { id: string }): Exercise {
  return { sets: 1, section: 'main', ...partial } as Exercise
}

function step(partial: Partial<Step> & { exercise: Exercise }): Step {
  return { setNumber: 1, totalSets: 1, section: partial.exercise.section ?? 'main', ...partial } as Step
}
```

Cover these cases (each `it` asserts a concrete value):

1. **`buildSteps` shape** — given `[ex({ id: 'a', sets: 2, section: 'warmup' }), ex({ id: 'b', sets: 'múltiples' }), ex({ id: 'c', sets: 'intentos' })]`:
   - total length is `2 + 3 + 1 = 6`.
   - the `'a'` steps have `setNumber` 1 then 2, `totalSets` 2, `section` `'warmup'`.
   - the `'b'` steps have `totalSets` 3 (the `'múltiples'` → 3 rule) and `section` `'main'` (default).
   - the `'c'` step has `totalSets` 1 (`parseInt('intentos')` is `NaN` → `|| 1`) and `section` `'main'`.
2. **`computeExerciseBoundaries` multi-set/multi-exercise** — for the 6-step
   array above, boundaries are `[0, 2, 5]` (a starts at 0, b at 2, c at 5).
   Also assert a single-exercise multi-set array `buildSteps([ex({ id: 'a', sets: 3 })])`
   gives boundaries `[0]`.
3. **`computeExerciseBoundaries` superset groups** — two distinct exercise ids in
   the same superset group still produce a boundary per id (boundaries key off
   `exercise.id`, not group). E.g.
   `buildSteps([ex({ id: 'a', sets: 1, supersetGroup: 'g1' }), ex({ id: 'b', sets: 1, supersetGroup: 'g1' })])`
   → boundaries `[0, 1]`.
4. **`findCurrentExerciseIndex`** for the boundaries `[0, 2, 5]`, `stepsLength` 6:
   - `stepIdx` 0 and 1 → index `0`.
   - `stepIdx` 2,3,4 → index `1`.
   - `stepIdx` 5 → index `2`.
   - `stepIdx` 6 (out of range) → `-1`.
   - `stepIdx` -1 (out of range) → `-1`.
5. **`nextPhaseAfterSet` — note** — `isLastStep: true` → `{ kind: 'note' }`
   (regardless of sections/superset).
6. **`nextPhaseAfterSet` — warmup→main transition** — `currentStep.section: 'warmup'`,
   `nextStep.section: 'main'`, `isLastStep: false`, `stepIdx: 3` →
   `{ kind: 'section-transition', transitionType: 'warmup-to-main', nextStepIdx: 4 }`.
7. **`nextPhaseAfterSet` — main→cooldown transition** — `currentStep.section: 'main'`,
   `nextStep.section: 'cooldown'`, `stepIdx: 7` →
   `{ kind: 'section-transition', transitionType: 'main-to-cooldown', nextStepIdx: 8 }`.
8. **`nextPhaseAfterSet` — `nextStep` null with non-main current section** — when
   `nextStep` is `null`, `nextSection` defaults to `'main'`; so a `'warmup'`
   current step with `nextStep: null` and `isLastStep: false` still yields a
   `section-transition` with `transitionType: 'warmup-to-main'` (pins the
   `nextStep?.section || 'main'` default).
9. **`nextPhaseAfterSet` — superset advance** — same section on both steps, both
   exercises share a truthy equal `supersetGroup` (`'g1'`) →
   `{ kind: 'advance' }`.
10. **`nextPhaseAfterSet` — normal rest** — same section, no superset group (or
    differing groups) → `{ kind: 'rest' }`. Add a second assertion where
    `currentGroup` is set but `nextExGroup` is undefined → still `{ kind: 'rest' }`.

**Verify**:
- `cd apps/mobile && npx vitest run src/lib/__tests__/session-machine.test.ts`
  → all new tests pass (10+ `it`s).
- `cd apps/mobile && npm run test` → all pass (the 13 pre-existing mobile tests
  plus your new file's tests).
- `cd apps/mobile && npx vitest run --dir ../../packages/core` → `Test Files 5 passed (5)`, `Tests 57 passed (57)` (unchanged — proves you broke nothing in core's consumers).
- `cd apps/mobile && npx eslint src/lib/__tests__/session-machine.test.ts` → exit 0, no problems.

### Step 3: Refactor `SessionView.tsx` to import and use the pure functions

Make these edits in `apps/mobile/src/components/SessionView.tsx`. After this
step the inline duplicates are gone and the component delegates to the module.

3a. **Add the import.** Near the existing local imports (the block ending at
line 49 with `import { RepeatTrainingButton } ...`), add:

```ts
import { buildSteps, computeExerciseBoundaries, findCurrentExerciseIndex, nextPhaseAfterSet, type Step } from '@/lib/session-machine'
```

(`@/` maps to `apps/mobile/src/` per `tsconfig.json` paths — verified.) Adding
the import at the top keeps `Step` in scope for its remaining references at
lines 78 and 450.

3b. **Delete the local `Step` interface (lines 51-56) and `buildSteps` function
(lines 58-67)** — the VERBATIM block in "Current state". They are now imported.
Leave the surrounding lines (the `import` above at 49 and `const LIME = ...` at
69) untouched. Do NOT touch the `Step` references at lines 78 and 450 — they
resolve to the imported `Step`.

3c. **Replace the inline `exerciseBoundaries` reduce** (lines 1018-1023) with a
call, preserving the `useRef(...).current` memoization wrapper:

```ts
  const exerciseBoundaries = useRef<number[]>(computeExerciseBoundaries(steps)).current
```

3d. **Replace the inline `currentExerciseIndex` findIndex** (lines 1025-1028)
with a call. Keep `hasPrevExercise`/`hasNextExercise` (lines 1029-1030) exactly
as they are:

```ts
  const currentExerciseIndex = findCurrentExerciseIndex(exerciseBoundaries, stepIdx, steps.length)
  const hasPrevExercise = currentExerciseIndex > 0
  const hasNextExercise = currentExerciseIndex < exerciseBoundaries.length - 1
```

3e. **Replace the inline post-set decision in `handleLogged`** (lines 1118-1141)
with a call to `nextPhaseAfterSet` plus a `switch` that performs the SAME side
effects in the SAME order. The lines before it (the `await onLogSet`,
`setPrCelebration`, `setSetsCount`) stay unchanged. Replace from `if (isLastStep) {`
through the closing of the final `else { setPhase('rest') }` with:

```ts
    const decision = nextPhaseAfterSet({ currentStep, nextStep, isLastStep, stepIdx })
    switch (decision.kind) {
      case 'note':
        setPhase('note')
        return
      case 'section-transition':
        setTransitionType(decision.transitionType)
        pendingStepIdx.current = decision.nextStepIdx
        setPhase('section-transition')
        return
      case 'advance':
        setStepIdx(i => i + 1)
        setPhase('exercise')
        return
      case 'rest':
        setPhase('rest')
        return
    }
```

Leave the `useCallback` dependency array `[currentStep, isLastStep, nextStep, onLogSet, workoutKey, stepIdx]`
unchanged — all those identifiers are still referenced.

3f. Confirm no other code references a now-deleted local symbol. The only local
symbols removed are the file-local `Step` interface and `buildSteps` function
(now imported). `buildSteps` is still called at line 968 (`useRef<Step[]>(buildSteps(workout.exercises))`)
— it now resolves to the import. `Step` is still referenced as a type at lines
78 and 450 — those now resolve to the imported `Step`. Both are correct.

**Verify**:
- `cd apps/mobile && npm run typecheck` → exit 0, no errors.
- `grep -n "function buildSteps" apps/mobile/src/components/SessionView.tsx` →
  no matches (the local definition is gone).
- `grep -n "interface Step" apps/mobile/src/components/SessionView.tsx` →
  no matches (the local `Step` interface is gone).
- `grep -n "steps.reduce<number\[\]>" apps/mobile/src/components/SessionView.tsx` →
  no matches (inline boundaries reduce is gone).
- `grep -n "from '@/lib/session-machine'" apps/mobile/src/components/SessionView.tsx` →
  exactly one match.
- `cd apps/mobile && npx eslint src/components/SessionView.tsx` → exit 1 (the
  pre-existing errors remain) but the summary line shows **at most**
  `74 problems` (≤ baseline of `72 errors, 2 warnings`). If the count went UP,
  your edit introduced a new lint error — fix it (do not touch unrelated lines);
  if you cannot get back to ≤ 74, STOP and report.

### Step 4: Full verification

Run the full gate. Behavior is unchanged; all tests still pass.

**Verify**:
- `cd apps/mobile && npm run typecheck` → exit 0.
- `cd apps/mobile && npm run test` → all pass (pre-existing 13 + your new tests).
- `cd apps/mobile && npx vitest run --dir ../../packages/core` → `Test Files 5 passed (5)`, `Tests 57 passed (57)`.
- `cd apps/mobile && npx eslint src/lib/session-machine.ts src/lib/__tests__/session-machine.test.ts` → exit 0, no problems.
- `cd apps/mobile && npx eslint src/components/SessionView.tsx` → `≤ 74 problems` (not increased from baseline).
- `git status --porcelain` → shows ONLY the in-scope paths
  (`apps/mobile/src/lib/session-machine.ts`,
  `apps/mobile/src/lib/__tests__/session-machine.test.ts`,
  `apps/mobile/src/components/SessionView.tsx`, and `advisor-plans/README.md`)
  plus the pre-existing untracked `scripts/seed-social-notif-test.mjs` and the
  pre-existing untracked `advisor-plans/00X-*.md` files (all of which were
  already present; do NOT add, remove, or modify them).

## Test plan

- **New tests** in `apps/mobile/src/lib/__tests__/session-machine.test.ts`,
  modeled structurally on `apps/mobile/src/lib/__tests__/live-activity-state.test.ts`
  (`describe/it/expect` from `'vitest'`, inline fixtures, pure assertions, no
  React render). Cases listed in Step 2 (items 1-10): `buildSteps` shape
  including the `'múltiples'`→3 and non-numeric→1 rules; boundaries for
  multi-set/multi-exercise and superset-group inputs; `findCurrentExerciseIndex`
  in-range indices and `-1` only out-of-range; `nextPhaseAfterSet` for every
  branch (note, warmup→main, main→cooldown, `nextStep` null default, superset
  advance, normal rest, and the partial-group → rest edge).
- **Structural pattern to copy**: `apps/mobile/src/lib/__tests__/live-activity-state.test.ts`.
- **No render tests are possible** (no RN render infra); all tests assert on the
  return values of the pure functions only.
- **Verification**: `cd apps/mobile && npm run test` → all pass, including the
  new `session-machine.test.ts` cases. The pre-existing 13 mobile tests must
  still pass (you changed no other test).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `apps/mobile/src/lib/session-machine.ts` exists and exports `Step`,
      `buildSteps`, `computeExerciseBoundaries`, `findCurrentExerciseIndex`,
      `nextPhaseAfterSet`, and the `NextPhaseResult` type.
- [ ] `apps/mobile/src/lib/session-machine.ts` contains no React imports:
      `grep -nE "from 'react'|from 'react-native'|useState|useRef|useCallback|useMemo|useEffect" apps/mobile/src/lib/session-machine.ts` → no matches.
- [ ] `cd apps/mobile && npm run typecheck` exits 0.
- [ ] `cd apps/mobile && npm run test` exits 0; new tests in
      `session-machine.test.ts` exist and pass.
- [ ] `cd apps/mobile && npx vitest run --dir ../../packages/core` → 5 files / 57 tests pass (unchanged).
- [ ] `cd apps/mobile && npx eslint src/lib/session-machine.ts src/lib/__tests__/session-machine.test.ts` exits 0 (the two NEW files lint clean).
- [ ] `cd apps/mobile && npx eslint src/components/SessionView.tsx` reports `≤ 74 problems` (no new lint errors introduced; baseline is 74).
- [ ] `grep -n "function buildSteps" apps/mobile/src/components/SessionView.tsx` returns no matches.
- [ ] `grep -n "interface Step" apps/mobile/src/components/SessionView.tsx` returns no matches.
- [ ] `grep -n "steps.reduce<number\[\]>" apps/mobile/src/components/SessionView.tsx` returns no matches.
- [ ] `grep -n "from '@/lib/session-machine'" apps/mobile/src/components/SessionView.tsx` returns exactly one match.
- [ ] `git status --porcelain` shows no modified/created files outside the four
      in-scope paths (the pre-existing untracked `scripts/seed-social-notif-test.mjs`
      and `advisor-plans/00X-*.md` files may remain untracked and untouched).
- [ ] `advisor-plans/README.md` status row for plan 006 is present and updated
      (add a new row if one does not already exist).

## STOP conditions

Stop and report back (do not improvise) if:

- The Drift check shows any in-scope file changed since `943f558`, OR any
  VERBATIM excerpt in "Current state" no longer matches the live code (the
  codebase drifted). In particular: the `Step` interface (lines 51-56),
  `buildSteps` (lines 58-67), the boundaries reduce (1018-1023), the `findIndex`
  (1025-1028), or the `handleLogged` branch block (1111-1142) differ from the
  excerpts.
- `buildSteps` or any extracted snippet turns out to reference component state,
  props, or a closure variable (i.e. it is NOT pure). Per the excerpts it is
  pure, but if reality differs, the function cannot be moved as-is — STOP and
  report rather than refactor the surrounding component.
- The `Exercise`/`Step` types are structured differently than the excerpts
  assume (e.g. `sets` is not `number | string`, `section` is not the
  three-value union, or `supersetGroup` is gone). Type changes would alter the
  pure functions' contracts — STOP.
- Extracting the post-set decision would change the branch ORDER or any
  condition (note → section-transition → superset → rest). The order is the
  contract; if you cannot preserve it exactly, STOP.
- `cd apps/mobile && npx eslint src/components/SessionView.tsx` reports MORE than
  74 problems after your edit AND you cannot reduce it back to ≤ 74 without
  touching out-of-scope/pre-existing-error lines.
- Any verification command (typecheck, tests, new-file lint) fails twice after a
  reasonable fix attempt.
- The refactor appears to require touching `packages/core` or any
  `SessionView.tsx` region outside the four extracted snippets (the `Step`
  references at lines 78 and 450 are NOT a region to change — they keep working
  via the import).

## Maintenance notes

- This module is the **foundation for plan 007** (view-component extraction from
  `SessionView`). Keep `session-machine.ts` strictly pure (no React) so plan 007
  can extract render components and test them via these same pure helpers.
- A reviewer should scrutinize that `nextPhaseAfterSet`'s `switch` in
  `SessionView.tsx` performs identical side effects to the old inline branches —
  same `setPhase`/`setStepIdx`/`setTransitionType`/`pendingStepIdx.current`
  calls, same `return` placement. The characterization tests pin the *decision*,
  but the component-side side-effect wiring is verified only by typecheck +
  lint-count here, so read that diff carefully.
- The repo-wide `npm run lint` is already red on the baseline (196 errors,
  unrelated to this work). This plan therefore gates lint per-file. If/when the
  team cleans up the lint baseline, a generic "lint exit 0" gate can replace the
  per-file checks here.
- The `'múltiples'` literal (Spanish) is load-bearing in `buildSteps`; it is the
  exact key produced upstream. If the data layer ever localizes that key, the
  `=== 'múltiples'` check and its test (item 1) must be revisited.
- Deferred out of this plan: extracting `hasPrev/hasNextExercise`,
  `goToPrev/goToNextExercise`, and any rendering — those belong to plan 007
  because they wrap React state.
- Note for the index maintainer: `packages/core` has no `test` script and no
  vitest; core tests are run via mobile's vitest with
  `--dir ../../packages/core`. Document this if a generic "run all tests" task
  is added later.
