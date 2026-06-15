# Plan 014: Apply the css-interop crash patch (013) onto `feat/mobile-data-perf` and verify on device

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If a STOP condition occurs, stop and report.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git rev-parse --abbrev-ref HEAD` → expect `feat/mobile-data-perf`.
> `test -f patches/react-native-css-interop@0.2.5.patch && echo EXISTS || echo MISSING`
> If it prints `EXISTS`, the patch is already applied on this branch — skip to Step 4 (device verify) and confirm the registration in Steps 2–3 instead of recreating.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/013-nutrition-mealtype-navcontext-crash.md (DONE — executed + reviewed in a disposable worktree, commit `b92572a` on branch `advisor/013-navcontext-crash`, based off `main`)
- **Category**: bug
- **Planned at**: commit `186f071`, 2026-06-15

## Why this matters

Plan 013 produced and reviewed the fix (a `pnpm patch` that stops the "Couldn't find a navigation context" crash when tapping a meal-type chip in the mobile nutrition logger). But it was executed in a worktree branched off `main`, so the fix is **not** on the user's working branch `feat/mobile-data-perf`, and the runtime/device check was never run (it can't be run in a headless worktree). This plan lands the same patch on `feat/mobile-data-perf` cleanly (re-generating the lockfile rather than cherry-picking across divergent history) and closes the loop with the on-device reproduction that proves the crash is gone.

Do **not** cherry-pick commit `b92572a` — its base (`main`) has a divergent `pnpm-lock.yaml`, so a cherry-pick will conflict. Re-applying the patch from scratch and letting `pnpm install` regenerate the lockfile is the clean path.

## Current state

- The repo's working branch is `feat/mobile-data-perf` (HEAD `186f071` at plan time). The patch from 013 is NOT present here yet.
- `pnpm-workspace.yaml` currently ends with an `onlyBuiltDependencies` block and has **no** `patchedDependencies` key. Excerpt (verify before editing):
  ```yaml
  packages:
    - apps/*
    - packages/*

  # pnpm 10 blocks postinstall scripts by default; these need theirs to run.
  onlyBuiltDependencies:
    - esbuild
    - '@sentry/cli'
  ```
- pnpm is `pnpm@10.30.0`. In pnpm 10, `patchedDependencies` lives in `pnpm-workspace.yaml`, **not** `package.json`.
- The dependency being patched is `react-native-css-interop@0.2.5` (transitive under `nativewind@4.2.5`). The patched file inside it is `dist/runtime/native/render-component.js`; the change wraps the dev-only `printUpgradeWarning` serialization in a try/catch so a throwing prop getter (expo-router's default `NavigationStateContext`) can't crash the warning.

### The exact patch to create (inline — copy verbatim)

Create `patches/react-native-css-interop@0.2.5.patch` with EXACTLY this content:

```diff
diff --git a/dist/runtime/native/render-component.js b/dist/runtime/native/render-component.js
index eba25ece1cf3fe3170cd55134df6b70c7aabd70e..d12b4b0d10e17188a6450a790637448876053917 100644
--- a/dist/runtime/native/render-component.js
+++ b/dist/runtime/native/render-component.js
@@ -118,7 +118,16 @@ function createAnimatedComponent(Component) {
     return AnimatedComponent;
 }
 function printUpgradeWarning(warning, originalProps) {
-    console.log(`CssInterop upgrade warning.\n\n${warning}.\n\nThis warning was caused by a component with the props:\n${stringify(originalProps)}\n\nIf adding or removing sibling components caused this warning you should add a unique "key" prop to your components. https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key\n`);
+    let propsString;
+    try {
+        propsString = stringify(originalProps);
+    } catch {
+        // Some props expose throwing getters (e.g. expo-router's default
+        // NavigationStateContext value). Serializing them must never crash a
+        // dev-only warning. Fall back to a safe placeholder.
+        propsString = "[props omitted: serialization threw]";
+    }
+    console.log(`CssInterop upgrade warning.\n\n${warning}.\n\nThis warning was caused by a component with the props:\n${propsString}\n\nIf adding or removing sibling components caused this warning you should add a unique "key" prop to your components. https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key\n`);
 }
 function stringify(object) {
     const seen = new WeakSet();
```

> If the `index <hashA>..<hashB>` line causes `pnpm install` to reject the patch (because the installed file's blob hash differs from `eba25ec…`), delete just that `index …` line from the patch file and re-run `pnpm install` — pnpm will fuzzy-apply by context. If it still fails, that is a STOP condition (the dependency version changed).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Confirm branch | `git rev-parse --abbrev-ref HEAD` | `feat/mobile-data-perf` |
| Apply patch | `pnpm install` | exit 0; "Done" |
| Confirm patch landed | `grep -n "props omitted: serialization threw" apps/mobile/node_modules/react-native-css-interop/dist/runtime/native/render-component.js` | one match |
| Mobile typecheck | `pnpm --filter @calistenia/mobile typecheck` | exit 0 |
| Start app (device) | `pnpm --filter @calistenia/mobile start` (or `expo run:android`) | dev server / build |

All commands run from repo root.

## Scope

**In scope** (the only files you create/modify):
- `patches/react-native-css-interop@0.2.5.patch` (create)
- `pnpm-workspace.yaml` (add the `patchedDependencies` block)
- `pnpm-lock.yaml` (regenerated by `pnpm install` — do not hand-edit)

**Out of scope** (do NOT touch):
- `package.json` (pnpm 10 does not use it for `patchedDependencies`)
- `apps/mobile/metro.config.js`
- Any app source under `apps/mobile/src/` (including the meal-logger components)
- The disposable worktree from plan 013 under `.claude/worktrees/` — ignore it

## Git workflow

- Stay on `feat/mobile-data-perf` (this fix belongs with the rest of the mobile work on that branch). Do not create a sub-branch unless the operator asks.
- Use explicit paths in `git add` — never `git add -A`:
  `git add patches/react-native-css-interop@0.2.5.patch pnpm-workspace.yaml pnpm-lock.yaml`
- Commit message (conventional commits, matching repo style):
  `fix(mobile): patch react-native-css-interop dev upgrade-warning crash (nav context getter)`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create the patch file
Create `patches/react-native-css-interop@0.2.5.patch` with the exact content from the "The exact patch to create" section above. (Create the `patches/` directory if it does not exist.)

**Verify**: `grep -n "props omitted: serialization threw" patches/react-native-css-interop@0.2.5.patch` → one match.

### Step 2: Register the patch in pnpm-workspace.yaml
Append a `patchedDependencies` block to `pnpm-workspace.yaml` (top level, sibling of `packages:` / `onlyBuiltDependencies:`):
```yaml
patchedDependencies:
  react-native-css-interop@0.2.5: patches/react-native-css-interop@0.2.5.patch
```
Do not remove or reorder the existing `packages:` / `onlyBuiltDependencies:` content.

**Verify**: `grep -n -A2 "patchedDependencies" pnpm-workspace.yaml` → shows the css-interop line.

### Step 3: Apply via install
Run `pnpm install`.

**Verify** (both):
- exit 0.
- `grep -n "props omitted: serialization threw" apps/mobile/node_modules/react-native-css-interop/dist/runtime/native/render-component.js` → one match. If empty → the patch did not apply → see the fuzzy-apply note in "Current state", retry once, else STOP.

### Step 4: Static gate
Run `pnpm --filter @calistenia/mobile typecheck`.

**Verify**: exit 0, no errors.

### Step 5: Device reproduction (the point of this plan)
1. Start the app: `pnpm --filter @calistenia/mobile start` then launch on a device/emulator (or `expo run:android`). This must be a **dev** build — the crash only exists when `NODE_ENV !== "production"`.
2. Go to the **Nutrition** tab → tap the lime **+** FAB to open the meal logger.
3. Tap each meal-type chip in succession: **Desayuno**, **Snack**, **Almuerzo**, **Cena**.

**Verify (expected)**: the active chip switches with **no red "Render Error / Couldn't find a navigation context" overlay**. A yellow console "CssInterop upgrade warning" line may appear — that is the warning now surviving instead of crashing, and is fine.

**If the red crash still appears**: STOP and report the full new stack trace — it means a second serialization path exists that this patch doesn't cover.

### Step 6: Commit
`git add patches/react-native-css-interop@0.2.5.patch pnpm-workspace.yaml pnpm-lock.yaml`
then commit with the message in the Git workflow section.

**Verify**: `git status` shows a clean tree except for any unrelated pre-existing changes you did not author; `git show --stat HEAD` lists exactly those three files.

## Done criteria

ALL must hold:

- [ ] `patches/react-native-css-interop@0.2.5.patch` exists with the try/catch change
- [ ] `pnpm-workspace.yaml` has `patchedDependencies["react-native-css-interop@0.2.5"]`
- [ ] `grep -n "props omitted: serialization threw" apps/mobile/node_modules/react-native-css-interop/dist/runtime/native/render-component.js` → one match
- [ ] `pnpm --filter @calistenia/mobile typecheck` exits 0
- [ ] Step 5 device reproduction shows **no crash** when tapping meal-type chips
- [ ] The commit on `feat/mobile-data-perf` changes only the three in-scope files
- [ ] `plans/README.md` status row for 014 updated (and 013's "runtime OWED" note cleared)

## STOP conditions

Stop and report (do not improvise) if:
- `pnpm install` rejects the patch even after removing the `index …` line (dependency version drifted from 0.2.5).
- The Step 3 grep finds no match after a retry.
- The Step 5 red crash persists after the patch is confirmed applied — report the new stack trace.
- Applying this seems to require touching `package.json`, `metro.config.js`, or app source — out of scope; STOP.

## Maintenance notes

- This patch is dev-only (the warning path is gated behind `process.env.NODE_ENV !== "production"`); it changes no production behavior.
- On any future bump of `nativewind` / `react-native-css-interop`, pnpm will warn if the patch no longer applies. If upstream fixes its `stringify` to tolerate throwing getters, drop the patch and re-run the Step 5 reproduction to confirm.
- The pre-existing "active: estático" comments in `meal-logger-views.tsx` / `meal-logger-steps.tsx` are unrelated style tweaks, not part of this fix; keep or revert independently.
