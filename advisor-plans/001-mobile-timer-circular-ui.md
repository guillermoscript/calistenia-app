# Plan 001: Mobile timed-exercise timer matches web — blue circular ring + 3s pre-countdown

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 186f071..HEAD -- apps/mobile/src/components/SessionView.tsx`
> If `SessionView.tsx` changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on a
> mismatch in the `ExerciseTimer` function or its imports, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt / direction (UI parity)
- **Planned at**: commit `186f071`, 2026-06-15
- **Branch context**: this work is on `feat/mobile-data-perf` (the current branch). The file is committed there; no need to checkout another branch.

## Why this matters

The native app's timed exercises (`exercise.isTimer === true`, e.g. plank, hollow
hold, wall sit) render a bare timer: a number plus three round icon buttons. The
web app renders a polished **circular countdown ring** with a **3-second
"Prepárate" pre-countdown**, phase-based colors (blue idle → amber countdown →
lime running → red urgent → emerald done), and a done checkmark. The user wants
the native screen to match the web's professional look.

This is pure UI parity — same behavior, same i18n strings, same sounds/haptics
the native app already uses elsewhere. The native `RestScreen` in the **same
file** already implements the exact SVG-ring pattern this plan needs, so there is
a proven local exemplar to copy.

## Current state

Single file in scope: `apps/mobile/src/components/SessionView.tsx`.

### 1. The component to replace — `ExerciseTimer` (lines 225–284)

```tsx
// ─── Timer simple para ejercicios isTimer ─────────────────────────────────────

function ExerciseTimer({ initialSeconds = 30 }: { initialSeconds?: number }) {
  const [remaining, setRemaining] = useState(initialSeconds)
  const [running, setRunning] = useState(false)
  const endAtRef = useRef<number>(0)

  const lastRemRef = useRef<number>(initialSeconds)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const rem = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
      const prev = lastRemRef.current
      if (rem !== prev) {
        if (prev > 10 && rem <= 10 && rem > 0) sounds.playWarning()
        if (rem > 0 && rem <= 3 && prev === rem + 1) sounds.playCountdownTick()
        lastRemRef.current = rem
      }
      setRemaining(rem)
      if (rem <= 0) {
        setRunning(false)
        sounds.playTimerComplete()
        haptic.success()
      }
    }, 250)
    return () => clearInterval(id)
  }, [running])

  const toggle = () => {
    if (running) {
      setRunning(false)
    } else {
      endAtRef.current = Date.now() + (remaining > 0 ? remaining : initialSeconds) * 1000
      if (remaining <= 0) setRemaining(initialSeconds)
      setRunning(true)
    }
  }
  const reset = () => {
    setRunning(false)
    setRemaining(initialSeconds)
  }

  const mins = Math.floor(remaining / 60)
  const secs = String(remaining % 60).padStart(2, '0')

  return (
    <View className="flex-row items-center justify-center gap-4 py-3">
      <Text className={cn('font-bebas text-[44px] leading-none tracking-[2px] tabular-nums', remaining === 0 ? 'text-lime' : 'text-foreground')}>
        {mins}:{secs}
      </Text>
      <Pressable onPress={toggle} className="size-12 items-center justify-center rounded-full bg-lime/15" accessibilityLabel={running ? 'Pausar' : 'Iniciar'}>
        {running ? <Pause size={20} color={LIME} /> : <Play size={20} color={LIME} fill={LIME} />}
      </Pressable>
      <Pressable onPress={reset} className="size-12 items-center justify-center rounded-full bg-muted" accessibilityLabel="Reiniciar">
        <RotateCcw size={18} color={MUTED} />
      </Pressable>
    </View>
  )
}
```

### 2. The proven ring exemplar — `RestScreen` ring block (lines 168–198, SAME file)

This is the SVG ring pattern to copy. Note: **no reanimated is used for the ring** —
the progress `Circle`'s `strokeDashoffset` is recomputed on every render (the
250 ms tick triggers re-render). Copy this approach; do NOT introduce reanimated.

```tsx
  const pct = totalSecs > 0 ? remaining / totalSecs : 0
  const ringR = 62
  const ringSize = 148
  const ringStroke = 7
  const circumference = 2 * Math.PI * ringR
  const strokeOffset = circumference * (1 - pct)
  const isUrgent = remaining > 0 && remaining < 10
  // ...
      <View style={{ width: ringSize, height: ringSize }}>
        <Svg width={ringSize} height={ringSize} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none"
            stroke={MUTED} strokeOpacity={0.25} strokeWidth={ringStroke} />
          <Circle
            cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none"
            stroke={isUrgent ? 'hsl(0 84% 60%)' : LIME}
            strokeWidth={ringStroke}
            strokeDasharray={`${circumference}`}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className={cn('font-bebas text-[46px] tracking-[2px] tabular-nums leading-none', isUrgent ? 'text-destructive' : 'text-foreground')}>
            {mins}:{secs}
          </Text>
        </View>
      </View>
```

### 3. The web component being ported — `apps/web/src/components/Timer.tsx`

Read it for reference (it is OUT of scope — do not edit it). Its behavior, which
this plan reproduces in RN:

- Phases: `idle → countdown → running → paused → done`.
- 3-second pre-countdown (counts `3,2,1`) before the exercise timer runs, with a
  big amber number and a "Prepárate" label (`t('timer.getReady')`).
- Phase ring colors:
  - done → `hsl(160 84% 60%)` (emerald)
  - countdown → `hsl(45 93% 58%)` (amber)
  - urgent (running, remaining ≤ 10) → `hsl(0 84% 60%)` (red / destructive)
  - running → lime
  - idle → `hsl(199 89% 62%)` (**blue** — this is the "blue circle" the user asked for)
- During countdown the ring is full (offset 0) in amber.
- Done shows a checkmark inside the ring.
- Time-adjust buttons (`-15s / +15s / +30s`) shown only when `idle` or `paused`.
- Controls: Start / Pause / Resume / Repeat, plus a Reset (↺) when paused or done.
- Sounds/haptics: tick on each countdown number, warning when crossing into ≤10s,
  tick at 3/2/1, completion sound + success haptic at 0.

### 4. The call site — line 398

```tsx
      {/* Timer para ejercicios de tiempo */}
      {exercise.isTimer && <ExerciseTimer initialSeconds={exercise.timerSeconds || 30} />}
```

### 5. Imports line — line 17

```tsx
import { ChevronLeft, ChevronRight, X, Play, Pause, RotateCcw } from 'lucide-react-native'
```

After the rewrite, `Play` and `Pause` are no longer used **anywhere** in the file
(confirmed: their only use is line 277 inside the old `ExerciseTimer`). They must
be removed from this import or `expo lint` will flag them as unused. `RotateCcw`
stays (the new component still uses it). `Check` must be **added** (used for the
done checkmark; `Check` is a valid `lucide-react-native` export — already used in
`apps/mobile/src/app/cardio.tsx`).

### Conventions to match (all already present in this file)

- `Text` from `@/components/ui/text`, `Button` from `@/components/ui/button`,
  `cn` from `@/lib/utils` — already imported at top of file.
- Module-level color constants exist: `const LIME = 'hsl(74 90% 45%)'` and
  `const MUTED = 'hsl(0 0% 55%)'` (lines 57–58). Reuse them; add new color
  constants next to them.
- Sounds: `sounds.playCountdownTick()`, `sounds.playGetReady()`,
  `sounds.playWarning()`, `sounds.playTimerComplete()` — all exist in
  `apps/mobile/src/lib/sounds.ts`.
- Haptics: `haptic.light()`, `haptic.warning()`, `haptic.success()` — all exist
  in `apps/mobile/src/lib/haptics.ts` (imported as `haptic`).
- i18n: `t('timer.getReady')`, `t('timer.start')`, `t('timer.pause')`,
  `t('timer.resume')`, `t('timer.repeat')`, `t('timer.reset')`, `t('timer.rest')`
  — all exist in `packages/core/locales/{es,en}/translation.json` (lines
  1977–1984). `useTranslation()` is already imported and used throughout the file.
- `AppState` is already imported (line 5) and used by `RestScreen` for
  re-sync-on-foreground; the new timer uses the same pattern.
- Tailwind tokens `text-destructive`, `text-foreground`, `text-muted-foreground`,
  `text-lime`, `bg-muted` resolve (see `apps/mobile/tailwind.config.js`).

## Commands you will need

| Purpose   | Command (run from `apps/mobile/`) | Expected on success |
|-----------|-----------------------------------|---------------------|
| Typecheck | `npm run typecheck`               | exit 0, no errors   |
| Lint      | `npm run lint`                    | exit 0, no new warnings about `SessionView.tsx` |
| Tests     | `npm test`                        | exit 0 (no test specifically covers this; just confirm nothing breaks) |

There is no runtime/emulator step in this plan — the maintainer will visually
verify on device. Do NOT attempt to build/run the Expo app.

## Suggested executor toolkit

- If available, use `vercel-react-native-skills` for the timer/effect patterns.

## Scope

**In scope** (only file you may modify):
- `apps/mobile/src/components/SessionView.tsx` — rewrite the `ExerciseTimer`
  function (lines 225–284), update its call site (line 398), update the
  `lucide-react-native` import (line 17).

**Out of scope** (do NOT touch):
- `apps/web/src/components/Timer.tsx` — reference only.
- `RestScreen` / `NoteScreen` / `CelebrateScreen` / any other component in the
  file — leave untouched.
- `apps/mobile/src/lib/sounds.ts`, `haptics.ts`, i18n files — they already have
  everything needed; do not add keys or sounds.
- The shared locale JSON in `packages/core/locales/` — the `timer.*` keys already
  exist. Do not edit.

## Git workflow

- You are already on `feat/mobile-data-perf`. Stay on it; do NOT create a new
  branch unless the maintainer asks.
- Stage with explicit paths only: `git add apps/mobile/src/components/SessionView.tsx`.
  Never `git add -A`.
- Do NOT commit, push, merge, or rebase unless the maintainer explicitly says so.

## Steps

### Step 1: Update the `lucide-react-native` import (line 17)

Replace:

```tsx
import { ChevronLeft, ChevronRight, X, Play, Pause, RotateCcw } from 'lucide-react-native'
```

with:

```tsx
import { ChevronLeft, ChevronRight, X, RotateCcw, Check } from 'lucide-react-native'
```

(Removed `Play`, `Pause`; added `Check`.)

**Verify**: `grep -n "lucide-react-native" apps/mobile/src/components/SessionView.tsx`
→ shows the new line with `Check` and without `Play`/`Pause`.

### Step 2: Add color constants next to the existing `LIME`/`MUTED` (after line 58)

Below `const MUTED = 'hsl(0 0% 55%)'` add:

```tsx
// Phase colors del Timer de ejercicios cronometrados (paridad con web Timer.tsx)
const TIMER_IDLE_BLUE = 'hsl(199 89% 62%)'
const TIMER_COUNTDOWN_AMBER = 'hsl(45 93% 58%)'
const TIMER_URGENT_RED = 'hsl(0 84% 60%)'
const TIMER_DONE_EMERALD = 'hsl(160 84% 60%)'
const TIMER_RING_SIZE = 180
const TIMER_RING_STROKE = 8
const TIMER_RING_R = (TIMER_RING_SIZE - TIMER_RING_STROKE) / 2
const TIMER_RING_CIRC = 2 * Math.PI * TIMER_RING_R
```

**Verify**: `grep -n "TIMER_IDLE_BLUE" apps/mobile/src/components/SessionView.tsx`
→ one match.

### Step 3: Replace the entire `ExerciseTimer` function (lines 225–284)

Replace the whole block from the comment header
`// ─── Timer simple para ejercicios isTimer ───...` down to the closing `}` of
`ExerciseTimer` (the line right before `// ─── Exercise screen ───...`) with this:

```tsx
// ─── Timer circular para ejercicios isTimer (paridad con web Timer.tsx) ───────

type TimerPhase = 'idle' | 'countdown' | 'running' | 'paused' | 'done'

function ExerciseTimer({ initialSeconds = 30, label }: { initialSeconds?: number; label?: string }) {
  const { t } = useTranslation()
  const effectiveLabel = label ?? t('timer.rest')
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds)
  const [remaining, setRemaining] = useState(initialSeconds)
  const [phase, setPhase] = useState<TimerPhase>('idle')
  const [countdownNum, setCountdownNum] = useState(3)
  const endAtRef = useRef<number>(0)
  const lastRemRef = useRef<number>(initialSeconds)
  const hasWarnedRef = useRef<boolean>(false)

  // Pre-cuenta 3·2·1 antes de arrancar (igual que web)
  useEffect(() => {
    if (phase !== 'countdown') return
    setCountdownNum(3)
    sounds.playCountdownTick()
    haptic.light()
    const id = setInterval(() => {
      setCountdownNum(n => {
        if (n <= 1) {
          clearInterval(id)
          endAtRef.current = Date.now() + remaining * 1000
          lastRemRef.current = remaining
          hasWarnedRef.current = false
          sounds.playGetReady()
          setPhase('running')
          return 0
        }
        sounds.playCountdownTick()
        haptic.light()
        return n - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cuenta atrás del ejercicio — por timestamp, sobrevive backgrounding
  useEffect(() => {
    if (phase !== 'running') return
    const tick = () => {
      const rem = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
      const prev = lastRemRef.current
      if (rem !== prev) {
        if (prev > 10 && rem <= 10 && rem > 0 && !hasWarnedRef.current) {
          hasWarnedRef.current = true
          sounds.playWarning()
          haptic.warning()
        }
        if (rem > 0 && rem <= 3 && prev === rem + 1) {
          sounds.playCountdownTick()
          haptic.light()
        }
        lastRemRef.current = rem
        setRemaining(rem)
      }
      if (rem <= 0) {
        finishTimer()
      }
    }
    const finishTimer = () => {
      setRemaining(0)
      setPhase('done')
      sounds.playTimerComplete()
      haptic.success()
    }
    const id = setInterval(tick, 250)
    const sub = AppState.addEventListener('change', s => { if (s === 'active') tick() })
    return () => { clearInterval(id); sub.remove() }
  }, [phase])

  const start = () => {
    if (phase === 'done') {
      setRemaining(totalSeconds)
      lastRemRef.current = totalSeconds
      setPhase('countdown')
      return
    }
    if (phase === 'paused') {
      endAtRef.current = Date.now() + remaining * 1000
      lastRemRef.current = remaining
      setPhase('running')
      return
    }
    setPhase('countdown')
  }
  const pause = () => setPhase('paused')
  const reset = () => {
    setPhase('idle')
    setRemaining(totalSeconds)
    lastRemRef.current = totalSeconds
  }
  const adjust = (delta: number) => {
    const nt = Math.max(5, totalSeconds + delta)
    setTotalSeconds(nt)
    const nr = Math.max(1, remaining + delta)
    setRemaining(nr)
    lastRemRef.current = nr
  }

  const isUrgent = phase === 'running' && remaining > 0 && remaining <= 10
  const pct = totalSeconds > 0 ? (phase === 'done' ? 0 : remaining) / totalSeconds : 0
  const strokeOffset = TIMER_RING_CIRC * (1 - pct)
  const ringColor =
    phase === 'done' ? TIMER_DONE_EMERALD :
    phase === 'countdown' ? TIMER_COUNTDOWN_AMBER :
    isUrgent ? TIMER_URGENT_RED :
    phase === 'running' ? LIME :
    TIMER_IDLE_BLUE
  const mins = Math.floor(remaining / 60)
  const secs = String(remaining % 60).padStart(2, '0')

  return (
    <View className="items-center gap-4 py-3">
      <View style={{ width: TIMER_RING_SIZE, height: TIMER_RING_SIZE }}>
        <Svg width={TIMER_RING_SIZE} height={TIMER_RING_SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={TIMER_RING_SIZE / 2} cy={TIMER_RING_SIZE / 2} r={TIMER_RING_R} fill="none"
            stroke={MUTED} strokeOpacity={0.25} strokeWidth={TIMER_RING_STROKE} />
          <Circle
            cx={TIMER_RING_SIZE / 2} cy={TIMER_RING_SIZE / 2} r={TIMER_RING_R} fill="none"
            stroke={ringColor}
            strokeWidth={TIMER_RING_STROKE}
            strokeDasharray={`${TIMER_RING_CIRC}`}
            strokeDashoffset={phase === 'countdown' ? 0 : strokeOffset}
            strokeLinecap="round"
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          {phase === 'countdown' ? (
            <Text className="font-bebas text-[72px] leading-none" style={{ color: TIMER_COUNTDOWN_AMBER }}>
              {countdownNum}
            </Text>
          ) : phase === 'done' ? (
            <Check size={48} color={TIMER_DONE_EMERALD} strokeWidth={2.5} />
          ) : (
            <View className="items-center">
              <Text
                className={cn('font-bebas leading-none tabular-nums', isUrgent ? 'text-destructive' : 'text-foreground')}
                style={{ fontSize: remaining >= 600 ? 36 : 44 }}
              >
                {mins}:{secs}
              </Text>
              <Text className="mt-1 font-mono text-[10px] tracking-[2px] text-muted-foreground">
                {effectiveLabel.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </View>

      {phase === 'countdown' && (
        <Text className="font-mono text-[11px] uppercase tracking-[3px]" style={{ color: TIMER_COUNTDOWN_AMBER }}>
          {t('timer.getReady')}
        </Text>
      )}

      {(phase === 'idle' || phase === 'paused') && (
        <View className="flex-row gap-1.5">
          <Button variant="outline" size="sm" onPress={() => adjust(-15)}>
            <Text className="font-mono text-[10px] text-muted-foreground">-15s</Text>
          </Button>
          <Button variant="outline" size="sm" onPress={() => adjust(15)}>
            <Text className="font-mono text-[10px] text-muted-foreground">+15s</Text>
          </Button>
          <Button variant="outline" size="sm" onPress={() => adjust(30)}>
            <Text className="font-mono text-[10px] text-muted-foreground">+30s</Text>
          </Button>
        </View>
      )}

      {phase !== 'countdown' && (
        <View className="flex-row gap-2.5">
          {phase === 'running' ? (
            <Button variant="ghost" size="sm" onPress={pause}>
              <Text className="font-mono text-[11px] tracking-[2px] text-destructive">{t('timer.pause')}</Text>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onPress={start}>
              <Text className="font-mono text-[11px] tracking-[2px] text-lime">
                {phase === 'done' ? t('timer.repeat') : phase === 'paused' ? t('timer.resume') : t('timer.start')}
              </Text>
            </Button>
          )}
          {(phase === 'paused' || phase === 'done') && (
            <Button variant="outline" size="sm" onPress={reset} accessibilityLabel={t('timer.reset')}>
              <RotateCcw size={16} color={MUTED} />
            </Button>
          )}
        </View>
      )}
    </View>
  )
}
```

**Verify**:
- `grep -n "finishTimer" apps/mobile/src/components/SessionView.tsx` → **two matches** (declaration + call).
- `grep -n "function ExerciseTimer" apps/mobile/src/components/SessionView.tsx` → one match.

### Step 4: Pass the exercise name as the timer label (call site, ~line 398)

Replace:

```tsx
      {exercise.isTimer && <ExerciseTimer initialSeconds={exercise.timerSeconds || 30} />}
```

with:

```tsx
      {exercise.isTimer && <ExerciseTimer initialSeconds={exercise.timerSeconds || 30} label={exercise.name} />}
```

**Verify**: `grep -n "ExerciseTimer initialSeconds" apps/mobile/src/components/SessionView.tsx`
→ shows the new line with `label={exercise.name}`.

### Step 5: Typecheck and lint

**Verify**:
- `cd apps/mobile && npm run typecheck` → exit 0, no errors.
- `cd apps/mobile && npm run lint` → exit 0; no new warnings referencing
  `SessionView.tsx` (specifically no "unused var" for `Play`/`Pause`, and no
  unused `countdownNum`/`Check`).

## Test plan

There is no existing unit test for `SessionView` timers (test runner is `vitest`,
and the suite does not cover this RN screen). Do **not** add a new test suite —
RN component tests are not set up in this package, and adding one is out of scope.

Verification is the typecheck + lint gates above, plus the maintainer's manual
device check (they will confirm: blue idle ring, 3·2·1 amber pre-countdown with
"Prepárate", lime ring while running, red under 10s, emerald checkmark at 0).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd apps/mobile && npm run typecheck` exits 0
- [ ] `cd apps/mobile && npm run lint` exits 0 with no new `SessionView.tsx` warnings
- [ ] `grep -n "Play\|Pause" apps/mobile/src/components/SessionView.tsx` returns
      **no** matches for the lucide icons `Play`/`Pause` (the words may still
      appear inside `playWarning`/`hasPlayedWarning`/`AppState` — those are fine;
      what must be gone is the `lucide-react-native` `Play`/`Pause` import and the
      `<Play .../> / <Pause .../>` JSX)
- [ ] `grep -c "TimerPhase" apps/mobile/src/components/SessionView.tsx` ≥ 2
- [ ] Only `apps/mobile/src/components/SessionView.tsx` is modified (`git status --porcelain` shows just that file under `apps/mobile/`)
- [ ] `advisor-plans/README.md` status row for plan 001 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The `ExerciseTimer` function or the line-17 import does not match the "Current
  state" excerpts (the file drifted since commit `186f071`).
- `npm run typecheck` reports an error you cannot resolve by a small, in-scope
  fix within two attempts (e.g. `Check` is not exported by the installed
  `lucide-react-native` version — if so, fall back to rendering the checkmark
  with a `react-native-svg` `<Path d="M20 6 9 17 4 12" stroke={TIMER_DONE_EMERALD} .../>`
  inside a rotated-back `<Svg>`, and report that you did so).
- `t('timer.getReady')` or any `timer.*` key renders as the raw key string at
  runtime — that would mean i18n resolution differs from web; report it (do not
  hardcode Spanish strings as a workaround).

## Maintenance notes

For whoever owns this code next:

- The timer is intentionally **state-driven by `phase`**, mirroring
  `apps/web/src/components/Timer.tsx`. If web's Timer gains features (e.g. a
  different urgent threshold or extra phase), port them here too to keep parity.
- The running countdown is **timestamp-based** (`endAtRef`) and re-syncs on
  `AppState` "active", so it stays correct if the user backgrounds the app
  mid-exercise — same technique as `RestScreen` in this file. Keep that property
  if you refactor.
- The pre-countdown effect intentionally depends only on `[phase]` and reads
  `remaining` from closure at the transition moment; this is sound because
  `countdown` is only ever entered with `remaining` already set to the intended
  start value (full on first run, `totalSeconds` on repeat). The
  `eslint-disable-line` is deliberate — don't "fix" it by adding `remaining` to
  the deps, which would restart the pre-countdown on every tick.
- A reviewer should scrutinize: the phase-color mapping order (done →
  countdown → urgent → running → idle), and that `Play`/`Pause` were removed from
  the import without breaking other usages.
- Deferred (not in this plan): animated countdown-number pulse and ring glow that
  web has via CSS keyframes. RN parity for those would need `reanimated`; left
  out to keep risk LOW. Revisit if the maintainer wants the full motion polish.
