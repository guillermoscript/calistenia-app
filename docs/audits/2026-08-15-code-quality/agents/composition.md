# Cross-cutting component-API audit (web + mobile reusable component layers)

Scope: `apps/web/src/components/ui/`, `apps/web/src/components/*.tsx` (top-level shared),
`apps/mobile/src/components/ui/`, `training/`, `session/`, `share/`, `ai-elements/` in both
apps, plus the top ~25 most-imported components in each app (measured by import count).

Reference rules read in full: `.agents/skills/vercel-composition-patterns/SKILL.md` + all 8
`rules/*.md`; `vercel-react-best-practices/rules/rerender-*.md` + `rendering-*.md`.

**React version check (gates `react19-no-forwardref`):** `apps/web/package.json` → `"react": "^19.2.8"`,
`apps/mobile/package.json` → `"react": "19.2.8"`. **React 19 in both apps**, so `forwardRef` and
`useContext` are flaggable everywhere.

## Grade

**C.** The two apps are living in different eras of the same design system. Mobile's
`training/` + `ui/` layer is genuinely good composition (primitives + callbacks, `children`
slots, `use()`, memoized rows). Web's `ui/` layer is half-fake: **11 of its 32 "shadcn"
primitives are no-op `<div>` stubs typed `any` behind `forwardRef`**, and the real reuse
lives in 1300-line god components that drill 24 props through 4 levels while the provider
that owns that state is already mounted one component up. Add ~9,000 lines of unused vendored
`ai-elements` and 4 copy-pasted share-button pipelines and the reusable layer is doing less
work than its file count suggests.

## Top 3 refactors

1. **Delete or implement `apps/web/src/components/ui/` stubs.** 11 files
   (`select`, `dropdown-menu`, `popover`, `hover-card`, `command`, `accordion`, `collapsible`,
   `carousel`, `avatar`, `input-group`, `switch`) render `<div className={cn("", className)}>`
   with zero behavior; 10 are imported by nobody and `spinner` is imported twice and renders an
   *invisible* spinning empty div. They are the single biggest source of `forwardRef` + `any` in
   the repo. Delete the unused 10, implement `spinner`, and the whole `react19-no-forwardref`
   finding disappears with them.
2. **Give web the same variant vocabulary mobile has, then stop hand-classing it.**
   `apps/mobile/src/components/ui/button.tsx:46-61` has `lime` / `limeSolid` / `danger`
   variants; web's `button.tsx:11-21` has none — so there are **68 `<Button className="…lime…">`**
   in web and 453 raw `lime` class strings overall. Same story for `Kicker` (exists on web, used
   7 times, 98 raw copies remain; mobile has no `Kicker` at all and 275+ raw copies) and
   `Loader`/`EmptyState` (each exists on exactly one platform).
3. **Lift the session state instead of drilling it.** `ActiveSessionPage.tsx:76-101` reads 13
   values out of `useActiveSession()` and re-passes them as individual props into a 26-prop
   `SessionView`, which drills `userName/avatarUrl/userId/referralCode` two levels further into
   `CelebrateScreen` → `PostWorkoutActions`. The provider is already there; the leaves should
   `use()` it (`state-lift-state`, `state-decouple-implementation`).

---

## Required table

| Component | platform | #boolean props | forwardRef? | inline components? | verdict |
|---|---|---|---|---|---|
| `ui/select`, `ui/dropdown-menu`, `ui/popover`, `ui/hover-card`, `ui/command`, `ui/accordion`, `ui/collapsible`, `ui/carousel`, `ui/avatar`, `ui/input-group` | web | n/a (`any`) | **yes, `forwardRef<_, any>`** | no | **DELETE** — no-op stubs, zero importers |
| `ui/switch` | web | n/a (`any`) | **yes** | no | **DELETE** — an inert `<button>` named Switch |
| `ui/spinner` | web | n/a (`any`) | **yes** | no | **BROKEN** — invisible; 2 live importers |
| `ui/button` | web | 1 (`asChild`) | no (`ref` prop ✓) | no | OK, but missing `lime`/`danger` variants |
| `ui/card` | web | 0 | no | no | OK; `CardAction` typed `any`, unused |
| `ui/input`, `ui/badge`, `ui/textarea`, `ui/label`, `ui/skeleton` | web | 0 | no | no | Good |
| `ui/kicker` | web | 0 | n/a | no | **Exemplary** — the model for the rest |
| `ui/loader` | web | 1 (`fullScreen`) | n/a | no | OK; `fullScreen` should be a wrapper |
| `ui/dialog` / `ui/sheet` | web | 1 (`hideClose`) | no | no | OK; `hideClose` → compose `DialogClose` |
| `ui/confirm-dialog` | web | 2 (`open`, `loading`) | n/a | no | Variant fight: `variant="outline"` + full className override |
| `ui/sidebar` | web | 2–3 per subcomponent | no | no | OK; dead SSR cookie, unstable `setOpen` |
| `ui/button-group`, `ui/scroll-area` | web | 0 | **yes** | no | Functional but React-18 style |
| `SessionView` | web | 0 (26 props) | no | **no, but 5 components in one 1336-line file** | God component |
| `ExerciseCard` | web | 2 + **7 `showX` useState** | no | no | State-machine smell |
| `ShareButton` | web | 0 | no | **5 icon components in-file, 1 a byte-copy** | Duplicated icon + leaked timer |
| `onboarding/StepHealth` | web | 1 | no | **YES — `Chip` defined in render (l.37)** | `rerender-no-inline-components` |
| `ai-elements/*` (45 of 48 files) | web | many | **yes, widely** | yes | ~9,000 lines of unused vendored code |
| `ui/text` | mobile | 1 (`asChild`) | no (`use()` ✓) | no | **Exemplary** — 148 importers |
| `ui/button` | mobile | 0 | no | no | Good (9 variants, `TextClassContext`) |
| `ui/card`, `ui/input`, `ui/input-group`, `ui/skeleton`, `ui/textarea`, `ui/label` | mobile | 0 | no | no | Good |
| `ui/chip` | mobile | 1 (`active`) | no | no | Good; web has no equivalent |
| `ui/empty-state` | mobile | 0 | no | no | Good; web has no equivalent |
| `ui/option-sheet` | mobile | 1 (`visible`) | no | no | OK, but imports `Text` from `react-native` |
| `ui/one-shot-hint` | mobile | 1 (`visible`) | no | no | Good |
| `training/TimerPanel`, `RestPanel`, `RepStepper`, `CountdownRing` | mobile | 1–2 | no | no | **Exemplary** — the model for web |
| `session/RestScreen`, `TimerScreen` | mobile | 0 | no | no | Good; `TimerScreen` re-wires 12 props by hand |
| `battle/BattleStandingsList` (+Row) | mobile | **5** on the row, 1 (`scroll`) on the list | no | no | Boolean pair + container boolean |
| `battle/BattleScoreCell`, `BattleResultShareCard`, `BattleResultShareButton`, `BattleResults` | mobile | 2–3 each | `BattleResultShareCard`: **yes** | no | Same boolean pair drilled 3 levels |
| `share/WorkoutShareCard`, `PRShareCard`, `StreakShareCard` | mobile | 0 | **yes — and no caller passes a ref** | no | Dead `forwardRef` |
| `share/ShareCardCapture` | mobile | 0 | **yes** (needed for imperative handle) | no | Convert to `{ ref }` prop |
| `share/*ShareButton` ×4 | mobile | 0–1 | no | no | 4× copy-pasted capture pipeline |
| `social/CommentsSheet` | mobile | 2 on `CommentBubble` | **yes** | no | React-18 style |

---

## Findings

### High

**H1 — 11 `ui/` primitives are no-op stubs; 10 have zero importers, 1 is silently broken**
`apps/web/src/components/ui/select.tsx:4-8` (representative of all 11):
```tsx
const Select = React.forwardRef<HTMLDivElement, any>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props}>{children}</div>
  )
)
```
Identical bodies in `dropdown-menu.tsx:4`, `popover.tsx:4`, `hover-card.tsx:4`, `command.tsx:4`,
`accordion.tsx:4`, `collapsible.tsx:4`, `carousel.tsx:4`, `avatar.tsx:4`, `input-group.tsx:4`,
`switch.tsx:4`. `grep -rn "ui/<name>'"` across `apps/web/src` returns **0 importers for all of
them**. The one exception is `spinner.tsx:4-7` — `<div className={cn("animate-spin", className)}>`
with no border, no size — which *is* used at `pantry/PantryChatInput.tsx:53` and
`pantry/PantryConfirmDialog.tsx:249` (`{busy ? <Spinner className="size-4" /> : …}`), i.e. the
busy indicator is an invisible rotating empty box.
*Category: KISS (dead code) + Correctness-smell + Composition (`react19-no-forwardref`).*
**Fix:** delete the 10 unused files; replace `Spinner` with the real `Loader` at `ui/loader.tsx`.

**H2 — `forwardRef<_, any>` across 14 web `ui/` files on React 19**
53 occurrences of `forwardRef<…, any>` in `apps/web/src`, all in `components/ui/` (list above +
`button-group.tsx:4,13,22`, `scroll-area.tsx:4`). React 19 passes `ref` as a normal prop, and the
files that were modernized prove the team knows it — `button.tsx:41` (`ref?: React.Ref<HTMLButtonElement>`),
`card.tsx:5`, `dialog.tsx:30`, `tabs.tsx:8`. The `any` also disables all prop typing on these
components.
*Category: Composition (`react19-no-forwardref`) + Spaghetti (`any` abuse).*
**Fix:** drops out with H1; convert the 2 survivors (`button-group`, `scroll-area`) to `{ ref }`.

**H3 — Session state is provider-backed and drilled anyway (4 levels deep)**
`apps/web/src/pages/ActiveSessionPage.tsx:10` destructures 18 values from `useActiveSession()`,
then `:76-101` re-passes 24 props to `SessionView`:
```tsx
initialProgress={progress} onProgressChange={setProgress} startedAt={startedAt}
onSkipWarmup={skipWarmup} onSkipCooldown={skipCooldown} sectionStartTime={sectionStartTime}
```
`SessionViewProps` (`SessionView.tsx:844-876`) has 26 fields; `userName/avatarUrl/userId/referralCode`
then go to `CelebrateScreenProps` (`:692-706`) and on to `PostWorkoutActions` (`:812-815`) and
`WorkoutShareCard` (`:1229-1231`) — 4 hops from `useAuthState()` at `ActiveSessionPage.tsx:15`.
`ActiveSessionContextValue` (`contexts/ActiveSessionContext.tsx:42-79`) already publishes 12 of
the drilled values.
*Category: Composition (`state-lift-state`, `state-decouple-implementation`) + KISS (prop drilling >3).*
**Fix:** let `CelebrateScreen`/`PostWorkoutActions` `use(ActiveSessionContext)` / `useAuthState()`
directly; shrink `SessionViewProps` to `workout` + the action callbacks.

**H4 — Web reimplements three countdowns that `packages/core` already owns**
`packages/core/hooks/useCountdown.ts` and `useExerciseTimer.ts` exist and mobile consumes them
(`session/RestScreen.tsx:99`, `session/TimerScreen.tsx:16`). `grep -rn "useCountdown|useExerciseTimer" apps/web/src`
returns **nothing**. Instead: `SessionView.tsx:137-325` has a private `RestScreen` with its own
`setInterval(tick, 250)` (`:191`), and `Timer.tsx:25-28,44,64` has a fourth phase machine
(`'idle' | 'countdown' | 'running' | 'paused' | 'done'` — the same union as
`core/lib/exercise-timer`'s `TimerPhase`). This is why web has no `RestPanel`/`TimerPanel`
equivalent to mobile's excellent `training/` pair.
*Category: DRY + Separation-of-concerns.*
**Fix:** port `training/RestPanel` + `TimerPanel` shape to web as presentational components fed by
the existing core hooks.

**H5 — 45 of 48 vendored `ai-elements` files are dead, and 3 prod deps exist only for them**
`apps/web/src/components/ai-elements/` = 48 files / **9,855 lines**. The only consumer anywhere in
`apps/web/src` is `free-session/AISessionTab.tsx:10-12`, importing from `conversation`, `message`,
`shimmer`. `package.json` carries `"@xyflow/react": "^12.11.2"` (line 49), `"shiki": "^4.4.1"`
(line 78) and `"nanoid": "^6.0.0"` (line 65) — grep shows `@xyflow/react` only in
`ai-elements/{controls,toolbar,edge,panel,node,canvas}.tsx`, `shiki` only in
`ai-elements/code-block.tsx:22`, `nanoid` only in `ai-elements/prompt-input.tsx:50` — all dead files.
Mobile did this right: `apps/mobile/src/components/ai-elements/` is 7 files / 655 lines, all reachable.
*Category: KISS (dead code) + Spaghetti (the repo's `useContext`/`forwardRef` centre of gravity).*
**Fix:** keep `conversation`, `message`, `shimmer`, `response`, `loader`; delete the rest and the
3 orphan deps.

**H6 — 4 share buttons copy-paste the same capture→message→share pipeline**
`share/WorkoutShareButton.tsx:61-90`, `share/CardioShareButton.tsx:42-78`,
`share/NutritionShareButton.tsx`, `battle/BattleResultShareButton.tsx:50-75` all implement:
`useRef<ShareCardCaptureHandle>` → RAF/prefetch → `captureRef.current?.capture()` → build message →
`shareCardImage(...)` → catch. And they diverge where they shouldn't:
`WorkoutShareButton.tsx:85` swallows errors silently while `CardioShareButton.tsx:75-77` does
`console.warn`; `CardioShareButton` has no `sharing` guard at all; `WorkoutShareButton.tsx:120`
hardcodes `'GENERANDO…' / 'COMPARTIR'` in Spanish while `BattleResultShareButton.tsx:104` uses `t()`.
*Category: DRY + SOLID-SRP.*
**Fix:** one `useShareCardCapture({ buildMessage, context })` hook in `@/lib/share`, or a
`<ShareCardButton card={…}>` compound that takes the card as `children`.

### Medium

**M1 — Mutually-exclusive boolean pair `showReps`/`showSeconds` drilled through 5 components**
`battle/BattleScoreCell.tsx:28-29`, `BattleStandingsList.tsx:78-79`, `BattleResults.tsx:228-229`,
`BattleResultShareCard.tsx:39-40`, `BattleResultShareButton.tsx:27-28`. They are always the two
halves of one value — `packages/core/lib/battle.ts:174 battleWorkColumns(config)` returns
`{ reps, seconds }` — and every call site splits it back apart:
```tsx
showReps={columns.reps}
showSeconds={columns.seconds}   // BattleStandingsList.tsx:198-199
```
The stated reason (`BattleScoreCell.tsx:9`: *"Recibe primitivas, no el `score`"*) is about memo
stability, which a `useMemo`'d `columns` object already satisfies — and `BattleStandingsList.tsx:172`
already memoizes it.
*Category: Composition (`architecture-avoid-boolean-props`).*
**Fix:** pass the `columns` object (already stable) as one prop, or derive it inside `BattleScoreCell`
from a `config` in context.

**M2 — `BattleStandingsRow` takes 13 props, 5 of them boolean**
`battle/BattleStandingsList.tsx:66-80`: `isMe`, `hasLeft`, `hasFinished`, `showReps`, `showSeconds`.
`hasLeft`/`hasFinished` are a flattening of one field — `:181-182` shows
`hasLeft={entry.status === 'left'} hasFinished={entry.status === 'finished'}` — so a single
`status: BattleStanding['status']` prop would be equally memo-friendly and would make the impossible
`hasLeft && hasFinished` state unrepresentable.
*Category: Composition (`architecture-avoid-boolean-props`).*

**M3 — `scroll?: boolean` swaps the container element**
`battle/BattleStandingsList.tsx:139,202-203`:
```tsx
if (!scroll) return <View>{rowNodes}</View>
return <ScrollView className="flex-1">{rowNodes}</ScrollView>
```
Two callers, two different layout contracts, one boolean.
*Category: Composition (`patterns-explicit-variants`).*
**Fix:** return the rows and let the caller wrap, or export `BattleStandingsList` +
`ScrollableBattleStandingsList`.

**M4 — Inline component definition inside render**
`apps/web/src/components/onboarding/StepHealth.tsx:37`:
```tsx
const Chip = ({ active, label, onClick }: { active: boolean; … }) => (
```
declared inside `StepHealth`'s body (component starts at `:21`). Every render creates a new type,
so React unmounts and remounts every chip in both lists on every keystroke/toggle. It also
duplicates `apps/mobile/src/components/ui/chip.tsx`, which web has no equivalent of.
*Category: React-perf (`rerender-no-inline-components`) + DRY.*

**M5 — Web `Button` has no `lime` variant, so 68 call sites hand-class it**
`apps/web/src/components/ui/button.tsx:11-21` ships `default | destructive | outline | secondary | ghost | link`.
Mobile's `ui/button.tsx:46-61` adds `lime`, `limeSolid`, `danger` with a comment explaining the
exact twMerge hazard they solve. Web instead does this 68 times:
```tsx
// WorkoutReminderWidget.tsx:102
className="h-8 bg-lime text-lime-foreground hover:bg-lime/90 …"
// ui/confirm-dialog.tsx:68-73 — variant="outline" then overrides everything
variant === 'destructive' ? 'border border-destructive/30 …' : 'bg-lime text-lime-foreground …'
```
and it has already drifted: `pantry/PantryConfirmDialog.tsx:244` uses `bg-lime-400` (Tailwind's
palette) where everything else uses `bg-lime` (the token).
*Category: Composition (`patterns-explicit-variants`) + DRY.*

**M6 — The `Kicker` primitive exists and lost**
`ui/kicker.tsx:6-17` documents the problem verbatim ("copy-pasted ~20 times… the size drifting
between 9px and 11px"). Today: **7** `<Kicker` usages in `apps/web/src` vs **98** surviving raw
`font-mono text-[9|10|11]px … tracking-[…]` strings — and mobile, which uses the same spec-sheet
system, has **no `Kicker` at all** and **275+** raw copies.
*Category: DRY.*
**Fix:** promote `Kicker` to `packages/core` styling tokens or mirror it in `apps/mobile/src/components/ui/`,
then codemod the raw strings.

**M7 — Primitives that exist on exactly one platform**
`ui/empty-state.tsx` and `ui/chip.tsx` are mobile-only; web has 19 hand-rolled `border-dashed`
empty states. `ui/loader.tsx` and `ui/kicker.tsx` are web-only; mobile has 80 bare
`<ActivityIndicator>` usages. `ui/text.tsx` (mobile, 148 importers, provides `TextClassContext`)
has no web counterpart, which is why web repeats `font-bebas` 572 times.
*Category: DRY + Composition (inconsistent primitive vocabulary across platforms).*

**M8 — Two divergent contracts for the same "parity" component**
`apps/web/src/components/PostWorkoutActions.tsx:25-38` takes 13 props including
`workoutTitle/totalSets/durationMin/exercises/quote/avatarUrl` because it renders
`WorkoutShareCard` internally. `apps/mobile/src/components/session/PostWorkoutActions.tsx:30-43`
takes 11 and pushes sharing out to the host (`sharing: boolean; onShare: () => void`, with the
comment *"La captura de la tarjeta en curso: la comparte el host, que es quien la monta"*). The
mobile shape is the composable one; web forces every consumer to supply 6 card-only props.
*Category: SOLID-ISP + Composition.*

**M9 — `TimerScreen` re-wires a hook into 12 props by hand**
`apps/mobile/src/components/session/TimerScreen.tsx:28-41` maps every field of
`useExerciseTimer()` onto a `TimerPanel` prop one by one; `TimerPanelProps`
(`training/TimerPanel.tsx:24-38`) is 12 fields, 6 of them `onX` callbacks. This is exactly the
case `state-context-interface` addresses: a `{ state, actions, meta }` context (or simply passing
the `timer` object) would let `TimerPanel`'s sub-parts be composed and would remove the re-wiring
that has to be edited in three files every time a control is added.
*Category: Composition (`state-context-interface`, `architecture-compound-components`).*

**M10 — `forwardRef` on 4 share cards that no caller ever refs**
`share/WorkoutShareCard.tsx:92`, `share/PRShareCard.tsx:53`, `share/StreakShareCard.tsx:56`,
`battle/BattleResultShareCard.tsx:56` are all `forwardRef<View, …>`. Every render site passes no
ref — `SessionView.tsx:636`, `share/WorkoutShareButton.tsx:96`, `share/PRCelebration.tsx:82`,
`StreakMilestone.tsx:157`, `battle/BattleResultShareButton.tsx:82` — because the ref lives on the
`ShareCardCapture` wrapper instead. `ShareCardCapture.tsx:33` legitimately needs the imperative
handle but should still take `ref` as a plain prop on React 19.
*Category: Composition (`react19-no-forwardref`) + KISS (dead ceremony).*

**M11 — `useContext` everywhere on web, `use()` everywhere on mobile**
Web: `contexts/{AuthContext:37, ActiveSessionContext:365, WorkoutContext:59, CircuitSessionContext:502,
CardioSessionContext:746, RaceContext:549, NotificationsContext:18, BackgroundJobsContext:215}` +
`ui/sidebar.tsx:46` + ~25 `ai-elements` files. Mobile: zero `useContext` — `ui/text.tsx:77` and
`QuickMenu.tsx:22` both use `React.use()`. Same repo, same React version, two conventions.
*Category: Composition (`react19-no-forwardref` §use).*

**M12 — `ExerciseCard` is 7 mutually-exclusive booleans wearing a trenchcoat**
`apps/web/src/components/ExerciseCard.tsx:34-40`: `showTimer`, `showYoutube`, `showMedia`,
`showEditForm`, `showHistory`, `showProgression`, `showOverflow` — 7 independent `useState<boolean>`
(128 representable states, ~8 legal) plus 6 more form states = 15 `useState` in one 442-line
component. Props add `isAdmin` + `isFirst`.
*Category: Composition (`patterns-explicit-variants`) + React-specific (giant useState cluster
that should be a discriminated `openPanel` union).*

### Low

**L1 — Byte-identical `WhatsAppIcon` in two places**
`apps/web/src/components/ShareButton.tsx:107-113` reimplements the exact same `<path d="M17.472 14.382…">`
as `apps/web/src/components/icons/WhatsAppIcon.tsx:1-8`, which 4 other files already import.
*Category: DRY.*

**L2 — `setTimeout` never cleaned up in `ShareButton`**
`ShareButton.tsx:40`: `setTimeout(() => setCopied(false), 2000)` with no ref and no cleanup —
unmounting within 2s sets state on a dead component.
*Category: React-specific (uncleaned timer).*

**L3 — Outside-click handler hand-rolled 5 times**
`ExerciseCard.tsx:69-76`, `ShareButton.tsx:23-34`, `circuit/CircuitBuilder.tsx`,
`referrals/InviteButton.tsx`, `pages/ProgramsPage.tsx` each add/remove their own
`document.addEventListener('mousedown', …)`. `packages/core/hooks/` has 40+ hooks but no
`useOnClickOutside`. (`ShareButton` also listens for `touchstart`; the others don't — so the same
menu behaves differently on touch depending on which file you're in.)
*Category: DRY.*

**L4 — `formatDate` copy-pasted across share cards, hardcoded to `'es'`**
Identical bodies at `share/WorkoutShareCard.tsx:55-62`, `share/PRShareCard.tsx:38-47`,
`share/StreakShareCard.tsx:37-45` — all `d.toLocaleDateString('es', {weekday, day, month, year})`.
*Category: DRY.*

**L5 — Card palette constants duplicated 3×**
`INK/INK_DIM/INK_FAINT/CARD_BG/SURFACE/HAIRLINE/LIME` are re-declared in
`share/NutritionShareCard.tsx:31-38`, `share/NutritionShareButton.tsx:58-64` (same file pair!)
and partially in `share/CardioShareCard.tsx:37-40` — with drift: `INK_FAINT` is `0.40` in Cardio
and `0.38` in Nutrition. `CARD_W/CARD_H = 360/640` is re-declared in
`CardioShareButton.tsx:23-24` and `NutritionShareButton.tsx:54-55`.
*Category: DRY + magic constants.*

**L6 — Share-card prop shapes almost-but-not-quite match**
`WorkoutShareCardProps:38-53`, `StreakShareCardProps:28-35`, `CardioShareCardProps:88-94` all take
`userName / avatarUrl? / referralCode? / date? / width? / height?` around an identical
avatar-header + divider/brand/url footer (`WorkoutShareCard.tsx:227-235`,
`StreakShareCard.tsx:107-115`, `PRShareCard.tsx:121-129`, with `footerDivider/footerRow/footerBrand/footerUrl`
re-declared in each `StyleSheet.create`). `PRShareCard` alone omits `width/height`.
*Category: DRY + Composition (`architecture-compound-components`).*
**Fix:** one `ShareCardShell` with `Header`/`Body`/`Footer` slots; the 6 cards become bodies.

**L7 — `referralCode` accepted and ignored**
`share/WorkoutShareCard.tsx:104` destructures it as `referralCode: _referralCode` (explicitly
unused) while `WorkoutShareCardProps:49` still advertises it; `share/PRShareCard.tsx:54`
destructures `referralCode` and never references it again.
*Category: SOLID-ISP.*

**L8 — `ui/option-sheet` bypasses the `Text` primitive**
`apps/mobile/src/components/ui/option-sheet.tsx:6` imports `Text` from `react-native`, inside the
`ui/` folder whose whole point is `@/components/ui/text` (148 importers, supplies
`TextClassContext` + default `font-sans text-foreground`). 12 other files do the same
(`pantry/PantryTable.tsx`, `pantry/PantryEditSheet.tsx`, `onboarding/OnboardingFlow.tsx`, the share
cards…). For the share cards this is deliberate (fixed canvas); for `ui/option-sheet` it is not.
*Category: Spaghetti (inconsistent primitive usage).*

**L9 — `SidebarProvider.setOpen` reads state instead of using the functional form**
`ui/sidebar.tsx:80-96`: `const openState = typeof value === "function" ? value(open) : value` with
deps `[setOpenProp, open]` — the callback is recreated on every open change, flows into the memoized
`contextValue` (`:119-131`), and invalidates it for every consumer.
*Category: React-perf (`rerender-functional-setstate`).*
Same file `:87-89` writes `document.cookie` for SSR state restoration — a Next.js pattern with no
effect in this Vite SPA.

**L10 — External `fetch` inside a presentational screen**
`SessionView.tsx:720-728`: `CelebrateScreen` calls `fetch('https://zenquotes.io/api/random')`
directly in a `useEffect` (`.catch(() => {})`), even though `@calistenia/core/lib/quotes` is
already imported at `:30` for the local fallback.
*Category: Separation-of-concerns.*

**L11 — `CardAction` is untyped and unused**
`ui/card.tsx:54`: `function CardAction({ className, children, ref, ...props }: any)` — the only
`any` in the modernized part of `ui/`, exported at `:65`, imported by nobody.
*Category: KISS + `any` abuse.*

**L12 — Cross-feature type import**
`ExerciseCard.tsx:17`: `import type { InjuryId } from './onboarding/StepHealth'` — a card component
reaching into an onboarding *screen* for a type that `@calistenia/core/types/onboarding` owns
(`StepHealth.tsx:7-10` merely re-exports it).
*Category: Spaghetti.*

**L13 — Inconsistent i18n contract inside `training/`**
`training/RestPanel.tsx:26-27` takes pre-translated `label`/`skipLabel` props (correct: it's shared
with battles); `training/TimerPanel.tsx:63` calls `useTranslation()` itself. Same folder, same
"no domain" claim, two policies.
*Category: Composition (inconsistent component contract).*

---

## Done well

- **`apps/mobile/src/components/training/`** is the best-composed code in the repo. `RestPanel.tsx:33`
  takes `children` for caller-specific content instead of a `renderNext` prop (`patterns-children-over-render-props`,
  and its docstring says why); `TimerPanel`/`RepStepper`/`CountdownRing` take primitives + callbacks
  only, are all `memo`'d, and are genuinely shared between strength sessions and battles.
- **`grep -rEn "render[A-Z]\w*\??:\s*\("` finds zero render props** outside `renderItem` in the entire
  `apps/` tree. The codebase reaches for `children` by default.
- **`ui/kicker.tsx`** is a model primitive: a `cva` with a documented reason for each variant, an
  honest docstring about the drift it was created to stop, and a semantic (`tone="lime"` means
  interactable), not decorative, variant axis.
- **`ui/text.tsx` + `ui/button.tsx` on mobile** use `TextClassContext` so a `<Button variant="lime">`
  colors its own label without the caller restating it — real compound-component thinking
  (`architecture-compound-components`), and `text.tsx:77` already uses React 19's `use()`.
- **`battle/BattleScoreCell.tsx`** was extracted for exactly the right reason (`:5-8`: the same figure
  was hand-repeated in four places and forgetting the seconds column in all four was one slip), and
  `BattleStandingsList` precomputes the activity string in the parent so the memoized rows compare
  primitives.
- **`QuickMenu.tsx:64-70`** drives the whole menu from a `MenuSection[]` config rather than a
  switch chain, and consumes its context with `use()`.

## Files reviewed

**Read fully:** `apps/web/src/components/ui/{button,card,input,badge,loader,input-group,skeleton,kicker,accordion,collapsible,carousel,command,tabs,select,dropdown-menu,button-group,progress,switch,spinner,dialog,confirm-dialog}.tsx`;
`apps/web/src/components/{ShareButton,ExerciseCard(head+props),Timer(head)}.tsx`;
`apps/web/src/components/onboarding/StepHealth.tsx` (head);
`apps/web/src/pages/ActiveSessionPage.tsx`;
`apps/mobile/src/components/ui/{button,text,card,chip,empty-state,input-group,skeleton,input,option-sheet,one-shot-hint(head)}.tsx`;
`apps/mobile/src/components/training/{TimerPanel,RestPanel,RepStepper}.tsx`;
`apps/mobile/src/components/session/{RestScreen,TimerScreen}.tsx`;
`apps/mobile/src/components/share/{ShareCardCapture,WorkoutShareButton,CardioShareButton}.tsx`;
`apps/mobile/src/components/battle/{BattleScoreCell,BattleStandingsList,BattleResultShareButton}.tsx`.

**Skimmed / targeted (grep + selected ranges):** `apps/web/src/components/ui/{sidebar,sheet,tooltip,popover,hover-card,avatar,scroll-area}.tsx`;
`apps/web/src/components/{SessionView,PostWorkoutActions,WorkoutShareCard,PRShareCard,PRCelebration}.tsx`;
`apps/web/src/contexts/ActiveSessionContext.tsx`; all 48 `apps/web/src/components/ai-elements/*.tsx`
(import-graph + dependency analysis only);
`apps/mobile/src/components/share/{NutritionShareButton,NutritionShareCard,WorkoutShareCard,PRShareCard,StreakShareCard,CardioShareCard,PRCelebration}.tsx`;
`apps/mobile/src/components/session/PostWorkoutActions.tsx`; `apps/mobile/src/components/{QuickMenu,SessionView}.tsx`;
`apps/mobile/src/components/battle/{BattleResults,BattleResultShareCard}.tsx`;
`apps/mobile/src/components/ai-elements/*` (7 files, sizes + import graph).

**Not present / not applicable:** `packages/core/src` does not exist (core is flat:
`packages/core/{hooks,lib,types,data}`); no `renderX` props anywhere; no web equivalent of
`apps/mobile/src/components/training/`.
