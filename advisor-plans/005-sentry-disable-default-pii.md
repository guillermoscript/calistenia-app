# Plan 005: Stop Sentry from auto-collecting PII (`sendDefaultPii`) in the mobile app

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, add/update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told you
> they maintain the index.
>
> **Drift check (run first)**: from the repo root
> `/Users/guillermomarin/Documents/ejercicios/calistenia-app`, run:
> `git diff --stat 943f558..HEAD -- apps/mobile/src/lib/instrument.ts`
> If `apps/mobile/src/lib/instrument.ts` changed since this plan was written,
> compare the "Current state" excerpt below against the live file before
> proceeding. On any mismatch in the `Sentry.init({...})` block, treat it as a
> STOP condition (see STOP conditions).

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `943f558`, 2026-06-21

## Why this matters

`apps/mobile/src/lib/instrument.ts` initializes Sentry with `sendDefaultPii: true`.
With that flag on, Sentry's React Native SDK auto-attaches personally
identifiable information — the user's IP address, request/device headers, and
device identifiers — to **every** error event and performance transaction, with
no user consent and no explicit need. That is an unnecessary privacy/GDPR
exposure: crash reports do not require raw PII to be actionable, and collecting
it by default broadens the data we're responsible for. Flipping the flag to
`false` removes that auto-collection immediately with zero behavioral change to
the app. After this lands, error reports stop carrying IP/device PII while still
capturing stack traces, breadcrumbs, and the (non-PII) context we set
elsewhere.

## Current state

- `apps/mobile/src/lib/instrument.ts` — the single Sentry initialization for the
  native app. 19 lines. Imports `@sentry/react-native` and calls `Sentry.init`,
  then re-exports the configured `Sentry`. This is the **only** source file in
  scope. There is currently no `Sentry.setUser(...)` and no `beforeSend` hook in
  this file (confirmed by recon), so flipping the flag is the entire behavioral
  change.

Verbatim excerpt of the file as it exists today (`apps/mobile/src/lib/instrument.ts:1-19`).
The `dsn` literal on line 12 is a Sentry DSN (public ingest key) and is
**redacted here on purpose** — the real file still holds the live value and must
keep it unchanged:

```ts
/**
 * Sentry para React Native. DEBE importarse antes que init-core (mismo orden
 * que web: instrument.ts → init-core.ts). En dev queda deshabilitado (Expo Go
 * solo soporta el modo JS-only y no queremos ruido de desarrollo).
 */
import * as Sentry from '@sentry/react-native'

Sentry.init({
  // Proyecto Sentry propio de RN (guillermoscript/calistenia-app), distinto del
  // de la web. Override por env para builds que quieran apuntar a otro entorno.
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ||
    '<<Sentry DSN — public ingest key, redacted in this plan; see instrument.ts:11-12 in the real file>>',
  enabled: !__DEV__,
  environment: __DEV__ ? 'development' : 'production',
  sendDefaultPii: true,
  tracesSampleRate: 0.2,
})

export { Sentry }
```

The exact line to change is `apps/mobile/src/lib/instrument.ts:15`:

```ts
  sendDefaultPii: true,
```

Notes the executor must honor:

- The `dsn` on lines 11-12 is a **Sentry DSN (public ingest key)** and is a
  public client DSN by design. It is **out of scope** — do not touch it, do not
  move it, do not reproduce its value anywhere (not in commits, logs, or the
  index). The redaction shown above in this plan is intentional; the real file
  still contains the live value and that is correct.
- The `enabled`, `environment`, and `tracesSampleRate` lines are **out of
  scope** — leave them exactly as they are.
- Repo convention: code comments and user-facing strings are in **Spanish**.
  This change touches no comments and no strings, so nothing new to translate.
- Styling/structure: this file is plain TypeScript config; preserve the existing
  2-space indentation and trailing comma on the changed line.

## Commands you will need

| Purpose          | Command                                                       | Expected on success                          |
|------------------|---------------------------------------------------------------|----------------------------------------------|
| Install          | (from repo root) `pnpm install`                               | exit 0                                        |
| Mobile typecheck | `cd apps/mobile && npm run typecheck`                         | exit 0 (runs `tsc --noEmit`, no errors)      |
| Mobile tests     | `cd apps/mobile && npm run test`                              | `vitest run`, all existing tests pass        |
| Mobile lint      | `cd apps/mobile && npm run lint`                              | `expo lint`, exit 0                          |
| Confirm the flag | `grep -n "sendDefaultPii" apps/mobile/src/lib/instrument.ts` | one line, value `false` (run from repo root) |

(Commands verified during recon on commit `943f558` by reading
`apps/mobile/package.json` scripts. The mobile typecheck was confirmed clean —
exit 0 — on this commit before any change. Note: there is **no** test command
for `packages/core` and none is needed here — `packages/core/package.json` has an
empty `scripts` block and no vitest binary; this plan runs no core tests.)

## Scope

**In scope** (the only source file you should modify):

- `apps/mobile/src/lib/instrument.ts` — exactly one line: `sendDefaultPii: true` → `sendDefaultPii: false`.

Also permitted (index bookkeeping only):

- `advisor-plans/README.md` — add this plan's status row (Step 6). Not source code.

**Out of scope** (do NOT touch, even though they look related):

- The `dsn` value/lines (`instrument.ts:11-12`) — public client DSN by design; not part of this plan.
- The `enabled`, `environment`, and `tracesSampleRate` lines — unrelated config; leave verbatim.
- Any other file in the repo, including any web Sentry init, `init-core.ts`, or
  EAS / app config. This plan is a single-line flag flip.
- Adding `Sentry.setUser(...)` / `beforeSend` / any new Sentry calls — explicitly
  deferred (see Maintenance notes). Not part of this plan.

## Git workflow

- Branch: `advisor/005-mobile-sentry-disable-pii` (create from `main` at the
  current HEAD, commit `943f558`).
- Stage with an **explicit path** only — never `git add -A` / `git add .`:
  `git add apps/mobile/src/lib/instrument.ts`
  (and `advisor-plans/README.md` separately if you update the index).
- Commit message style: Conventional Commits with scope (matches `git log`,
  which uses `feat(mobile)`, `fix(mobile)`, `chore(mobile)`, etc. — note the repo
  has never used a `security` type, so do not invent one). Suggested message:
  `chore(mobile): disable Sentry sendDefaultPii to stop auto-collecting PII`
  (`fix(mobile): ...` is an acceptable alternative; `chore`/`fix` are both used
  in this repo's log).
- Do NOT push, merge, rebase, or open a PR unless the operator explicitly
  instructs it.

## Steps

### Step 1: Create the working branch

From the repo root `/Users/guillermomarin/Documents/ejercicios/calistenia-app`,
on a clean tree at commit `943f558` (branch `main`), create and switch to the
plan branch.

```
git checkout -b advisor/005-mobile-sentry-disable-pii
```

**Verify**: `git rev-parse --abbrev-ref HEAD` → prints `advisor/005-mobile-sentry-disable-pii`

### Step 2: Flip `sendDefaultPii` from `true` to `false`

Edit `apps/mobile/src/lib/instrument.ts`. Change **only** line 15 inside the
`Sentry.init({...})` object:

- Find:
  ```ts
    sendDefaultPii: true,
  ```
- Replace with:
  ```ts
    sendDefaultPii: false,
  ```

Do not change indentation (two spaces), the trailing comma, the key name, or any
other line. Make no other edits to the file.

**Verify**: `grep -n "sendDefaultPii" apps/mobile/src/lib/instrument.ts` → prints exactly one line: `15:  sendDefaultPii: false,`

### Step 3: Typecheck the mobile app

Confirm the change compiles (it is a boolean literal swap, so this must stay
clean).

```
cd apps/mobile && npm run typecheck
```

**Verify**: command exits 0 with no TypeScript errors.

### Step 4 (optional but recommended): Lint the mobile app

```
cd apps/mobile && npm run lint
```

**Verify**: `expo lint` exits 0. If lint surfaces a *pre-existing* warning
unrelated to `instrument.ts`, that is acceptable — only a NEW error introduced
by this change is a problem (none is expected from a boolean swap).

### Step 5: Confirm only the in-scope file changed

```
git status --porcelain
```

**Verify**: the only modified path shown is `apps/mobile/src/lib/instrument.ts`
(plus `advisor-plans/README.md` if/when you update the index in Step 6). No
other source files appear.

### Step 6: Update the plan index

`advisor-plans/README.md` already exists and currently lists only plan 001 in a
7-column table with this header (do not change the header):

```
| Plan | Title | Priority | Effort | Risk | Depends on | Status |
```

There is **no** plan-005 row yet — you must **add** one (do not look for an
existing 005 row to overwrite). Insert a new row beneath the plan-001 row in the
"Execution order & status" table, matching the existing column order exactly:

```
| 005 | Disable Sentry `sendDefaultPii` (stop auto-collecting PII) in mobile | P2 | S | LOW | — | DONE |
```

Do not edit the README's header text, intro paragraphs, or the plan-001 row.
(If a reviewer dispatched you and said they maintain the index, skip this step
and report instead.)

**Verify**: `grep -n "| 005 |" advisor-plans/README.md` → prints exactly one
line, the row you added, ending in `DONE |`.

### Step 7: Commit

```
git add apps/mobile/src/lib/instrument.ts
git add advisor-plans/README.md   # only if you edited it in Step 6
git commit -m "chore(mobile): disable Sentry sendDefaultPii to stop auto-collecting PII"
```

**Verify**: `git show --stat HEAD` → lists `apps/mobile/src/lib/instrument.ts`
(and optionally `advisor-plans/README.md`) and nothing else.

## Test plan

No automated test is feasible for this change: `sendDefaultPii` is an SDK
configuration flag passed to `Sentry.init`, not a pure function with a return
value to assert on. The repo has **no** React-Native render test infrastructure
(no `@testing-library/react-native`, no `jest-expo`, no vitest config); all
existing tests run in the default Node environment and only exercise pure
functions (e.g. `apps/mobile/src/lib/__tests__/live-activity-state.test.ts`).
Rendering or booting Sentry inside a test is therefore **not** an option, and
writing one would be a redesign — do not attempt it.

- Do **not** add or modify any test file for this plan.
- Regression guard against accidental damage to the rest of the suite: run the
  existing mobile tests and confirm they still pass.
  `cd apps/mobile && npm run test` → `vitest run` reports all existing tests
  passing (this change does not touch any tested code, so the count must be
  unchanged from baseline).
- **Manual verification (post-release, owner-side, not blocking this commit)**:
  after a build with this change ships and produces a Sentry event, open the
  Sentry React Native project dashboard and confirm new error events no longer
  carry the user's IP address or device identifiers (the "User" / IP fields are
  empty/scrubbed — with no `Sentry.setUser` call and the flag off, events are
  anonymous). This is informational follow-up, not a gate on merging the
  one-line change.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "sendDefaultPii" apps/mobile/src/lib/instrument.ts` prints exactly one line and its value is `false` (`15:  sendDefaultPii: false,`).
- [ ] `grep -n "sendDefaultPii: true" apps/mobile/src/lib/instrument.ts` returns no matches (exit 1).
- [ ] `cd apps/mobile && npm run typecheck` exits 0.
- [ ] `cd apps/mobile && npm run test` exits 0 (existing suite unchanged, all pass).
- [ ] `git status --porcelain` shows no modified files outside `apps/mobile/src/lib/instrument.ts` (and `advisor-plans/README.md` if the index was updated).
- [ ] `git diff 943f558 -- apps/mobile/src/lib/instrument.ts` shows exactly one changed line — the `sendDefaultPii` line — and the `dsn` (lines 11-12), `enabled`, `environment`, and `tracesSampleRate` lines are byte-for-byte unchanged.
- [ ] `advisor-plans/README.md` has a plan-005 row (`grep -n "| 005 |" advisor-plans/README.md` matches) — unless a reviewer owns the index.

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `apps/mobile/src/lib/instrument.ts` changed since
  `943f558` AND the live `Sentry.init({...})` block no longer matches the
  "Current state" excerpt.
- `instrument.ts` has drifted such that **there is no `sendDefaultPii` line at
  all** (the flag was already removed or the file was restructured) — do not
  re-add it; report what you found instead.
- There is more than one `sendDefaultPii` occurrence in the file, or it is not
  on line 15 / not literally `sendDefaultPii: true,` — the file has changed shape;
  report rather than guess which one to edit.
- `cd apps/mobile && npm run typecheck` fails after the one-line change (a
  boolean swap must not break typecheck; a failure means something else is wrong
  with the tree or environment).
- Completing the change appears to require editing any file other than
  `apps/mobile/src/lib/instrument.ts` (and the index README) — that contradicts
  this plan's scope.
- You find yourself about to touch the DSN, or to reproduce/log the DSN value
  anywhere (commit message, console, the index) — stop; the DSN is out of scope
  and its value must never be copied.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **What a reviewer should scrutinize**: that the diff is exactly one line
  (`true` → `false`) on the `sendDefaultPii` key, and that the DSN, `enabled`,
  `environment`, and `tracesSampleRate` lines are untouched.
- **Deferred follow-up (NOT part of this plan)**: if user-level error
  correlation is later wanted without raw PII, the app can call
  `Sentry.setUser({ id })` passing **only** the PocketBase user id (no email, no
  IP, no name) at a point where the logged-in user is known (e.g. an auth effect
  or near init-core). That is a separate, additive change.
- **If richer Sentry user context is ever added**: keep `sendDefaultPii: false`
  and scrub PII explicitly in a `beforeSend` hook (strip IP, headers, and any
  identifying fields before the event is sent) rather than re-enabling
  `sendDefaultPii`. Re-enabling the flag would reintroduce exactly the exposure
  this plan removes.
- **DSN rotation note (informational, out of scope)**: the `dsn` at
  `instrument.ts:11-12` is a public client ingest key (safe to ship in app
  binaries by design), so this plan leaves it in place. No rotation is required
  by this change.
- **Potential prompt-injection note**: none encountered. `instrument.ts` is
  ordinary config/code and contained no instructions directed at a reader.
