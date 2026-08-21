# Repo hygiene & tooling

## Grade
**C+.** No live secrets or keystores leak into git (the scary-looking root files — `secret.json`, `calistenia-release.jks`, the Firebase admin-SDK JSON, `pb_data/`, `.env`, `.DS_Store` — are all correctly gitignored, and CI runs Gitleaks). But the repo root is littered with ~200 tracked dev-session artifacts, one real config-with-API-key file (`google-services.json`) is tracked with no ignore rule at all, `packages/core` — the package both apps depend on — has no tsconfig and is typechecked by nobody, `apps/web` ships 31 `eslint-disable` comments while owning zero ESLint dependency, and `mcp-server` runs a second, independently-drifting lockfile (`npm`) inside a `pnpm` workspace.

## Top 3 refactors
1. Give `packages/core` its own `tsconfig.json` + `typecheck` script (wired into CI) so the shared package both apps import is actually verified in isolation, instead of only ever being type-checked transitively under whichever app happens to import it (with two different strictness settings — see Findings).
2. Untrack `apps/mobile/google-services.json` and the ~10 stray root-level debug/snapshot artifacts (`pb_out.log`, `exercises-*.md`, `page_analysis.md`, `step4-snapshot.md`, `workout-snap.md`, `views.json`, `create_views.js`, `ashtanga-yoga-seed.json`, `intermedio_balance_total.json`) via `git rm --cached` + `.gitignore` rules, and rotate the exposed Firebase Android API key as a precaution.
3. Either add an ESLint config to `apps/web` (matching `apps/mobile`'s Expo-flat setup) or strip the 31 dead `eslint-disable` comments so the codebase stops implying a lint gate that doesn't exist; unify `typescript`/`vitest` versions across workspaces and fold `mcp-server`'s Docker build onto `pnpm` so it stops carrying a second, independently-drifting lockfile.

## Findings

### High

1. **`apps/mobile/google-services.json` is tracked in git with no ignore rule, and contains a live-looking Firebase API key.** `git ls-files | grep google-services` → `apps/mobile/google-services.json`; `git check-ignore -v apps/mobile/google-services.json` returns nothing (not ignored). Content includes `"api_key": [{"current_key": "AIzaSyBMchghCFAivYKH5jgXMZ_oqqHakxhmTPU"}]`. The sibling `apps/mobile/calistenia-*-firebase-adminsdk-*.json` (the real service-account secret) *is* correctly gitignored (`.gitignore:76`) and the generated `apps/mobile/android/app/google-services.json` copy is also ignored (`apps/mobile/.gitignore:43`, via `/android`) — only this one source-of-truth copy slipped through. Category: repo-hygiene/secret-smell. Fix: `git rm --cached apps/mobile/google-services.json`, add it to `.gitignore` alongside the adminsdk pattern, document how to fetch it locally (Firebase console), and rotate the key since it's been public in history.

2. **`packages/core` — the package both `apps/web` and `apps/mobile` depend on — has no `tsconfig.json` and no `typecheck` script.** `packages/core/package.json` scripts block is just `{"test": "vitest run"}`; `ls packages/core/tsconfig.json` → not found. Root `pnpm -r typecheck` (`package.json:9`) silently skips core (no script to run), and `.github/workflows/ci.yml:32` only runs `pnpm -r test` for "packages/core + mobile" — typecheck is never claimed for core anywhere. Its `.ts` files are only ever checked transitively, once by `apps/web`'s `tsc` (`strict: false`) and once by `apps/mobile`'s `tsc` (`strict: true`, extends `expo/tsconfig.base`) — two different strictness regimes, neither of which is core's own contract. Category: Separation-of-concerns / tooling gap. Fix: add `packages/core/tsconfig.json` (strict) + a `typecheck` script, wire it into `pnpm -r typecheck`.

3. **`apps/web/tsconfig.json` sets `strict: false`, while `apps/mobile/tsconfig.json` sets `strict: true`.** `apps/web/tsconfig.json:6` (`"strict": false`) vs `apps/mobile/tsconfig.json:4` (`"strict": true`). Neither sets `noUncheckedIndexedAccess` or `noImplicitAny` explicitly (grepped across all four `tsconfig*.json` files — zero matches). Consequence shows up directly in the data: `apps/web/src` has 498 `:any`/`as any`/`<any>` occurrences vs. 68 in `apps/mobile/src`, despite mobile having fewer source files relative to web. Category: SOLID/tooling-consistency. Fix: turn on `strict` for web (even if it has to land behind a large one-time cleanup PR / per-file `// @ts-nocheck` allowlist), or at minimum document why web is intentionally loose.

4. **`apps/web` has zero ESLint dependency but carries 31 `eslint-disable` comments in its own source.** `python3` dep dump of `apps/web/package.json` (89 total deps) contains no package with `eslint` in its name; `find apps packages mcp-server -iname "eslint.config*" -o -iname ".eslintrc*"` returns only `apps/mobile/eslint.config.js`. Yet e.g. `apps/web/src/App.tsx:132`, `:149`, `:769` and `apps/web/src/contexts/ActiveSessionContext.tsx:272` carry `// eslint-disable-line react-hooks/exhaustive-deps`. `.github/workflows/ci.yml:29` even labels the lint step "mobile — only workspace with an ESLint config today", confirming this is known and accepted, not accidental — but the 31 disable comments are dead weight that misleadingly implies a lint gate is catching (and being deliberately silenced for) hook-dependency issues on web, when nothing runs at all. Category: Spaghetti / misleading code. Fix: add web's own ESLint config, or strip the now-meaningless disable comments.

### Medium

5. **~10 dev-session/debug artifacts are tracked at repo root, unrelated to app code.** `pb_out.log` (tracked despite `*.log` being gitignored at `.gitignore:34` — added before the rule, or force-added), plus `exercises-after-dismiss.md` (993 lines), `exercises-page.md`, `exercises-snapshot.md`, `page_analysis.md`, `snapshot-after-select.md`, `step4-snapshot.md`, `workout-snap.md` — all are raw Playwright/browser accessibility-tree dumps (`- generic [ref=e2]: ...`), i.e. throwaway debugging output, each committed once in March 2026 and never touched since (`git log --follow` shows a single commit per file). Also `views.json` + `create_views.js` (one-off PocketBase view-creation script + its output, superseded by `pb_migrations/`) and `ashtanga-yoga-seed.json` / `intermedio_balance_total.json` (328KB / seed data dumps, unclear if still used by any script). Category: KISS/repo-hygiene. Fix: `git rm` the snapshot dumps; move any still-useful seed JSON into `scripts/` or `pb_migrations/` with a comment explaining its role, or delete.

6. **`mcp-server` carries its own tracked `package-lock.json` and is built with `npm`, independently of the root `pnpm-lock.yaml`.** `git ls-files | grep mcp-server/package-lock` → tracked; `mcp-server/Dockerfile:6,16,40` run `npm ci` / `npm run build` / `npm ci --omit=dev` inside the image, while every other workspace resolves through pnpm (`pnpm-workspace.yaml` includes `apps/*` and `packages/*` but the Docker build path for mcp-server bypasses the workspace entirely). Two lockfiles for the same dependency tree can drift: a version bumped via `pnpm update` at the workspace root will not touch `mcp-server/package-lock.json`, and vice versa. Category: tooling-consistency. Fix: switch the Dockerfile to `pnpm deploy` / `pnpm --filter` + `pnpm-lock.yaml`, drop the npm lockfile, or explicitly document why mcp-server is deliberately npm-only (e.g. deploy target constraints) if that's intentional.

7. **`typescript` and `vitest` versions are inconsistent across workspaces.** `typescript`: web/mcp-server `^5.9.3` vs mobile `~6.0.3` (a major-version jump); `packages/core` has no `typescript` devDependency at all (consistent with finding #2 — it's never typechecked on its own). `vitest`: web/mobile/core all `^4.1.10`, mcp-server `^3.2.4` (one major behind). Category: dependency-hygiene (monorepo-single-dependency-versions). Fix: pin one `typescript` and one `vitest` major across the workspace via `pnpm-workspace.yaml` catalog or root devDependency + workspace protocol.

8. **`mcp-server` does not depend on `@calistenia/core` at all**, despite the monorepo's stated purpose for `packages/core` ("shared hooks/lib/types/data used by BOTH apps" per its own `package.json` description) and despite mcp-server almost certainly needing overlapping domain types (exercises, sessions, users) that web/mobile already get from core. `mcp-server/package.json` deps only list `@langfuse/core` (an unrelated package despite the similar name) — no `@calistenia/core`. Category: DRY (unverified without reading mcp-server's actual data-shaping code, but the dependency graph alone is a smell worth a look — flagged for the mcp-server/backend-scoped review to confirm whether types/logic are duplicated).

### Low

9. **`pb_hooks` has 55 `console.log` calls**, several clearly meant as permanent operational logging (e.g. `pb_hooks/battle_api.pb.js:25` `console.log("[battle_api] hook file loaded")`, `:801` a summary log after a cron sweep) rather than debug leftovers — this looks intentional given goja's limited tooling (per project memory, PB JSVM failures are silent, so logging is a deliberate mitigation) and is not obviously a smell, but there's no log-level/verbosity convention (everything is `console.log`, no `console.error`/`console.warn` split visible in the sample) making it hard to filter noise from real errors in production logs. Category: KISS/observability. Fix: adopt a tiny `warn`/`error` vs `debug` convention, or gate the `"hook file loaded"` boot logs behind a debug flag.

10. **Root has 30 loose tracked files outside any directory**, several of which are stale planning docs sitting alongside real project files (`PLAN.md`, `FEATURE_PRIORITIES.md`, `CHANGELOG.md`/`CHANGELOG.es.md`, `README.md`, `SECURITY.md` are legitimate; `advisor-plans/` — a separate 17-file tracked directory of AI-generated task plans dated June 2026, e.g. `advisor-plans/015-structured-media.md` — reads as scratch planning output rather than reference docs). Not urgent, but worth a periodic sweep so root doesn't keep accreting one-off planning artifacts alongside the files a new contributor actually needs (`README.md`, `LICENSE.md`, `SECURITY.md`). Category: repo-hygiene. Fix: move `advisor-plans/` under `docs/` or a `.claude/`-adjacent ignored location if it's meant to stay working-only, or archive/delete once its issues are closed.

## Package / tooling matrix

| package | tsc `strict` | ESLint config | test files / src files | typechecked in CI? |
|---|---|---|---|---|
| `apps/web` | **false** | **none** (0 eslint deps) | 42 / 341 (~12%) | yes, via `pnpm -r typecheck` |
| `apps/mobile` | true | `eslint.config.js` (Expo flat, 5 react-hooks rules disabled w/ documented rationale) | 8 / 267 (~3%) | yes, via `pnpm -r typecheck`; lint via `--filter @calistenia/mobile lint` |
| `packages/core` | n/a — **no tsconfig.json** | none | 71 / 165 (~43%) | **no** — no `typecheck` script exists, only checked transitively by web/mobile |
| `mcp-server` | true | none | 4 / 73 (~5%) | yes, own `typecheck` script (`tsc -p tsconfig.typecheck.json && tsc -p tsconfig.views.json`), but not called from root `pnpm -r typecheck` chain examined here — confirm in `.github/workflows/build-ai-api.yml` |
| `pb_hooks` | n/a (plain JS/goja) | none | 0 direct / 17 (tested via `tests/pb_hooks/`, 20 files, root `test:pb-hooks` script) | yes, `tests/pb_hooks/run.mjs` in `ci.yml`'s `e2e-smoke` job |

## Marker counts (grep, excluding `node_modules`/`dist`/tests)

| marker | apps/web/src | apps/mobile/src | packages/core | mcp-server/src | pb_hooks |
|---|---|---|---|---|---|
| TODO/FIXME/HACK | 2 | 2 | 9 | 7 | 3 |
| eslint-disable | **31 (dead — no eslint config)** | 33 | 3 | 0 | 0 |
| @ts-ignore | 0 | 0 | 0 | 0 | 0 |
| @ts-expect-error | 3 | 0 | 2 | 0 | 0 |
| console.log | 0 | 9 | 0 | 18 | 55 |
| `any` usage | **498** (concentrated in vendored `ai-elements/*` + `ProgramEditorPage.tsx` 25, `ProfilePage.tsx` 19) | 68 | 247 | 87 | 0 (plain JS) |

Note: a large chunk of web's `any` count sits in `apps/web/src/components/ai-elements/*` (`prompt-input.tsx` 33, `commit.tsx` 22, `test-results.tsx` 20, `code-block.tsx` 17, `queue.tsx` 15, `schema-display.tsx` 14, `message.tsx` 13 — files opening with `"use client";;` markers typical of copy-generated Vercel AI Elements components) — these read as vendored/generated rather than hand-written, but still ship as first-party `src` code with no marker distinguishing them, so tooling (and this audit's raw grep) can't cheaply exclude them. `ProgramEditorPage.tsx` (25) and `ProfilePage.tsx` (19) are genuinely hand-written app pages worth a follow-up typing pass.

## Dependency version matrix

| dependency | web | mobile | core | mcp-server |
|---|---|---|---|---|
| react | ^19.2.8 | 19.2.8 | >=18 (peer) | ^19.2.8 |
| react-dom | ^19.2.8 | — | — | ^19.2.8 |
| react-native | — | 0.86.2 | — | — |
| @tanstack/react-query | ^5.101.4 | ^5.101.4 | ^5 (peer) | — |
| pocketbase | ^0.27.1 | ^0.27.1 | ^0.27.1 | ^0.27.1 |
| i18next | ^26.3.6 | ^26.3.6 | ^26.3.6 | — |
| react-i18next | ^17.0.11 | ^17.0.11 | ^17.0.11 | — |
| zod | — | — | — | ^4.4.3 |
| date-fns | — | — | — | — |
| dayjs | ^1.11.21 | — | ^1.11.21 | ^1.11.21 |
| typescript | ^5.9.3 | **~6.0.3** | — (no tsconfig) | ^5.9.3 |
| vitest | ^4.1.10 | ^4.1.10 | ^4.1.10 | **^3.2.4** |

pocketbase, i18next, react-i18next, dayjs and react/react-query are all consistent across the workspaces that use them — good discipline there. `typescript` and `vitest` are the two visible drifts.

## Done well
- No real secrets are tracked: `secret.json`, `calistenia-release.jks`, the Firebase **admin-SDK** JSON, `.env`/`.env.local`, `pb_data/` and `pb_data_backup_*/` are all correctly gitignored and verified absent from `git ls-files`; only `.env.example` is tracked.
- `.gitignore` is thorough and well-commented (Spanish inline rationale for the `react-native-css-interop` single-copy requirement, keystore rules, etc.) — shows real incident-driven hardening, not boilerplate.
- `security.yml` runs Gitleaks secret-scanning and a dependency-review action on every push/PR to `main`.
- `ci-mobile.yml` has a well-documented, deliberate design (reuses `ci.yml` via `workflow_call` instead of duplicating steps) with an explicit comment trail explaining a past bug (#437, mobile-only PRs skipping CI) and why the fix doesn't duplicate logic.
- `packages/core` — despite the missing tsconfig — has the healthiest test ratio in the repo (71 test files / 165 source files, ~43%), far above web/mobile/mcp-server.
- Consistent, deliberate `pnpm` version pinning for cross-cutting deps (`pocketbase`, `i18next`, `dayjs`, `react-query`) across the packages that use them, plus a documented `overrides` block in `pnpm-workspace.yaml` explaining exactly why `react-native-css-interop` must stay single-copy (references a real production incident).
- `commitlint.config.js` is tuned thoughtfully for this project (Spanish subjects exempted from case rules, type-enum kept in sync with the changelog generator via a code comment).

## Files reviewed
Read fully: `.gitignore`, root `package.json`, `pnpm-workspace.yaml`, `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/mobile/package.json`, `apps/mobile/tsconfig.json`, `apps/mobile/eslint.config.js`, `packages/core/package.json`, `mcp-server/package.json`, `mcp-server/tsconfig.json`, `.github/workflows/ci.yml`, `.github/workflows/ci-mobile.yml`, `.github/workflows/security.yml`, `commitlint.config.js`, `.npmrc`, `mcp-server/Dockerfile` (partial), sample content of `google-services.json`, `pb_out.log`-adjacent snapshot files, `advisor-plans/README.md` (date only).

Skimmed / grepped only (pattern search across whole scope, not line-by-line read): `apps/web/src`, `apps/mobile/src`, `packages/core`, `mcp-server/src`, `pb_hooks` (marker counts, `any`/`console.log`/`eslint-disable` grep sweeps); `.github/workflows/build-app.yml`, `build-ai-api.yml`, `build-mobile-apk.yml` (trigger `paths:` only); full root directory listing (`ls -la`) for artifact inventory.

Not reviewed (out of scope / not reached): actual line-by-line content of `ai-elements/*` vendored components beyond the header/any-count check; `.design-sync/`, `.ds-sync/` internals (both gitignored, skipped); `mcp-server/src` business logic (left for the backend-scoped review to judge the missing `@calistenia/core` dependency, finding #8).
