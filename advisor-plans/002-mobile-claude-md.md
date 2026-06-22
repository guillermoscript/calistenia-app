# Plan 002: Add `apps/mobile/CLAUDE.md` — an agent-facing guide to the native app

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, add this plan's status row to the table in `advisor-plans/README.md` (see Step 7 — there is no existing row for plan 002 yet) — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 943f558..HEAD -- apps/mobile/CLAUDE.md apps/mobile/package.json apps/mobile/tailwind.config.js apps/mobile/src/lib/init-core.ts apps/mobile/app.json apps/mobile/src/contexts`
> This plan only *creates* `apps/mobile/CLAUDE.md`; the other paths are sources whose facts are embedded below. If any of those source files changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch in a fact you are about to write into the doc, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `943f558`, 2026-06-21

## Why this matters

The native app (`apps/mobile`) is largely driven by AI agents, and every session currently re-discovers the architecture from scratch: which package holds shared logic, how `@calistenia/core` is wired in, which contexts are state hubs, that there is no React-Native render-test infrastructure, and the env/build gotchas that have already burned past sessions (LAN `.env.local` leaking into release builds, stale Android `versionCode`). The only file an agent would naturally open first — `apps/mobile/README.md` — is the stock `create-expo-app` template (verified: it begins "# Welcome to your Expo app", 56 lines of boilerplate) and tells it nothing real. This plan adds a concise, fact-checked `CLAUDE.md` so any agent gets the map and the landmines up front. It is doc-only (no source changes), so risk is LOW; the win is fewer wrong turns and repeated rediscovery per session.

## Current state

There is **no `CLAUDE.md` anywhere in the repo** (verified: `find . -name CLAUDE.md -not -path '*/node_modules/*' | wc -l` returns `0`). You are creating the first one, scoped to the native app.

The facts below were read directly from the repo at commit `943f558`. They are the *only* facts you should put in the file — do not invent anything beyond them.

- `apps/mobile/README.md` — stock Expo template ("# Welcome to your Expo app", 56 lines), no project-specific content. Leave it untouched.
- `apps/mobile/package.json` — scripts and the dependency list. Verbatim excerpt of the `scripts` block:
  ```
   5	  "scripts": {
   6	    "start": "expo start",
   7	    "android": "expo run:android",
   8	    "ios": "expo run:ios",
   9	    "web": "expo start --web",
  10	    "typecheck": "tsc --noEmit",
  11	    "lint": "expo lint",
  12	    "test": "vitest run"
  13	  },
  ```
  Key deps (from the same file): `expo ~56.0.9`, `react-native 0.85.3`, `react 19.2.3`, `expo-router ~56.2.9`, `nativewind ^4.2.5`, `@tanstack/react-query ^5.66.0`, `pocketbase ^0.26.9`, `@calistenia/core workspace:*`, `react-native-reanimated 4.3.1`, `@gorhom/bottom-sheet ^5.2.14`, `@notifee/react-native ^9.1.8`, `expo-location ~56.0.16`, `expo-task-manager ~56.0.17`, `vitest ^4.1.8` (devDep). `"version": "1.0.0"`.
- `packages/core/package.json` describes core's contract verbatim (line 6): *"Código compartido entre web y mobile: types, hooks, lib, data, locales. Sin dependencias de DOM ni React Native — lo específico de cada plataforma se inyecta vía initCore() (ver platform.ts)."* Core's `package.json` has **no `scripts` block at all** (verified — there is no `scripts` key).
- `apps/mobile/src/lib/init-core.ts` — initializes `@calistenia/core` for RN; **must be the first import of `app/_layout.tsx`** (stated in its header comment, lines 1–6). Env vars it reads (verified by grep): `EXPO_PUBLIC_PB_URL` (init-core.ts:75), `EXPO_PUBLIC_AI_API_URL` (init-core.ts:79), `EXPO_PUBLIC_OPENPANEL_CLIENT_ID` (init-core.ts:102). The PB URL resolution, verbatim:
  ```
  74	const pbUrl =
  75	  process.env.EXPO_PUBLIC_PB_URL ||
  76	  (__DEV__ && devHost ? `http://${devHost}:8090` : 'https://gym.guille.tech')
  ```
  Note: init-core.ts:102 has a hard-coded fallback OpenPanel `clientId` (a **public** analytics ingest id, not a secret). Do NOT copy that value into the doc — reference the env var by name only.
- `apps/mobile/tailwind.config.js:58-70` — the font-family rule the design system depends on, verbatim:
  ```
  58	      // En RN cada peso es una familia aparte (src/lib/fonts.ts) — usar estas
  59	      // clases en vez de font-bold/font-semibold para que Android no haga
  60	      // synthetic bold sobre la regular.
  61	      fontFamily: {
  62	        bebas: ['BebasNeue_400Regular'],
  63	        sans: ['DMSans_400Regular'],
  64	        'sans-italic': ['DMSans_400Regular_Italic'],
  65	        'sans-medium': ['DMSans_500Medium'],
  66	        'sans-bold': ['DMSans_700Bold'],
  67	        mono: ['JetBrainsMono_400Regular'],
  68	        'mono-semibold': ['JetBrainsMono_600SemiBold'],
  69	        'mono-bold': ['JetBrainsMono_700Bold'],
  70	      },
  ```
- Directory layout under `apps/mobile/src/` (verified by `ls`): `app/` (expo-router file routes — `(tabs)/` group with `index/history/library/nutrition/profile/programs` plus stacked routes `cardio`, `session`, `social`, `friends`, `race`, `reminders`, etc.), `components/` (**10** subfolders, verified: `ai-elements/`, `cardio/`, `free-session/`, `home/`, `nutrition/`, `onboarding/`, `race/`, `share/`, `social/`, `ui/`), `contexts/` (**4** files), `lib/` (42 entries — platform glue), `widgets/` (Android home-screen widgets: `TodayWidget`, `CardioWidget`, `NutritionWidget`, `NutritionRingWidget`, `widget-task-handler`).
- Contexts (verified file sizes + header comments):
  - `contexts/ActiveSessionContext.tsx` (8.7 KB) — strength-session state hub. Header comment (lines 1–3), verbatim: *"Port del ActiveSessionContext de apps/web. Misma arquitectura: SessionView es dueño del estado local (stepIdx/phase) y lo empuja aquí; el context nunca se lee de vuelta durante la sesión, solo para restaurar tras navegar fuera."*
  - `contexts/WorkoutContext.tsx` (6.2 KB) — header comment (line 1), verbatim: *"Port 1:1 del WorkoutContext de apps/web — los hooks de core son portables."* Exposes (verified): `progress`, `settings`, `programs`, `activeProgram`, `phases`, `weekDays`, `cardioDayConfigs`, `programsReady`.
  - `contexts/CardioSessionContext.tsx` (712 lines, 26 KB) — background GPS (expo-location + Android FGS) + live notification; ~1s tick.
  - `contexts/RaceContext.tsx` (16.8 KB) — realtime multiplayer races (PB realtime, countdown, push); ~500ms tick class.
  - `components/SessionView.tsx` — **1362 lines** (verified by `wc -l`), god component (timer + session state machine + UI + audio/haptics + share).
- Test infra (verified): `cd apps/mobile && npm run test` runs `vitest run` and passes **3 files / 13 tests**; all are pure-logic (`src/lib/__tests__/{live-activity-state,widget-snapshot,nutrition-widget-snapshot}.test.ts`). There is **no vitest config file, no `@testing-library/react-native`, no jest-expo** (grep for those names returns nothing) — tests run in the default node env. Exemplar pattern: `src/lib/__tests__/live-activity-state.test.ts` opens with `import { describe, it, expect } from 'vitest'` then `import { mapPhaseToActivity } from '../live-activity-state'` and asserts on its return. Core's tests (`packages/core/lib/*.test.ts`, **5 files / 57 tests**) are run via the **mobile workspace's hoisted vitest binary** — there is no `pnpm --filter @calistenia/core test` script (core has no `scripts` block). Verified failure mode: from `packages/core`, `pnpm --filter @calistenia/core exec vitest run` errors with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "vitest" not found`. Verified working invocation: from `packages/core`, `../../apps/mobile/node_modules/.bin/vitest run` → `Test Files 5 passed (5) / Tests 57 passed (57)`.
- Version/build gotcha (verified): `apps/mobile/app.json` has `"version": "1.0.3"` (line 6) and `"versionCode": 5` (line 30), while `apps/mobile/package.json` has `"version": "1.0.0"`. The Android install gotcha (from project memory): a `versionCode` not bumped above the already-installed build silently installs the old code.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | (from repo root) `pnpm install` | exit 0 |
| Mobile typecheck | `cd apps/mobile && npm run typecheck` | exit 0 (runs `tsc --noEmit`; clean on `943f558` — verified) |
| Mobile tests | `cd apps/mobile && npm run test` | `vitest run` — `Test Files 3 passed (3) / Tests 13 passed (13)` |
| Mobile lint | `cd apps/mobile && npm run lint` | `expo lint`, exit 0 |
| Confirm file exists | `test -f apps/mobile/CLAUDE.md && echo OK` | prints `OK` |
| Confirm section headers present | `grep -c '^## ' apps/mobile/CLAUDE.md` | a number `>= 8` |

(All verified during recon. Run install once if `node_modules` is missing; not otherwise needed for a doc-only change.)

## Scope

**In scope** (the only files you create/modify):
- `apps/mobile/CLAUDE.md` (create)
- `advisor-plans/README.md` (add this plan's status row — see Step 7)

**Out of scope** (do NOT touch):
- `apps/mobile/README.md` — leave the stock Expo template as-is; this plan deliberately does not rewrite it.
- Any source file under `apps/mobile/src/`, `packages/core/`, configs, or `app.json`. This is a documentation-only change; touching code is out of scope and a STOP condition.
- Creating a repo-root `CLAUDE.md` or any other `CLAUDE.md` — only the mobile one.

## Git workflow

- Branch: `advisor/002-mobile-claude-md` (create it; do not work on `main`). Pattern matches the existing `advisor/013-navcontext-crash`.
- Stage with explicit paths only: `git add apps/mobile/CLAUDE.md` (and `git add advisor-plans/README.md` when you update the index in Step 7). **Never** `git add -A`.
- Commit message style: Conventional Commits with scope, e.g. `docs(mobile): add CLAUDE.md agent guide for the native app`. No Co-authored-by line required.
- Do NOT push, merge, rebase, or open a PR. The operator does that.

## Steps

### Step 1: Create the branch

From the repo root:

```
git checkout -b advisor/002-mobile-claude-md
```

**Verify**: `git branch --show-current` → prints `advisor/002-mobile-claude-md`

### Step 2: Confirm the file does not already exist

```
ls apps/mobile/CLAUDE.md
```

**Verify**: command prints `ls: apps/mobile/CLAUDE.md: No such file or directory` (non-zero exit). If the file already exists, this is a STOP condition (drift) — stop and report.

### Step 3: Create `apps/mobile/CLAUDE.md` with EXACTLY this content

Write the file with the content in the fenced block below, verbatim (do not paraphrase, do not add sections, do not change the env-var names or numbers). The block is the file body.

````markdown
# CLAUDE.md — Native app (`apps/mobile`)

Guía para agentes que trabajan en la app nativa (Expo). El `README.md` de esta
carpeta es la plantilla por defecto de `create-expo-app` e **ignóralo**: este
archivo es la fuente de verdad. Comentarios y textos de UI van en **español**
(ver "Convenciones").

## Visión general

App Expo del monorepo (pnpm workspaces). Stack:

- **Expo SDK 56**, **React Native 0.85**, **React 19**.
- **expo-router** — rutas basadas en archivos en `src/app/`.
- **NativeWind v4** — estilos con `className` (Tailwind). No uses `StyleSheet`
  salvo en archivos que ya lo usen.
- **TanStack Query v5** — caché/estado de servidor.
- **PocketBase** — backend (SDK `pb`, singleton en core).
- **`@calistenia/core`** (`workspace:*`) — lógica de negocio compartida entre
  web y mobile: types, hooks, lib, data, locales. **Sin dependencias de DOM ni
  React Native**; lo específico de plataforma se inyecta vía `initCore()`.
  **Regla**: si añades lógica reutilizable (cálculos, hooks de datos, helpers),
  ponla en `packages/core`, no la dupliques aquí.

## Mapa de directorios (`apps/mobile/src/`)

- `app/` — rutas de expo-router (file-based). Grupo `(tabs)/`
  (`index`, `history`, `library`, `nutrition`, `profile`, `programs`) y rutas
  apiladas (`cardio`, `session`, `social`, `friends`, `race`, `reminders`, …).
  `app/_layout.tsx` es la raíz.
- `components/` — componentes UI. Subcarpetas: `ui/` (primitivos), `cardio/`,
  `home/`, `nutrition/`, `social/`, `race/`, `share/`, `onboarding/`,
  `free-session/`, `ai-elements/`.
- `contexts/` — hubs de estado (ver "Módulos críticos").
- `lib/` — "platform glue": adaptadores entre RN/Expo y core (storage, sonidos,
  haptics, i18n, notifications, GPS tracker, push, Sentry/analytics init…).
- `widgets/` — widgets de pantalla de inicio Android (`TodayWidget`,
  `CardioWidget`, `NutritionWidget`, `NutritionRingWidget`).

`src/lib/init-core.ts` llama a `initCore()` y **debe ser el primer import de
`app/_layout.tsx`**: los módulos de core leen el adapter de plataforma al
evaluarse.

## Comandos (ejecutar desde `apps/mobile/`)

| Propósito | Comando | Esperado |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 (`tsc --noEmit`) |
| Tests | `npm run test` | `vitest run`, todos pasan |
| Lint | `npm run lint` | `expo lint`, exit 0 |
| Arrancar | `npm run start` | Metro arranca |
| Run Android/iOS | `npm run android` / `npm run ios` | build nativo |

Instalar deps: `pnpm install` desde la raíz del repo.

## Módulos críticos y peligros conocidos

- `components/SessionView.tsx` (~1362 líneas) — **god component**: timer +
  máquina de estados de la sesión + UI + audio/haptics + compartir. Cambios aquí
  son delicados; toca lo mínimo.
- `contexts/ActiveSessionContext.tsx` — hub de la sesión de fuerza.
  **SessionView es dueño del estado local (`stepIdx`/`phase`) y lo empuja al
  context; el context nunca se lee de vuelta durante la sesión, solo para
  restaurar tras navegar fuera.** No inviertas ese flujo.
- `contexts/WorkoutContext.tsx` — programa activo, progreso, settings, fases,
  días de la semana (port 1:1 del de web).
- `contexts/CardioSessionContext.tsx` (~712 líneas) — GPS en segundo plano
  (expo-location + Foreground Service en Android) + notificación en vivo.
- `contexts/RaceContext.tsx` — carreras multijugador en tiempo real (PB realtime,
  countdown, push periódico).
- **Re-renders**: los contexts de alta frecuencia re-renderizan a TODOS sus
  consumidores en cada tick (cardio ~1s, race ~500ms). No metas componentes
  caros como consumidores directos; memoiza y aísla.

## Testing

- `npm run test` ejecuta **vitest en el entorno node por defecto**. NO hay
  config de vitest, NO hay `@testing-library/react-native`, NO hay jest-expo.
- **No se pueden renderizar componentes ni contexts de React** en los tests.
- La única estrategia válida es **extraer funciones puras y testearlas**.
  Ejemplar: `src/lib/__tests__/live-activity-state.test.ts` importa la función
  pura `mapPhaseToActivity` y asercia sobre su retorno.
- Tests actuales: 3 archivos en `src/lib/__tests__/`
  (`live-activity-state`, `widget-snapshot`, `nutrition-widget-snapshot`).
- Tests de core viven en `packages/core/lib/*.test.ts`. Core **no tiene script
  de test propio**; se ejecutan con el binario de vitest del workspace mobile
  (p. ej. desde `packages/core/`:
  `../../apps/mobile/node_modules/.bin/vitest run`).

## Convenciones

- **Idioma**: comentarios y textos en **español**. Los textos de UI usan claves
  i18n (`react-i18next`, `t('...')`), no strings literales.
- **Commits**: Conventional Commits con scope —
  `feat(mobile): …`, `fix(cardio): …`, `refactor(mobile): …`,
  `docs(mobile): …`.
- **Estilos**: NativeWind `className`. No introduzcas `StyleSheet` salvo en
  archivos que ya lo usen.
- **Fuentes (design system)**: en RN cada peso es una familia aparte. **No
  combines `font-bold`/`font-semibold` con las fuentes personalizadas**
  (Bebas / DM Sans / JetBrains Mono): Android haría "synthetic bold" sobre la
  regular. Usa las clases de familia de `tailwind.config.js`
  (`font-sans-bold`, `font-mono-bold`, etc.) y `src/lib/fonts.ts`.

## Env / config — cuidado

(Referencia por NOMBRE; nunca pegues valores.)

- `EXPO_PUBLIC_PB_URL` → URL del backend PocketBase
  (`src/lib/init-core.ts`). En `__DEV__` cae al host de Metro; en prod a la URL
  de producción.
- `EXPO_PUBLIC_AI_API_URL` → host de la API de IA (mismo archivo).
- `EXPO_PUBLIC_OPENPANEL_CLIENT_ID` → client id de analytics (público, no es un
  secreto; aun así no lo reproduzcas en docs/PRs).
- **Trampa de release**: un `apps/mobile/.env.local` con una URL de PB en LAN
  tiene **precedencia sobre `.env` en tiempo de compilación** (las
  `EXPO_PUBLIC_*` se inlinean al compilar). Un build de release apuntado a
  producción con ese `.env.local` presente queda apuntando a la LAN y el
  dispositivo no llega al backend (programas vacíos). Para builds de prod,
  compila con la URL de producción (o sin `.env.local`).
- **Trampa de instalación Android**: `app.json` lleva `version` y `versionCode`
  propios (distintos de `package.json`). Si el `versionCode` no se sube por
  encima del build ya instalado, Android instala silenciosamente el código
  viejo. Bump `versionCode` al probar un build nuevo en el mismo dispositivo.

## Backlog de mejoras

Planes de mejora dirigidos por agente viven en
`/Users/guillermomarin/Documents/ejercicios/calistenia-app/advisor-plans/`
(ver su `README.md` para el orden y estado).
````

**Verify**: `test -f apps/mobile/CLAUDE.md && echo OK` → prints `OK`

### Step 4: Confirm the expected section headers are present

```
grep -c '^## ' apps/mobile/CLAUDE.md
```

**Verify**: prints `8` (the file has 8 `##` sections: Visión general, Mapa de directorios, Comandos, Módulos críticos, Testing, Convenciones, Env / config, Backlog de mejoras). A value `>= 8` passes. Then run, expecting each to print a matching line:

```
grep -n -e '^## Visión general' -e '^## Comandos' -e '^## Testing' -e '^## Env / config' -e '^## Convenciones' apps/mobile/CLAUDE.md
```

**Verify**: 5 lines printed, one per header.

### Step 5: Sanity-check that nothing in the codebase broke (it shouldn't — doc only)

```
cd apps/mobile && npm run typecheck
```

**Verify**: exit 0, no errors (unchanged from baseline; a Markdown file is not compiled by `tsc`).

### Step 6: Confirm only the in-scope file changed

```
git status --porcelain
```

**Verify**: before Step 7, the only listed change is `?? apps/mobile/CLAUDE.md`. No `src/` or config file appears. (After Step 7 there will additionally be a modification to `advisor-plans/README.md`.)

### Step 7: Commit and update the plan index

```
git add apps/mobile/CLAUDE.md
git commit -m "docs(mobile): add CLAUDE.md agent guide for the native app"
```

Then update the plan index. Open `advisor-plans/README.md` — it has a 7-column status table (`Plan | Title | Priority | Effort | Risk | Depends on | Status`) and currently lists only plan 001 (there is no row for plan 002 yet). **Add** a new row for this plan immediately below the 001 row, matching the existing column format, e.g.:

```
| 002 | Add apps/mobile/CLAUDE.md — agent-facing guide to the native app | P2 | S | LOW | — | DONE |
```

Do not edit the README's header text or any other row. Then stage and commit it:

```
git add advisor-plans/README.md
git commit -m "docs(advisor): mark plan 002 done in the index"
```

**Verify**: `git log --oneline -2` → shows the two commits above (the `docs(mobile): add CLAUDE.md …` commit and the index update). `git status --porcelain` → empty (working tree clean). Do NOT push.

## Test plan

No new automated tests — this plan creates a Markdown document and adds no code. Rendering a React component or context in a test is impossible in this repo (node-env vitest, no RN render infra), so no test could meaningfully cover a doc anyway. The "tests" are the verification commands in each step: file exists (Step 3), headers present (Step 4), typecheck still clean (Step 5), no out-of-scope changes (Step 6). Run the existing suite once as a regression sanity check:

```
cd apps/mobile && npm run test
```

→ `Test Files 3 passed (3) / Tests 13 passed (13)` (unchanged baseline).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `test -f apps/mobile/CLAUDE.md` succeeds (file exists)
- [ ] `grep -c '^## ' apps/mobile/CLAUDE.md` prints `8` (≥ 8)
- [ ] `grep -q '^## Env / config' apps/mobile/CLAUDE.md && grep -q 'EXPO_PUBLIC_PB_URL' apps/mobile/CLAUDE.md` — both present (exit 0)
- [ ] `cd apps/mobile && npm run typecheck` exits 0
- [ ] `cd apps/mobile && npm run test` exits 0 (3 files / 13 tests)
- [ ] `git status --porcelain` is empty after Step 7 (everything committed)
- [ ] `git diff 943f558 -- apps/mobile/README.md` is empty (stock README untouched)
- [ ] No secret values appear in the file: `grep -nE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}' apps/mobile/CLAUDE.md` returns nothing (env vars referenced by name only — the OpenPanel client id from init-core.ts:102 was NOT copied in)
- [ ] `advisor-plans/README.md` has a status row for plan 002

## STOP conditions

Stop and report back (do not improvise) if:

- `apps/mobile/CLAUDE.md` already exists at Step 2 (the repo drifted; do not overwrite without instruction).
- The "Current state" excerpts no longer match the live files: the `apps/mobile/package.json` `scripts` block differs from the verbatim excerpt, or `tailwind.config.js` no longer defines the `fontFamily` families shown (lines 61–70), or `init-core.ts` no longer reads `EXPO_PUBLIC_PB_URL` at line 75, or `apps/mobile/src/contexts/` no longer has exactly the 4 files named. If a fact you are about to write into the doc is now wrong, do not write the stale fact — stop and report.
- `cd apps/mobile && npm run typecheck` fails (a Markdown-only change cannot cause this; if it does, the working tree drifted independently — stop and report rather than editing code).
- Executing this plan would require editing any source file, `app.json`, or `apps/mobile/README.md`. This is documentation-only.
- You cannot find an existing row format to match in `advisor-plans/README.md` (e.g. the table structure changed). Do not guess a format — stop and report.
- You are uncertain about any concrete fact (an env-var name, a line count, the test command). Re-read the source file named in "Current state" and use what it actually says; if it contradicts this plan, stop and report rather than guessing.

## Maintenance notes

- This doc embeds facts that will drift: dependency versions (SDK 56 / RN 0.85 / React 19), file/line counts (`SessionView.tsx` ~1362 lines, `CardioSessionContext.tsx` ~712 lines), the context inventory (4 files today), and the `app.json` version/versionCode pair (`1.0.3` / `5` today). They are written as approximations ("~") on purpose; a reviewer should not block on exact numbers but should fix anything that becomes *wrong* (e.g. a context renamed/removed, a new env var added to `init-core.ts`, the test command changing).
- The core-test invocation (running `packages/core` tests via the mobile workspace's hoisted vitest binary at `../../apps/mobile/node_modules/.bin/vitest run`) is fragile — if a `test` script is later added to `packages/core/package.json`, update the Testing section to the new canonical command.
- Reviewer should scrutinize: that no secret value leaked in (env vars by name only — the OpenPanel client id at init-core.ts:102 is public but should still not be pasted), that the font rule matches `tailwind.config.js`, and that the "put shared logic in core" guidance still reflects `packages/core`'s no-DOM/no-RN contract (line 6 of its package.json).
- Deferred out of scope: rewriting `apps/mobile/README.md`, and adding a repo-root `CLAUDE.md` covering web + core. If those are wanted, they are separate plans.

---

Plan file to create: `/Users/guillermomarin/Documents/ejercicios/calistenia-app/advisor-plans/002-mobile-claude-md.md`