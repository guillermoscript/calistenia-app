# Plan 012: Estabilizar arrays en query keys para evitar cache thrash

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
>   packages/core/lib/query-keys.ts
> ```
> Si algún archivo in-scope cambió desde que se escribió este plan, comparar
> los excerpts de "Current state" contra el código live antes de continuar;
> cualquier discrepancia es condición de STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: ninguno
- **Category**: tech-debt
- **Planned at**: commit `4659cd6`, 2026-06-15

## Why this matters

TanStack Query compara query keys por igualdad estructural. Si un array en la key cambia de orden entre renders (aunque contenga los mismos elementos), React Query lo trata como una key diferente, descarta la caché y hace un refetch completo — "cache thrash". En `useActivityFeed`, el array `allUserIds` se construye con `[...new Set([userId!, ...followedIds])]` sin ordenar; el orden de `followedIds` depende del orden de retorno de PocketBase, que puede variar. La convención ya establecida en el repo (verificada en `useComments.ts` y `useCommentReactions.ts`) es ordenar los id arrays antes de usarlos como key: `[...ids].sort()`. Este plan aplica esa misma convención al único sitio que la omite.

## Current state

### Archivo principal

- `packages/core/hooks/useActivityFeed.ts` — hook de feed de actividad; construye `allUserIds` en la `queryFn` de `metaQuery` (línea ~66) y lo retorna como parte de `FeedMeta`; ese valor se usa luego en la key de `feedQuery` (línea ~88).

### Excerpt del código con el bug (@ 4659cd6)

```typescript
// packages/core/hooks/useActivityFeed.ts  — dentro de metaQuery.queryFn (~línea 66)
const followedIds = followsRes.map((r: any) => r.following as string)
const allUserIds = [...new Set([userId!, ...followedIds])]   // ← NO ordenado
```

```typescript
// packages/core/hooks/useActivityFeed.ts  — feedQuery (~línea 88)
const feedQuery = useInfiniteQuery({
  queryKey: qk.feed.sessions(userId, allUserIds),   // allUserIds puede variar en orden
  ...
})
```

`allUserIds` se retorna dentro de `FeedMeta` y luego se lee en el scope del hook (`const allUserIds = meta?.allUserIds ?? []`), pasándolo a `qk.feed.sessions`. Si PocketBase retorna `followedIds` en orden diferente en un siguiente fetch, la key cambia y React Query inicia un refetch innecesario.

### Convención establecida en el repo

```typescript
// packages/core/hooks/useComments.ts (~línea 132) — patrón correcto:
const sorted = [...sessionIds].sort()
queryKey: qk.comments.counts(sorted, userId),

// packages/core/hooks/useCommentReactions.ts (~línea 63) — patrón correcto:
const sortedIds = [...commentIds].sort()
queries: sortedIds.map((commentId) => ({ ... }))
```

Usar exactamente el mismo patrón `[...arr].sort()`.

### Query key factory (contexto)

```typescript
// packages/core/lib/query-keys.ts (~línea 23)
feed: {
  sessions: (userId: string | null, followedIds: string[]) =>
    ['feed', 'sessions', userId, followedIds] as const,
}
```

La factory embebe el array directamente. La corrección se hace en el caller (useActivityFeed), no en la factory, para no asumir que todos los callers quieren un sort (podría haber callers futuros con orden semánticamente significativo).

### Hallazgo opcional (baja prioridad — ver Scope)

`packages/core/lib/query-keys.ts` línea 144:
```typescript
races: {
  discover: (params: Record<string, unknown>) =>
    ['races', 'discover', params] as const,
}
```
Este es el único objeto inline (`Record<string, unknown>`) en la factory. TanStack Query compara objetos por igualdad profunda, pero la forma en que se construye el objeto en el caller puede generar keys distintas si las propiedades se añaden en orden diferente. Este hallazgo es de **valor bajo** y **fuera de scope** de este plan; se documenta aquí para que no sea re-auditado.

## Commands you will need

| Purpose              | Command                                          | Expected on success     |
|----------------------|--------------------------------------------------|-------------------------|
| Checkout de rama     | `git checkout feat/mobile-data-perf`            | rama activa             |
| Typecheck web        | `cd apps/web && pnpm exec tsc --noEmit`         | exit 0, sin errores     |
| Typecheck mobile     | `cd apps/mobile && pnpm exec tsc --noEmit`      | exit 0, sin errores     |
| Build                | `pnpm build`                                    | exit 0                  |
| Verificar fix        | `grep -n 'allUserIds' packages/core/hooks/useActivityFeed.ts` | ver `.sort()` en resultado |

## Scope

**In scope** (solo este archivo):
- `packages/core/hooks/useActivityFeed.ts`

**Out of scope** (NO tocar):
- `packages/core/lib/query-keys.ts` — la factory `qk.feed.sessions` no necesita cambios; la corrección va en el caller.
- El hallazgo de `qk.races.discover` con objeto inline — valor bajo, dejar para auditoría futura si causa problemas observables.
- Cualquier otro hook o archivo.

## Git workflow

- Rama: `feat/mobile-data-perf` (ya existe)
- Un único commit: `fix(core): sort allUserIds before query key to prevent cache thrash`
- NO push, NO PR, NO rebase, NO merge

## Steps

### Step 0: Checkout de la rama correcta

```
git checkout feat/mobile-data-perf
```

**Verify**: `git branch --show-current` → `feat/mobile-data-perf`

### Step 1: Confirmar el estado actual del archivo

```bash
grep -n 'allUserIds\|followedIds\|new Set' packages/core/hooks/useActivityFeed.ts
```

Resultado esperado (aproximado):
```
66:      const allUserIds = [...new Set([userId!, ...followedIds])]
88:    queryKey: qk.feed.sessions(userId, allUserIds),
```

Si la línea 66 ya tiene `.sort()`, el fix ya fue aplicado — STOP y reportar.

**Verify**: los números de línea aproximados coinciden con el excerpt de "Current state"

### Step 2: Aplicar el fix

En `packages/core/hooks/useActivityFeed.ts`, dentro de la `queryFn` de `metaQuery`, cambiar la línea (~66):

```typescript
// ANTES:
const allUserIds = [...new Set([userId!, ...followedIds])]

// DESPUÉS:
// Ordenar para estabilizar la query key: mismo conjunto → misma key, sin cache thrash.
const allUserIds = [...new Set([userId!, ...followedIds])].sort()
```

El cambio es exactamente este: añadir `.sort()` al final de la expresión. No cambiar nada más en el archivo.

**Verify**: `grep -n 'allUserIds' packages/core/hooks/useActivityFeed.ts` → la línea muestra `.sort()`

### Step 3: Typecheck y build

```bash
cd apps/web && pnpm exec tsc --noEmit
cd apps/mobile && pnpm exec tsc --noEmit
pnpm build
```

**Verify**: todos los comandos con exit 0, sin errores

### Step 4: Commit

```bash
git add packages/core/hooks/useActivityFeed.ts
git commit -m "fix(core): sort allUserIds before feed query key to prevent cache thrash

El array de IDs de usuarios seguidos no estaba ordenado antes de entrar en
qk.feed.sessions(). Si PocketBase retorna followedIds en orden diferente en
un refetch, la key cambiaba y TanStack Query descartaba la caché innecesariamente.
Aplica la misma convención de [...ids].sort() que ya usan useComments y
useCommentReactions."
```

**Verify**: `git log --oneline -1` → muestra el commit recién creado

## Test plan

No hay tests unitarios de hooks en este repo. La verificación es:

1. Typecheck y build limpios (Step 3)
2. Inspección final del fix: `grep -n 'allUserIds' packages/core/hooks/useActivityFeed.ts` → línea con `.sort()`
3. Verificar que la convención es consistente con los otros hooks: `grep -n '\.sort()' packages/core/hooks/useComments.ts packages/core/hooks/useCommentReactions.ts` → debe mostrar hits confirmando el patrón

## Done criteria

- [ ] `grep -n 'allUserIds = \[' packages/core/hooks/useActivityFeed.ts` muestra `.sort()` al final
- [ ] `cd apps/web && pnpm exec tsc --noEmit` → exit 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0
- [ ] `pnpm build` → exit 0
- [ ] `git diff --name-only HEAD~1..HEAD` muestra solo `packages/core/hooks/useActivityFeed.ts`
- [ ] `plans/README.md` actualizado con status de este plan

## STOP conditions

- La línea en "Current state" (~66) ya tiene `.sort()` — el fix ya fue aplicado; reportar y no hacer nada.
- El código en los excerpts no coincide con el live code (drift desde 4659cd6).
- Un typecheck falla después de un cambio de una sola línea — indica un problema distinto; reportar sin intentar arreglar el typecheck.
- El fix requiere tocar cualquier otro archivo.

## Maintenance notes

- Si se añade paginación por cursor al feed (en lugar de paginación por página), revisar si el `allUserIds` sigue siendo la dimensión correcta de la key o si se necesita incluir el cursor.
- El hallazgo de `qk.races.discover` (objeto inline como key) queda pendiente. Si se observan refetches inesperados en la pantalla de descubrimiento de carreras al cambiar filtros sin cambiar valores, investigar si el objeto params es siempre el mismo referencia o si se recrea en cada render.
- Para futuros hooks que usen arrays de IDs como query keys, aplicar `.sort()` antes de pasar el array al key factory. Considerar añadir una nota en `packages/core/lib/query-keys.ts` como comentario sobre esta convención.
