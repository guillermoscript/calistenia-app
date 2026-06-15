# Plan 010: Extraer helper tipado para mutaciones optimistas

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 4659cd6..HEAD -- \
>   packages/core/hooks/useSleep.ts \
>   packages/core/hooks/useMealReminders.ts \
>   packages/core/hooks/useWater.ts \
>   packages/core/hooks/useBodyMeasurements.ts \
>   packages/core/hooks/useCommentReactions.ts \
>   packages/core/hooks/useWeight.ts \
>   packages/core/hooks/useRestPreferences.ts \
>   packages/core/lib/
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M/L
- **Risk**: LOW
- **Depends on**: plans/002-usewater-wrong-day-persistence.md, plans/003-*.md, plans/005-*.md
- **Category**: tech-debt
- **Planned at**: commit `4659cd6`, 2026-06-15

## Why this matters

El patrón optimista `onMutate: cancelQueries → snapshot → setQueryData+LS → return {prev}` con `onError: restore prev` está duplicado ~13 veces en 7 hooks. La duplicación incrementa la superficie de bugs y ya ha producido una divergencia real: `useWeight` usa `ctx: any` en lugar de un tipo inferido, lo cual oculta errores de compilación. Un helper tipado centralizado también resuelve un riesgo latente: si el `key` cambia entre `onMutate` y `onError` (e.g., por un cambio de userId en vuelo), el rollback se aplica a la clave equivocada porque hoy cada `onError` cierra sobre el `key` del scope del hook, no el key usado en `onMutate`. El helper captura el key resuelto en el contexto de mutación y lo retorna, garantizando rollback consistente.

**IMPORTANTE — orden de ejecución**: Este plan DEBE ejecutarse DESPUÉS de plans/002, plans/003 y plans/005 (correcciones de correctness en useWater, useMealReminders, useWeight y useWorkoutReminders). Si se ejecuta antes, los fixes de correctness de esos planes quedarían enterrados en el diff de este refactor, dificultando la revisión y el rollback.

## Current state

### Archivos afectados

- `packages/core/hooks/useSleep.ts` — 3 mutaciones optimistas (add/update/delete); usa `ctx?.prev` con tipo inferido correcto
- `packages/core/hooks/useMealReminders.ts` — 4 mutaciones optimistas (save/update/toggle/delete); usa `ctx?.prev` con tipo inferido
- `packages/core/hooks/useWater.ts` — 3 mutaciones optimistas (addEntry/removeEntry/setGoal); setGoal difiere (valor escalar, no array)
- `packages/core/hooks/useBodyMeasurements.ts` — 2 mutaciones optimistas (add/delete)
- `packages/core/hooks/useCommentReactions.ts` — 1 mutación optimista (toggleReaction); la clave se recalcula dentro de `onMutate` a partir de `commentId` (patrón divergente — ver STOP)
- `packages/core/hooks/useWeight.ts` — 2 mutaciones (add/delete); usa `ctx: any` en onError (líneas 110, 119, 144) — bug de tipado
- `packages/core/hooks/useRestPreferences.ts` — 1 mutación optimista (setPreference)

### Patrón duplicado representativo (useSleep.ts, mutación add, líneas ~180–207)

```typescript
// packages/core/hooks/useSleep.ts
onMutate: async (input: SleepEntryInput) => {
  await qc.cancelQueries({ queryKey: key })
  const prev = qc.getQueryData<SleepEntry[]>(key) ?? lsGet()
  // ... calcula next ...
  qc.setQueryData(key, next)
  lsSet(next)               // write-through a LS
  return { prev }
},
onError: (_err, _input, ctx) => {
  if (ctx?.prev) {
    lsSet(ctx.prev)
    qc.setQueryData(key, ctx.prev)
  }
},
```

El mismo bloque aparece en useMealReminders (~125–147, ~175–188, ~203–215, ~231–242),
useWater (~142–160, ~184–199), useBodyMeasurements (~94–112, ~122–131),
useCommentReactions (~139–169), useWeight (~94–123, ~136–147),
useRestPreferences (~99–115).

### Convención del repositorio

- Query keys centralizadas en `packages/core/lib/query-keys.ts` (`qk.*`)
- Archivos de utilidades compartidas en `packages/core/lib/`
- Hooks en `packages/core/hooks/`
- Comentarios en español (convención del repo)

## Commands you will need

| Purpose              | Command                                          | Expected on success     |
|----------------------|--------------------------------------------------|-------------------------|
| Checkout de rama     | `git checkout feat/mobile-data-perf`            | rama activa             |
| Typecheck web        | `cd apps/web && pnpm exec tsc --noEmit`         | exit 0, sin errores     |
| Typecheck mobile     | `cd apps/mobile && pnpm exec tsc --noEmit`      | exit 0, sin errores     |
| Typecheck core       | `cd packages/core && pnpm exec tsc --noEmit`    | exit 0, sin errores     |
| Build                | `pnpm build`                                    | exit 0                  |
| Verificar usos       | `grep -rn "onMutate\|cancelQueries" packages/core/hooks/` | lista de hits |

## Scope

**In scope** (solo estos archivos):
- `packages/core/lib/optimistic.ts` (crear)
- `packages/core/hooks/useSleep.ts`
- `packages/core/hooks/useMealReminders.ts`
- `packages/core/hooks/useWater.ts`
- `packages/core/hooks/useBodyMeasurements.ts`
- `packages/core/hooks/useWeight.ts`
- `packages/core/hooks/useRestPreferences.ts`

**Out of scope** (NO tocar):
- `packages/core/hooks/useCommentReactions.ts` — su `onMutate` recalcula el key dentro del handler a partir de `commentId` (patrón divergente que el helper no cubre sin añadir complejidad injustificada). Dejar sin refactorizar; documentar en maintenance notes.
- Cualquier archivo en `apps/web/` o `apps/mobile/` — las APIs públicas de los hooks no cambian.
- `packages/core/lib/query-keys.ts` — no necesita cambios.

## Git workflow

- Rama: `feat/mobile-data-perf` (ya existe; no crear nueva)
- Un commit por hook refactorizado: `refactor(core): use makeOptimisticListHandlers in useSleep`
- Commit del helper primero, luego los hooks uno a uno
- NO push, NO PR, NO rebase, NO merge

## Steps

### Step 0: Checkout de la rama correcta

```
git checkout feat/mobile-data-perf
```

**Verify**: `git branch --show-current` → `feat/mobile-data-perf`

### Step 1: Crear `packages/core/lib/optimistic.ts`

Crear el archivo con el helper tipado. La firma exacta a producir:

```typescript
// packages/core/lib/optimistic.ts
// Helper para mutaciones optimistas de lista con write-through a localStorage.
// Encapsula el patrón: cancelQueries → snapshot → apply → lsWrite → return {prev, resolvedKey}.
// onError revierte usando resolvedKey (capturado en context), evitando rollback a clave errónea
// si el key del hook cambió entre onMutate y onError.

import type { QueryClient, QueryKey } from '@tanstack/react-query'

export interface OptimisticContext<T> {
  prev: T
  resolvedKey: QueryKey
}

export interface OptimisticListHandlers<T, TVariables> {
  onMutate: (variables: TVariables) => Promise<OptimisticContext<T>>
  onError: (
    err: unknown,
    variables: TVariables,
    ctx: OptimisticContext<T> | undefined
  ) => void
}

/**
 * Genera { onMutate, onError } para mutaciones optimistas sobre una lista en caché.
 *
 * @param qc       - QueryClient de TanStack Query
 * @param getKey   - Función que devuelve el QueryKey actual (se evalúa en onMutate)
 * @param getDefault - Valor por defecto si la caché y el LS están vacíos
 * @param updater  - Función pura que calcula el siguiente estado dado el actual y las variables
 * @param lsWrite  - Callback que persiste el nuevo estado en localStorage (puede ser no-op)
 */
export function makeOptimisticListHandlers<T, TVariables>(
  qc: QueryClient,
  getKey: () => QueryKey,
  getDefault: () => T,
  updater: (current: T, variables: TVariables) => T,
  lsWrite: (next: T) => void,
): OptimisticListHandlers<T, TVariables> {
  return {
    onMutate: async (variables) => {
      const resolvedKey = getKey()
      await qc.cancelQueries({ queryKey: resolvedKey })
      const prev = qc.getQueryData<T>(resolvedKey) ?? getDefault()
      const next = updater(prev, variables)
      qc.setQueryData(resolvedKey, next)
      lsWrite(next)
      return { prev, resolvedKey }
    },
    onError: (_err, _variables, ctx) => {
      if (!ctx?.prev) return
      lsWrite(ctx.prev)
      qc.setQueryData(ctx.resolvedKey, ctx.prev)
    },
  }
}
```

**Verify**: `cd packages/core && pnpm exec tsc --noEmit` → exit 0

### Step 2: Refactorizar `useSleep.ts`

Las 3 mutaciones de useSleep (add/update/delete) comparten el mismo `key` y trabajan sobre `SleepEntry[]`.

Para cada mutación:
1. Importar `makeOptimisticListHandlers` desde `'../lib/optimistic'`
2. Definir un `updater` específico (la lógica del `next` ya existe en el hook)
3. Reemplazar el bloque `onMutate`/`onError` por el resultado del helper

Ejemplo para la mutación `addEntry` (tipo de variable `SleepEntryInput`):

```typescript
const addHandlers = makeOptimisticListHandlers<SleepEntry[], SleepEntryInput>(
  qc,
  () => key,           // getKey — captura el key en el momento de onMutate
  lsGet,               // getDefault
  (prev, input) => {   // updater — misma lógica que existía en onMutate
    const optimistic: SleepEntry = { id: `opt_${Date.now()}`, ...input, synced: false }
    return [optimistic, ...prev]
  },
  lsSet,               // lsWrite
)
// En useMutation: ...addHandlers (spread en el options object)
```

Repetir para update y delete con sus respectivos updaters.

**Verify**: `cd packages/core && pnpm exec tsc --noEmit` → exit 0

### Step 3: Refactorizar `useMealReminders.ts`

Las 4 mutaciones (save/update/toggle/delete) comparten `remindersKey` y trabajan sobre `MealReminder[]`.

Misma mecánica que Step 2. Los updaters corresponden exactamente a la lógica que ya existe en cada `onMutate` (calcular `next`). Usar `makeOptimisticListHandlers` con `getKey: () => remindersKey`.

**STOP si**: la mutación `toggle` tiene lógica de `onMutate` que además invalida otras queries — en ese caso dejar esa mutación sin refactorizar y documentarlo.

**Verify**: `cd packages/core && pnpm exec tsc --noEmit` → exit 0

### Step 4: Refactorizar `useWater.ts`

`useWater` tiene 3 mutaciones:
- `addEntry` y `removeEntry` operan sobre `DayWater` (no un array plano) — el helper es aplicable con `T = DayWater`.
- `setGoal` opera sobre `number` (valor escalar, key diferente `goalKey`) — también aplicable con `T = number`.

Para `setGoal`, el updater es `(_prev, ml) => ml`.

**STOP si**: `addEntry` tiene lógica de `onSuccess` que corrige el ID optimista — esa lógica debe permanecer en `onSuccess` y NO se mueve al helper. Solo reemplazar `onMutate` y `onError`.

**Verify**: `cd packages/core && pnpm exec tsc --noEmit` → exit 0

### Step 5: Refactorizar `useBodyMeasurements.ts`

Las 2 mutaciones (add/delete) operan sobre `BodyMeasurement[]`.

**STOP si**: `add` tiene `onSuccess` con lógica de swap de ID optimista + re-sort — dejar `onSuccess` intacto, solo reemplazar `onMutate`/`onError`.

**Verify**: `cd packages/core && pnpm exec tsc --noEmit` → exit 0

### Step 6: Refactorizar `useWeight.ts` (elimina `ctx: any`)

Las 2 mutaciones (add/delete) operan sobre `WeightEntry[]`. La motivación principal aquí es eliminar `ctx: any` en líneas 110, 119 y 144 — el helper devuelve `OptimisticContext<WeightEntry[]>` tipado, eliminando el `any`.

**STOP si**: `add` tiene un `onSuccess` con swap de ID optimista — dejar `onSuccess` intacto.

**Verify**: `cd packages/core && pnpm exec tsc --noEmit` → `grep -n 'ctx: any' packages/core/hooks/useWeight.ts` → sin resultados

### Step 7: Refactorizar `useRestPreferences.ts`

1 mutación (`setPreference`) sobre `RestPrefsCache`. El `updater` calcula `nextPrefs` dentro del `prefs` del cache.

**Verify**: `cd packages/core && pnpm exec tsc --noEmit` → exit 0

### Step 8: Verificación final

```bash
cd apps/web && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec tsc --noEmit
pnpm build
grep -rn 'ctx: any' packages/core/hooks/
```

Esperado:
- Typechecks: exit 0
- Build: exit 0
- `grep ctx: any` → sin resultados en los hooks in-scope (useCommentReactions puede quedar si la tenía)

## Test plan

No hay tests unitarios de hooks en este repo (patron observado). La verificación es:

1. Typecheck limpio (Steps 2–7 y Step 8)
2. Build limpio (Step 8)
3. Inspección manual de que el helper se usa en ≥4 hooks: `grep -rn 'makeOptimisticListHandlers' packages/core/hooks/` debe retornar ≥4 hits

## Done criteria

- [ ] `packages/core/lib/optimistic.ts` existe y exporta `makeOptimisticListHandlers`
- [ ] `grep -rn 'makeOptimisticListHandlers' packages/core/hooks/` retorna ≥4 archivos
- [ ] `grep -n 'ctx: any' packages/core/hooks/useWeight.ts` → sin resultados
- [ ] `cd apps/web && pnpm exec tsc --noEmit` → exit 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0
- [ ] `pnpm build` → exit 0
- [ ] `git diff --name-only` no muestra archivos fuera de la lista in-scope
- [ ] `plans/README.md` actualizado con status de este plan

## STOP conditions

- El código en los "Current state" excerpts no coincide con el live code (drift desde 4659cd6).
- Un typecheck falla después de dos intentos de fix razonables.
- El helper genérico no puede cubrir la forma de una mutación sin añadir parámetros extra complicados — dejar esa mutación sin refactorizar y documentarlo en las notas.
- Cualquier paso requiere tocar `apps/web/` o `apps/mobile/`.
- `useCommentReactions.ts` aparece en la lista de cambios — está fuera de scope.

## Maintenance notes

- `useCommentReactions.ts` queda sin refactorizar: su `onMutate` recalcula el key internamente a partir de `commentId` (distinto al patrón donde el key es fijo en el scope del hook). Se puede migrar en un plan futuro si se generaliza el helper con un parámetro `getKey(variables)`.
- Si se añaden nuevas mutaciones optimistas a los hooks existentes, usar `makeOptimisticListHandlers` desde el principio.
- Revisar en PR: que cada `updater` sea una función pura sin efectos secundarios; que el `lsWrite` callback no llame a ninguna query ni invalide nada.
- El helper NO incluye `onSuccess` — cada mutación puede seguir teniendo su propio `onSuccess` para lógica de swap de ID optimista o invalidaciones adicionales.
