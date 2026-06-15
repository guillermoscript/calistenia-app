# Plan 011: Unificar semántica de `loading` en hooks migrados a TanStack Query

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
>   packages/core/hooks/useActivityFeed.ts \
>   packages/core/hooks/useDiscoverRaces.ts \
>   packages/core/hooks/useNotifications.ts \
>   packages/core/hooks/useLeaderboard.ts \
>   packages/core/hooks/useFollows.ts \
>   packages/core/hooks/useReferralPoints.ts \
>   packages/core/hooks/useProfileCompare.ts \
>   packages/core/hooks/useChallengeDetail.ts \
>   packages/core/hooks/useChallenges.ts \
>   packages/core/hooks/useProgressions.ts \
>   packages/core/hooks/useCardioStats.ts
> ```
> Si algún archivo in-scope cambió desde que se escribió este plan, comparar
> los excerpts de "Current state" contra el código live antes de continuar;
> cualquier discrepancia es condición de STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: ninguno
- **Category**: tech-debt
- **Planned at**: commit `4659cd6`, 2026-06-15

## Why this matters

Tras la migración a TanStack Query, el campo `loading` de los hooks migrados tiene significado inconsistente: algunos mapean a `isFetching` (true en cada refetch de fondo, causa spinners inesperados en consumers que ya tienen datos), otros a `isLoading`/`isPending` (solo primera carga), y al menos uno (`useActivityFeed`) mezcla ambos en una sola expresión. Esta inconsistencia hace que los componentes consumidores se comporten de forma impredecible cuando el mismo hook se usa en contextos distintos (lista vacía vs. lista con datos, pull-to-refresh vs. carga inicial). La convención adoptada es: `loading` = primera carga únicamente; `refreshing` = refetch de fondo (para pull-to-refresh). Los consumers que hoy dependen de `isFetching` para un spinner de pull-to-refresh deben migrar a `refreshing`.

## Current state

### Hooks y semántica actual verificada (@ 4659cd6)

| Hook | Campo | Valor actual | Semántica incorrecta |
|------|-------|-------------|----------------------|
| `useActivityFeed.ts:129` | `loading` | `metaQuery.isFetching \|\| feedQuery.isLoading` | MIXTO: isFetching en meta, isLoading en feed |
| `useDiscoverRaces.ts:112` | `loading` | `isFetching` | Spinner en cada refetch de fondo |
| `useNotifications.ts:192` | `loading` | `listQuery.isFetching` | Spinner en cada refetch de fondo |
| `useLeaderboard.ts:176` | `loading` | `query.isFetching` | Spinner en cada refetch de fondo |
| `useFollows.ts:210` | `loading` | `isFetching` | Spinner en cada refetch de fondo |
| `useReferralPoints.ts:154` | `loading` | `transactionsQuery.isFetching` | Spinner en cada refetch de fondo |
| `useProfileCompare.ts:159` | `loading` | `isFetching` | Spinner en cada refetch de fondo |
| `useChallengeDetail.ts:114` | `loading` | `challengeQuery.isLoading \|\| leaderboardQuery.isLoading` | isLoading — CORRECTO |
| `useChallenges.ts:207` | `loading` | `isLoading` | isLoading — CORRECTO |
| `useProgressions.ts:102` | `loading` | `isLoading` | isLoading — CORRECTO |
| `useCardioStats.ts:220` | `loading` | `query.isLoading` | isLoading — CORRECTO |

### Excerpt representativo — caso MIXTO (useActivityFeed.ts:127–132)

```typescript
// packages/core/hooks/useActivityFeed.ts
return {
  items,
  loading: metaQuery.isFetching || feedQuery.isLoading,   // MIXED
  loadingMore: feedQuery.isFetchingNextPage,
  hasMore: !enabled || !meta ? true : (feedQuery.hasNextPage ?? false),
  load,
  loadMore,
}
```

### Excerpt representativo — caso isFetching puro (useDiscoverRaces.ts:110–115)

```typescript
// packages/core/hooks/useDiscoverRaces.ts
// Nota en el propio hook (línea 41): "loading mapea a isFetching para mantener
// la semántica de 'en vuelo'". Esta fue una decisión DELIBERADA documentada.
const loading = isFetching
return { races, loading, error, refetch }
```

`useDiscoverRaces` es la excepción intencional documentada: la pantalla de descubrimiento de carreras usa `loading` para mostrar un overlay mientras refetch actualiza la lista filtrada (el usuario puede cambiar filtros activamente). Mantener `isFetching` aquí y documentarlo con comentario.

### Convención adoptada

```typescript
// Convención post-plan-011:
loading: query.isPending,                      // solo primera carga (caché vacío)
refreshing: query.isFetching && !query.isPending, // refetch de fondo (para pull-to-refresh)
```

`isPending` es equivalente a `isLoading` en queries normales (no mutaciones); preferir `isPending` por ser la terminología actual de TanStack Query v5+.

### Convención del repositorio

- Hooks en `packages/core/hooks/`; interfaces de retorno exportadas en el mismo archivo
- Comentarios en español

## Commands you will need

| Purpose                   | Command                                                                                              | Expected on success     |
|---------------------------|------------------------------------------------------------------------------------------------------|-------------------------|
| Checkout de rama          | `git checkout feat/mobile-data-perf`                                                                | rama activa             |
| Buscar consumers (web)    | `grep -rn "\.loading" apps/web/src/ --include="*.ts" --include="*.tsx" \| grep "<hook_name>"`      | lista de consumidores   |
| Buscar consumers (mobile) | `grep -rn "\.loading" apps/mobile/src/ --include="*.ts" --include="*.tsx" \| grep "<hook_name>"`   | lista de consumidores   |
| Typecheck web             | `cd apps/web && pnpm exec tsc --noEmit`                                                             | exit 0, sin errores     |
| Typecheck mobile          | `cd apps/mobile && pnpm exec tsc --noEmit`                                                          | exit 0, sin errores     |
| Build                     | `pnpm build`                                                                                        | exit 0                  |

## Scope

**In scope** (solo estos archivos):
- `packages/core/hooks/useActivityFeed.ts`
- `packages/core/hooks/useDiscoverRaces.ts` (solo añadir comentario explicativo — no cambiar `isFetching`)
- `packages/core/hooks/useNotifications.ts`
- `packages/core/hooks/useLeaderboard.ts`
- `packages/core/hooks/useFollows.ts`
- `packages/core/hooks/useReferralPoints.ts`
- `packages/core/hooks/useProfileCompare.ts`

**Correct-already — no changes needed** (verificar que ya usan `isLoading`/`isPending`):
- `packages/core/hooks/useChallengeDetail.ts`
- `packages/core/hooks/useChallenges.ts`
- `packages/core/hooks/useProgressions.ts`
- `packages/core/hooks/useCardioStats.ts`

**Out of scope** (NO tocar):
- `apps/web/src/` y `apps/mobile/src/` — las interfaces públicas de los hooks no cambian (se añade `refreshing` como campo nuevo, los consumers existentes no se rompen)
- Cualquier hook no listado arriba

## Git workflow

- Rama: `feat/mobile-data-perf` (ya existe)
- Un commit por hook o por grupo lógico: `refactor(core): unify loading semantics in useNotifications/useLeaderboard`
- NO push, NO PR, NO rebase, NO merge

## Steps

### Step 0: Checkout de la rama correcta

```
git checkout feat/mobile-data-perf
```

**Verify**: `git branch --show-current` → `feat/mobile-data-perf`

### Step 1: Auditar consumers de cada hook antes de cambiar

Para cada hook que cambia de `isFetching` → `isPending`, ejecutar:

```bash
# Sustituir HOOKNAME por useNotifications, useLeaderboard, useFollows, useReferralPoints, useProfileCompare
grep -rn "useNOTIFICATIONS\|useLeaderboard\|useFollows\|useReferralPoints\|useProfileCompare" \
  apps/web/src/ apps/mobile/src/ --include="*.ts" --include="*.tsx" -l
```

Para cada archivo consumer encontrado, verificar si usa el campo `loading` para un spinner visible. Si algún consumer lo usa para **pull-to-refresh** (patrones: `refreshing={loading}`, `isRefreshing={loading}`, `onRefresh` callback condicionado a `loading`), detenerse (STOP) y reportar el archivo y línea antes de proceder.

**Verify**: lista de consumers documentada (puede ser vacía si no hay usos directos del campo `loading`)

### Step 2: Actualizar `useActivityFeed.ts`

Cambiar la línea 129 de:
```typescript
loading: metaQuery.isFetching || feedQuery.isLoading,
```
a:
```typescript
// loading = primera carga únicamente; refreshing = refetch de fondo (para pull-to-refresh)
loading: metaQuery.isPending || feedQuery.isPending,
refreshing: (metaQuery.isFetching && !metaQuery.isPending) || (feedQuery.isFetching && !feedQuery.isPending),
```

Asegurarse de que la interfaz de retorno del hook (si está tipada explícitamente) incluya `refreshing: boolean`.

**Verify**: `cd packages/core && pnpm exec tsc --noEmit` → exit 0

### Step 3: Actualizar `useNotifications.ts`, `useLeaderboard.ts`, `useFollows.ts`, `useReferralPoints.ts`, `useProfileCompare.ts`

Para cada hook, cambiar:
```typescript
loading: <query>.isFetching,
```
a:
```typescript
// loading = primera carga únicamente; refreshing = refetch de fondo
loading: <query>.isPending,
refreshing: <query>.isFetching && !<query>.isPending,
```

Si el hook tiene una interfaz TypeScript de retorno tipada explícitamente (e.g., `interface LeaderboardResult { loading: boolean; ... }`), añadir `refreshing: boolean` a esa interfaz.

Para `useReferralPoints.ts` que usa `transactionsQuery.isFetching`, aplicar la misma transformación sobre `transactionsQuery`.

**Verify después de cada hook**: `cd packages/core && pnpm exec tsc --noEmit` → exit 0

### Step 4: Documentar excepción en `useDiscoverRaces.ts`

El hook ya tiene el comentario en línea 41: `"loading mapea a isFetching para mantener la semántica de 'en vuelo'"`.

Reforzar el comentario para que sea explícito sobre la excepción:

```typescript
// EXCEPCIÓN DOCUMENTADA: loading usa isFetching (no isPending) porque la pantalla
// de descubrimiento muestra un overlay activo mientras el usuario cambia filtros;
// el refetch de fondo debe verse reflejado en la UI inmediatamente.
// Ver plans/011-unify-loading-semantics.md para la convención general.
const loading = isFetching
```

No cambiar el valor. No añadir campo `refreshing` (no aplica aquí).

**Verify**: `cd packages/core && pnpm exec tsc --noEmit` → exit 0

### Step 5: Verificación final

```bash
cd apps/web && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec tsc --noEmit
pnpm build
grep -n 'loading: .*isFetching' packages/core/hooks/useNotifications.ts packages/core/hooks/useLeaderboard.ts packages/core/hooks/useFollows.ts packages/core/hooks/useReferralPoints.ts packages/core/hooks/useProfileCompare.ts packages/core/hooks/useActivityFeed.ts
```

Esperado:
- Typechecks: exit 0
- Build: exit 0
- `grep` → sin resultados (esos hooks ya no mapean `loading` a `isFetching`)

## Test plan

No hay tests unitarios de hooks en este repo. La verificación es:

1. Typechecks limpios (Steps 2–4 y Step 5)
2. Build limpio (Step 5)
3. Comprobación manual: `grep -rn 'loading:.*isFetching' packages/core/hooks/` devuelve solo `useDiscoverRaces.ts` y `useLeaderboard.ts` (si Leaderboard usa `query.isFetching` para otra cosa), o cero resultados en los hooks modificados.

## Done criteria

- [ ] `useActivityFeed.ts` retorna `loading: isPending`, `refreshing: isFetching && !isPending`
- [ ] `useNotifications.ts`, `useLeaderboard.ts`, `useFollows.ts`, `useReferralPoints.ts`, `useProfileCompare.ts` — igual
- [ ] `useDiscoverRaces.ts` sin cambio funcional, con comentario de excepción reforzado
- [ ] `grep -n 'loading:.*isFetching' packages/core/hooks/useNotifications.ts` → sin resultados
- [ ] `cd apps/web && pnpm exec tsc --noEmit` → exit 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0
- [ ] `pnpm build` → exit 0
- [ ] `git diff --name-only` no muestra archivos fuera de la lista in-scope
- [ ] `plans/README.md` actualizado

## STOP conditions

- El código en los excerpts de "Current state" no coincide con el live code (drift).
- El Step 1 encuentra un consumer que usa `loading` para pull-to-refresh (pattern `refreshing={loading}` o similar) — reportar el archivo y línea y no proceder hasta confirmación del maintainer.
- Un typecheck falla y el error no está en el hook modificado (indica efecto colateral inesperado).
- Cualquier paso requiere modificar archivos en `apps/web/src/` o `apps/mobile/src/`.
- La interfaz pública de un hook tiene `loading` con tipo diferente a `boolean` (indica un consumer con binding más fuerte).

## Maintenance notes

- Los consumers de pull-to-refresh en `apps/mobile/src/` deberán migrar de `loading` a `refreshing` en un paso posterior (fuera de scope de este plan para no arriesgar UX sin prueba en dispositivo).
- Si se añaden hooks nuevos tras este plan, usar la convención `loading: isPending` / `refreshing: isFetching && !isPending` desde el principio.
- Revisar en PR: que ningún `<ActivityIndicator>` o `<Spinner>` en los consumers web/mobile reciba el campo `loading` de estos hooks de forma directa y lo use para pull-to-refresh (buscar `refreshControl` y `refreshing` en los templates de los componentes).
