# Plan 013: Stop the "Couldn't find a navigation context" render crash when tapping a meal type in the mobile nutrition logger

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 186f071..HEAD -- apps/mobile/metro.config.js apps/mobile/src/components/nutrition/meal-logger-views.tsx apps/mobile/src/components/nutrition/meal-logger-steps.tsx package.json`
> If `meal-logger-views.tsx` / `meal-logger-steps.tsx` changed, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `186f071`, 2026-06-15

## Why this matters

On the mobile app, opening the meal logger (FAB on the Nutrition tab) and tapping a meal-type chip (e.g. "Desayuno"/breakfast or "Snack") crashes the screen with a red **Render Error: "Couldn't find a navigation context. Have you wrapped your app with 'NavigationContainer'?"**. This makes logging a meal — a core daily action — impossible in dev builds, and the same code path runs in any build where `NODE_ENV !== "production"`. The error message is misleading: **there is nothing wrong with the navigation setup.** The real cause is a dev-only crash inside `nativewind`/`react-native-css-interop` that this plan neutralizes at the source so the entire class of crash disappears, not just one component.

## Root cause (read this before touching anything)

The crash is **NOT** a navigation problem and **NOT** specific to `MealTypeSelector`. The chain is:

1. Tapping a meal-type chip calls `selectMealType` → `setMealType(v)` → the logger re-renders (`apps/mobile/src/components/nutrition/use-meal-logger.ts:305`).
2. During that re-render, `react-native-css-interop` (the engine under NativeWind) decides a styled component needs an "upgrade" (e.g. `View`→`Pressable`, or an animated/variable/container upgrade) and, **in development only**, prints a warning.
3. To build the warning string it calls `stringify(originalProps)` in
   `react-native-css-interop/dist/runtime/native/render-component.js` (`printUpgradeWarning`, ~line 120; `stringify`, ~line 123). `stringify` walks the props object with `JSON.stringify` + a `replace` function that does **`for (const entry of Object.entries(value))`** recursively over the whole prop/React-element tree.
4. That recursive `Object.entries` eventually touches expo-router's **`NavigationStateContext` default object**, whose properties are **getters that throw** `"Couldn't find a navigation context"` by design:
   `node_modules/.pnpm/expo-router@*/node_modules/expo-router/build/react-navigation/core/NavigationStateContext.js` defines the default context value with `get getKey() { throw new Error(MISSING_CONTEXT_ERROR) }`, `get getState()`, `get setState()`, `get getIsInitial()`.
5. `Object.entries` invokes those getters → they throw → the throw propagates out of the dev warning → React surfaces it as a render error.

So a benign dev-only `console.log` warning is fatal because css-interop serializes arbitrary objects with `Object.entries`, which is unsafe against objects that have throwing getters. The fix: make that serialization non-fatal.

### Why the existing in-tree edits do NOT fix it

The working tree already contains an attempted fix (uncommitted) in
`meal-logger-views.tsx` and `meal-logger-steps.tsx` that makes the `active:`
class static ("active: estático…"). That theory was that a `View` was being
upgraded to `Pressable` after first render. It does not fix the crash because
those chips are **already `Pressable`** (no View→Pressable upgrade happens on
them), and even if the warning fires on some other component, the crash is in
the shared `stringify` path — not in any one component's class list. Chasing it
per-component is whack-a-mole. Leave those edits in place (harmless, they reduce
needless remounts) but understand they are not the fix.

## Current state

Relevant files:

- `react-native-css-interop` **v0.2.5** — transitive dep of `nativewind@4.2.5`, resolved via pnpm. The offending code is in its **published build**, so the fix is a dependency patch (`pnpm patch`), not an app-source edit.
- `apps/mobile/metro.config.js` — already pins `react`/react-query singletons (recent work on branch `feat/mobile-data-perf`). Do not change it; it is not the cause.
- Root `package.json` — pnpm 10.30.0 workspace, currently has **no** `pnpm.patchedDependencies` and no `patches/` dir. This plan creates the first patch.

The exact code to patch lives at (inside the pnpm-linked package):
`node_modules/react-native-css-interop/dist/runtime/native/render-component.js`

Current `printUpgradeWarning` (verbatim, ~lines 120–122):

```js
function printUpgradeWarning(warning, originalProps) {
    console.log(`CssInterop upgrade warning.\n\n${warning}.\n\nThis warning was caused by a component with the props:\n${stringify(originalProps)}\n\nIf adding or removing sibling components caused this warning you should add a unique "key" prop to your components. https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key\n`);
}
```

The `stringify` helper right below it (~lines 123–140) is what throws, via `for (const entry of Object.entries(value))`.

This file is **build output** — it has no TypeScript source in our repo. We patch the shipped `.js` directly through pnpm's patch mechanism, which is the supported way to modify a dependency in a pnpm workspace.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Locate file | `ls apps/mobile/node_modules/react-native-css-interop/dist/runtime/native/render-component.js` | path prints, exit 0 |
| Start patch | `pnpm patch react-native-css-interop@0.2.5 --edit-dir /tmp/csi-patch` | prints `/tmp/csi-patch`, creates that dir |
| Commit patch | `pnpm patch-commit /tmp/csi-patch` | writes `patches/react-native-css-interop@0.2.5.patch`, updates root `package.json` |
| Apply | `pnpm install` | exit 0, "Done" |
| Mobile typecheck | `pnpm --filter @calistenia/mobile typecheck` | exit 0, no errors |
| Confirm patch landed | `grep -n "catch" apps/mobile/node_modules/react-native-css-interop/dist/runtime/native/render-component.js` | shows the new try/catch |

All commands run from the repo root: `/Users/guillermomarin/Documents/ejercicios/calistenia-app`.

## Scope

**In scope** (the only things you should create/modify):
- `patches/react-native-css-interop@0.2.5.patch` (created by `pnpm patch-commit`)
- Root `package.json` — only the `pnpm.patchedDependencies` entry that `pnpm patch-commit` adds automatically
- `pnpm-lock.yaml` — only the changes `pnpm install` makes to register the patch

**Out of scope** (do NOT touch, even though they look related):
- `apps/mobile/metro.config.js` — the singleton resolver is correct; it is not the cause.
- `apps/mobile/src/components/nutrition/meal-logger-views.tsx` and `meal-logger-steps.tsx` — leave the existing uncommitted `active:` edits as-is. Do not add more per-component workarounds.
- expo-router / `NavigationStateContext.js` — its throwing-getter default is intentional upstream design; do not patch it.
- Any app source under `apps/mobile/src/` — the fix is entirely in the dependency patch.

## Git workflow

- Branch: the repo is on `feat/mobile-data-perf`. Create `advisor/013-navcontext-crash` off the current branch unless the operator says otherwise.
- Commit message style: conventional commits (repo uses e.g. `fix(core): …`, `refactor(core): …`). Use:
  `fix(mobile): patch react-native-css-interop dev upgrade-warning crash (nav context getter)`
- Commit the patch file, the `package.json` change, and the `pnpm-lock.yaml` change together.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Confirm the bug location matches this plan

Run:
```
grep -n "printUpgradeWarning\|for (const entry of Object.entries" apps/mobile/node_modules/react-native-css-interop/dist/runtime/native/render-component.js
```
**Verify**: output shows a `printUpgradeWarning` function and a `for (const entry of Object.entries(value))` line. If either is absent → **STOP** (the dependency version differs from what this plan was written against).

### Step 2: Open the patch edit directory

Run:
```
pnpm patch react-native-css-interop@0.2.5 --edit-dir /tmp/csi-patch
```
**Verify**: command prints `/tmp/csi-patch` (or the path you passed) and that directory now contains `dist/runtime/native/render-component.js`. Confirm with:
```
ls /tmp/csi-patch/dist/runtime/native/render-component.js
```
→ path prints.

### Step 3: Make the dev warning non-fatal

Edit **only** `/tmp/csi-patch/dist/runtime/native/render-component.js`. Replace the `printUpgradeWarning` function body so the `stringify(originalProps)` call cannot throw out of the warning. Target shape:

```js
function printUpgradeWarning(warning, originalProps) {
    let propsString;
    try {
        propsString = stringify(originalProps);
    } catch {
        // Some props expose throwing getters (e.g. expo-router's default
        // NavigationStateContext value). Serializing them must never crash a
        // dev-only warning. Fall back to a safe placeholder.
        propsString = "[props omitted: serialization threw]";
    }
    console.log(`CssInterop upgrade warning.\n\n${warning}.\n\nThis warning was caused by a component with the props:\n${propsString}\n\nIf adding or removing sibling components caused this warning you should add a unique "key" prop to your components. https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key\n`);
}
```

Do not change any other function in the file. Do not change `stringify` itself.

**Verify**:
```
grep -n "props omitted: serialization threw" /tmp/csi-patch/dist/runtime/native/render-component.js
```
→ one match.

### Step 4: Commit the patch

Run:
```
pnpm patch-commit /tmp/csi-patch
```
**Verify** (all must hold):
```
ls patches/react-native-css-interop@0.2.5.patch        # file exists
grep -n "react-native-css-interop" package.json        # under pnpm.patchedDependencies
```
The root `package.json` should now contain something like:
```json
"pnpm": {
  "patchedDependencies": {
    "react-native-css-interop@0.2.5": "patches/react-native-css-interop@0.2.5.patch"
  }
}
```

### Step 5: Reinstall so the patch is applied to node_modules

Run:
```
pnpm install
```
**Verify**: exit 0, and the patch is now live in the linked package:
```
grep -n "props omitted: serialization threw" apps/mobile/node_modules/react-native-css-interop/dist/runtime/native/render-component.js
```
→ one match. If the grep returns nothing, the patch did not apply → **STOP**.

### Step 6: Confirm nothing else broke statically

Run:
```
pnpm --filter @calistenia/mobile typecheck
```
**Verify**: exit 0, no errors (the patch is to JS dependency output and adds no types, so typecheck must be unaffected).

### Step 7: Runtime verification (device/emulator — manual)

This bug only reproduces at runtime in a dev build, so the final gate is manual. The operator (or you, if you have a device attached) must:

1. Start the app: `pnpm --filter @calistenia/mobile start` (or `expo run:android`).
2. Go to the **Nutrition** tab → tap the lime **+** FAB to open the meal logger.
3. Tap several meal-type chips (**Desayuno**, **Snack**, **Almuerzo**, **Cena**) in succession.

**Expected**: chips switch the active selection with no red error overlay. Previously this threw "Couldn't find a navigation context." A harmless yellow/console "CssInterop upgrade warning" log may appear — that is fine and expected; it must not crash.

If a device is not available, mark Step 7 as **owed** in the status note rather than claiming it passed.

## Test plan

There is no unit-test harness that exercises NativeWind's dev upgrade-warning path (the mobile app uses `vitest` for logic, not RN render-with-css-interop). Do **not** invent a brittle test that imports css-interop internals.

- Static gate: `pnpm --filter @calistenia/mobile typecheck` → exit 0.
- Patch-applied gate: the Step 5 grep finds the new try/catch in the linked package.
- Behavioral gate: the manual Step 7 reproduction no longer crashes.

If you want a lightweight regression guard, add a note (not a test) to the patch commit body recording the css-interop version, so a future `nativewind`/`react-native-css-interop` bump that drops the patch is noticed (see Maintenance notes).

## Done criteria

ALL must hold:

- [ ] `patches/react-native-css-interop@0.2.5.patch` exists and contains the try/catch change
- [ ] Root `package.json` has `pnpm.patchedDependencies["react-native-css-interop@0.2.5"]` pointing at that patch
- [ ] `grep -n "props omitted: serialization threw" apps/mobile/node_modules/react-native-css-interop/dist/runtime/native/render-component.js` → one match (patch applied)
- [ ] `pnpm --filter @calistenia/mobile typecheck` exits 0
- [ ] No files outside the in-scope list are modified (`git status` shows only the patch file, `package.json`, `pnpm-lock.yaml`, and — if still present — the pre-existing uncommitted meal-logger edits you did not author)
- [ ] Manual Step 7 reproduction no longer crashes (or is explicitly recorded as "owed" if no device)
- [ ] `plans/README.md` status row for 013 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's grep does not find `printUpgradeWarning` and `Object.entries` — the installed `react-native-css-interop` version differs from `0.2.5`; the patch target is wrong.
- `pnpm patch` / `pnpm patch-commit` errors (e.g. version not found in the store, or pnpm refuses to patch a workspace-hoisted package). Report the exact error; do not hand-edit `node_modules` as a substitute.
- After `pnpm install`, the Step 5 grep finds no match (patch silently not applied).
- The crash still reproduces in Step 7 after the patch applies cleanly — that means there is a second serialization path; report the new stack trace rather than guessing.
- You find yourself wanting to edit `metro.config.js`, expo-router, or app source to fix this — that is out of scope; stop and report.

## Maintenance notes

For whoever owns this after it lands:

- **This is a patch against a third-party dev-only code path.** The next time `nativewind` or `react-native-css-interop` is upgraded, pnpm will warn if the patch no longer applies. If css-interop fixes the serialization upstream (wraps its own `stringify`, or stops using `Object.entries` on arbitrary prop trees), this patch can be dropped — re-test the Step 7 reproduction before removing it.
- The patch is intentionally minimal and only affects the dev warning string; it changes no production behavior (the whole `printUpgradeWarning` path is gated behind `process.env.NODE_ENV !== "production"` in `render-component.js`).
- The pre-existing "active: estático" comments/edits in `meal-logger-views.tsx` and `meal-logger-steps.tsx` are now redundant as a *fix* but are a reasonable *style* (avoids View→Pressable remounts). A reviewer can keep or revert them independently; they are not part of this plan's fix.
- A PR reviewer should scrutinize: (1) that only the warning's serialization is wrapped, not `stringify` semantics elsewhere; (2) that `package.json` + `pnpm-lock.yaml` + the patch file are committed together so CI installs reproduce the patch.
