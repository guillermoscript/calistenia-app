# Plan 004: logMeal invalida la query de nutrición para que los totales diarios se actualicen al instante

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta
> cada comando de verificación y confirma el resultado esperado antes de
> continuar. Si ocurre alguna condición de STOP, detente y reporta — no
> improvises. Al terminar, actualiza tu fila en `plans/README.md` salvo que
> el reviewer te haya dicho que él mantiene el índice.
>
> **Drift check (ejecutar primero)**:
> ```
> git diff --stat 4659cd6..HEAD -- packages/core/hooks/useWeeklyMealPlan.ts packages/core/lib/query-keys.ts packages/core/hooks/useNutrition.ts
> ```
> Si alguno de esos archivos cambió desde que se escribió el plan, compara
> los excerpts de "Current state" contra el código vivo antes de proceder.
> Cualquier discrepancia es condición de STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4659cd6`, 2026-06-15

## Why this matters

`logMeal` en `useWeeklyMealPlan` crea un registro en `nutrition_entries` en
PocketBase pero nunca invalida la query de nutrición de TanStack Query. Como
resultado, el acumulador de `useNutrition` (totales diarios de calorías,
proteína, carbos y grasa) no refleja la comida recién registrada hasta que
el staleTime de 30 s expira y se dispara un refetch automático. El usuario ve
sus macros sin cambios durante hasta 30 segundos tras confirmar el log, lo
cual confunde y hace parecer que la acción no funcionó.

## Current state

Archivos relevantes:

- `packages/core/hooks/useWeeklyMealPlan.ts` — hook de plan semanal; contiene
  `logMeal` (líneas 125–149) y ya importa `useQueryClient` y `qk`.
- `packages/core/lib/query-keys.ts` — fábrica central de query keys; define
  `qk.nutrition.today(userId)` (línea 109) y `qk.nutrition.byDate(userId, date)`
  (línea 110-111).
- `packages/core/hooks/useNutrition.ts` — acumulador de nutrición; usa
  `entriesKey = qk.nutrition.today(userId)` (línea 104) como query key
  principal.

Excerpt confirmado de `useWeeklyMealPlan.ts` (función `logMeal`, líneas 125–149):

```typescript
  const logMeal = useCallback(async (dayId: string, mealId: string) => {
    const day = planDays.find(d => d.id === dayId)
    if (!day) return
    const meal = day.meals.find(m => m.id === mealId)
    if (!meal || meal.logged) return

    const food: FoodItem = {
      name: meal.label, portionAmount: 1, portionUnit: 'unidad', unitWeightInGrams: 100,
      calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat,
      baseCal100: meal.calories, baseProt100: meal.protein, baseCarbs100: meal.carbs, baseFat100: meal.fat,
    }
    const entryData = {
      user: userId, meal_type: meal.meal_type, foods: [food],
      total_calories: meal.calories, total_protein: meal.protein,
      total_carbs: meal.carbs, total_fat: meal.fat,
      ai_model: 'weekly-plan', source: 'ai_weekly_plan', logged_at: new Date().toISOString(),
    }
    const entryRecord = await pb.collection('nutrition_entries').create(entryData)

    const updatedMeals = day.meals.map(m =>
      m.id === mealId ? { ...m, logged: true, logged_entry_id: entryRecord.id } : m,
    )
    await pb.collection('weekly_plan_days').update(dayId, { meals: updatedMeals })
    patch(prev => ({ plan: prev.plan, days: prev.days.map(d => d.id === dayId ? { ...d, meals: updatedMeals } : d) }))
  }, [userId, planDays, patch])
```

Notar: tras el `create` y el `patch` local, **no hay ninguna llamada a
`qc.invalidateQueries`**. El hook sí tiene `qc` disponible (línea 78:
`const qc = useQueryClient()`).

La key que usa `useNutrition` para su query principal de entradas (acumulador
de hoy) es `qk.nutrition.today(userId)` — confirmado en
`packages/core/hooks/useNutrition.ts` línea 104:
```typescript
const entriesKey = qk.nutrition.today(userId)
```

Que se expande a `['nutrition', 'today', userId]` (query-keys.ts línea 109).

## Commands you will need

| Propósito           | Comando                                                     | Esperado en éxito        |
|---------------------|-------------------------------------------------------------|--------------------------|
| Checkout del branch | `git checkout feat/mobile-data-perf`                        | branch cambiado          |
| Typecheck web       | `cd apps/web && pnpm exec tsc --noEmit`                     | exit 0, sin errores      |
| Typecheck mobile    | `cd apps/mobile && pnpm exec tsc --noEmit`                  | exit 0, sin errores      |
| Build raíz          | `pnpm build` (desde `/Users/guillermomarin/Documents/ejercicios/calistenia-app`) | exit 0 |
| Drift check         | `git diff --stat 4659cd6..HEAD -- packages/core/hooks/useWeeklyMealPlan.ts packages/core/lib/query-keys.ts packages/core/hooks/useNutrition.ts` | sin cambios relevantes |

## Scope

**In scope** (únicos archivos que debes modificar):
- `packages/core/hooks/useWeeklyMealPlan.ts`

**Out of scope** (NO tocar):
- `packages/core/hooks/useNutrition.ts` — no necesita cambios; solo necesita
  que su query key sea invalidada externamente.
- `packages/core/lib/query-keys.ts` — ya tiene las keys correctas; no modificar.
- Cualquier archivo en `apps/web` o `apps/mobile` — este fix es en core.

## Git workflow

- Branch: `feat/mobile-data-perf` (ya existe; hacer checkout antes de editar)
- Commit al terminar el paso; estilo conventional commits:
  `fix(core): invalidate nutrition query after logMeal in useWeeklyMealPlan`
- NO hacer push, merge, rebase ni PR.

## Steps

### Step 1: Checkout del branch correcto

```bash
git checkout feat/mobile-data-perf
```

**Verificar**: `git branch --show-current` → `feat/mobile-data-perf`

### Step 2: Ejecutar drift check

```bash
git diff --stat 4659cd6..HEAD -- packages/core/hooks/useWeeklyMealPlan.ts packages/core/lib/query-keys.ts packages/core/hooks/useNutrition.ts
```

**Verificar**: sin cambios en los tres archivos. Si hay cambios, comparar los
excerpts del plan con el código vivo — STOP si no coinciden.

### Step 3: Agregar invalidación en logMeal

Editar `packages/core/hooks/useWeeklyMealPlan.ts`.

Localizar el bloque al final de `logMeal` (línea ~148):
```typescript
    patch(prev => ({ plan: prev.plan, days: prev.days.map(d => d.id === dayId ? { ...d, meals: updatedMeals } : d) }))
  }, [userId, planDays, patch])
```

Reemplazarlo por (agregar la invalidación justo **después** del `patch`, antes
de cerrar el callback):
```typescript
    patch(prev => ({ plan: prev.plan, days: prev.days.map(d => d.id === dayId ? { ...d, meals: updatedMeals } : d) }))
    // Invalida el acumulador de nutrición para que los totales del día
    // reflejen la comida recién registrada sin esperar el staleTime de 30s.
    void qc.invalidateQueries({ queryKey: qk.nutrition.today(userId) })
  }, [userId, planDays, patch, qc])
```

Notas importantes:
1. `qc` ya existe en el hook (línea 78) — NO agregar otro `useQueryClient()`.
2. `qk` ya está importado (línea 6) — NO agregar otro import.
3. Agregar `qc` al array de dependencias del `useCallback` (antes solo tenía
   `[userId, planDays, patch]`).
4. Usar `void` para no convertir `logMeal` en una función que retorna la
   promesa de invalidación (evita cambio de tipo público).
5. Los comentarios deben ir en español (convención del repo).

**Verificar**: `grep -n "invalidateQueries" packages/core/hooks/useWeeklyMealPlan.ts`
→ debe mostrar al menos una línea con `qk.nutrition.today(userId)`.

### Step 4: Typecheck

```bash
cd apps/web && pnpm exec tsc --noEmit
```
→ exit 0, sin errores.

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```
→ exit 0, sin errores.

### Step 5: Build

```bash
cd /Users/guillermomarin/Documents/ejercicios/calistenia-app && pnpm build
```
→ exit 0.

### Step 6: Commit

```bash
git add packages/core/hooks/useWeeklyMealPlan.ts
git commit -m "fix(core): invalidate nutrition query after logMeal in useWeeklyMealPlan"
```

**Verificar**: `git log --oneline -1` → muestra el nuevo commit.

## Test plan

No hay harness de tests unitarios para este hook. Verificación manual:

1. Abrir la app (web o mobile) con un usuario que tenga un plan semanal activo.
2. En la vista del plan semanal, registrar una comida ("Log meal").
3. Navegar inmediatamente a la vista de nutrición / resumen diario.
4. **Esperado**: los totales diarios (calorías, proteína, carbos, grasa) ya
   reflejan la comida recién registrada — sin esperar 30 segundos.
5. **Antes del fix** (regresión): los totales no cambian hasta el próximo
   refetch automático.

## Done criteria

- [ ] `grep -n "invalidateQueries" packages/core/hooks/useWeeklyMealPlan.ts`
  retorna al menos una línea que contiene `qk.nutrition.today(userId)`
- [ ] `cd apps/web && pnpm exec tsc --noEmit` → exit 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0
- [ ] `pnpm build` desde la raíz → exit 0
- [ ] Solo `packages/core/hooks/useWeeklyMealPlan.ts` está modificado
  (`git diff --name-only HEAD~1` muestra exactamente ese archivo)
- [ ] `plans/README.md` fila 004 actualizada a DONE

## STOP conditions

Detente y reporta si:

- El código en `packages/core/hooks/useWeeklyMealPlan.ts` líneas 125–149 no
  coincide con el excerpt de "Current state" (el repo derivó).
- `qc` no existe en el scope de `useWeeklyMealPlan` (el hook fue refactorizado
  y ya no usa `useQueryClient`).
- `qk.nutrition.today` no existe en `packages/core/lib/query-keys.ts`
  (la key fue renombrada).
- La key que usa `useNutrition` en su `entriesKey` (línea 104) es diferente
  de `qk.nutrition.today(userId)` — en ese caso usar la key correcta de
  `useNutrition` en lugar de `qk.nutrition.today`.
- El typecheck falla dos veces tras un intento razonable de corrección.
- El fix requiere tocar un archivo fuera del scope.

## Maintenance notes

- Si en el futuro `logMeal` se usa para registrar comidas de días pasados
  (no solo hoy), considerar también invalidar
  `qk.nutrition.byDate(userId, date)` con la fecha correspondiente.
- Si `useNutrition` cambia su `entriesKey` a otra key (por ejemplo
  `qk.nutrition.byDate`), actualizar esta invalidación en consonancia.
- Revisor: confirmar que el `void` es apropiado y que la adición de `qc` al
  dep array de `useCallback` no introduce re-renders innecesarios (es
  estable por diseño de `useQueryClient`).
