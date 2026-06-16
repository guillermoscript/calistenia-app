# Plan 006: deleteProgram selecciona el fallback desde las inscripciones del usuario, no del catálogo global

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta
> cada comando de verificación y confirma el resultado esperado antes de
> continuar. Si ocurre alguna condición de STOP, detente y reporta — no
> improvises. Al terminar, actualiza tu fila en `plans/README.md` salvo que
> el reviewer te haya dicho que él mantiene el índice.
>
> **Drift check (ejecutar primero)**:
> ```
> git diff --stat 4659cd6..HEAD -- packages/core/hooks/usePrograms.ts packages/core/lib/query-keys.ts
> ```
> Si alguno de esos archivos cambió desde que se escribió el plan, compara
> los excerpts de "Current state" contra el código vivo antes de proceder.
> Cualquier discrepancia es condición de STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4659cd6`, 2026-06-15

## Why this matters

Cuando el usuario elimina su programa activo, `deleteProgram` elige el
fallback para el nuevo programa activo leyendo `qk.programs.catalog` — el
catálogo global de todos los programas de la plataforma. Toma `remaining[0]`,
un programa arbitrario que el usuario puede nunca haber visto ni inscrito, y
crea una inscripción en `user_programs` para ese programa. Esto produce una
inscripción fantasma en un programa no deseado, corrompe el estado de
"programa activo" del usuario y puede generar registros huérfanos de
`user_programs` difíciles de limpiar. El fallback correcto debe ser una
inscripción existente del propio usuario (o ninguno si no tiene más).

## Current state

Archivos relevantes:

- `packages/core/hooks/usePrograms.ts` — hook principal de programas; contiene
  `deleteProgram` (línea 457 en adelante) y ya importa `useQueryClient`, `qk`
  y `pb`.
- `packages/core/lib/query-keys.ts` — define `qk.programs.catalog`
  (`['programs', 'catalog']`, línea 59) y `qk.programs.activeEnrollment(userId)`
  (línea 60-61).

### Excerpt confirmado: deleteProgram (líneas 477–506)

```typescript
      await pb.collection('programs').delete(programId)

      const remaining = (qc.getQueryData<ProgramMeta[]>(qk.programs.catalog) || []).filter(p => p.id !== programId)
      qc.setQueryData(qk.programs.catalog, remaining)

      if (activeProgramId === programId) {
        if (remaining.length > 0) {
          const fallback = remaining[0]
          try {
            let fbExisting: RecordModel | null = null
            try {
              fbExisting = await pb.collection('user_programs').getFirstListItem(
                pb.filter('user = {:uid} && program = {:pid}', { uid: userId, pid: fallback.id }),
              )
            } catch { /* not found */ }
            if (fbExisting) {
              await pb.collection('user_programs').update(fbExisting.id, { is_current: true, status: 'active', ended_at: '' })
            } else {
              await pb.collection('user_programs').create({
                user: userId, program: fallback.id, started_at: nowLocalForPB(), is_current: true, status: 'active',
              })
            }
            qc.setQueryData(qk.programs.activeEnrollment(userId), fallback.id)
          } catch (e) {
            console.warn('usePrograms: fallback selection after delete failed', e)
          }
        } else {
          qc.setQueryData(qk.programs.activeEnrollment(userId), null)
        }
      }
```

**El bug está en la línea**:
```typescript
const remaining = (qc.getQueryData<ProgramMeta[]>(qk.programs.catalog) || []).filter(p => p.id !== programId)
```
`qk.programs.catalog` es el catálogo global. `remaining[0]` puede ser un
programa en el que el usuario nunca estuvo inscrito.

### Convención de `user_programs`

La colección `user_programs` en PocketBase tiene los campos:
`user`, `program`, `started_at`, `ended_at`, `is_current`, `status`.

Las inscripciones activas tienen `status = 'active'`. Para encontrar la
inscripción más reciente del usuario (distinta del programa eliminado) se
puede usar:
```
filter: 'user = {:uid} && program != {:pid} && status = "active"'
sort: '-started_at'
```

### Shape de la caché activa

`qc.setQueryData(qk.programs.activeEnrollment(userId), <valor>)` espera un
`string | null` (el `programId` activo). Ver línea 499 y 504 en el excerpt.

La forma en que el código ya escribe null cuando no hay fallback (línea 504)
es correcta y debe conservarse.

## Commands you will need

| Propósito           | Comando                                                     | Esperado en éxito        |
|---------------------|-------------------------------------------------------------|--------------------------|
| Checkout del branch | `git checkout feat/mobile-data-perf`                        | branch cambiado          |
| Typecheck web       | `cd apps/web && pnpm exec tsc --noEmit`                     | exit 0, sin errores      |
| Typecheck mobile    | `cd apps/mobile && pnpm exec tsc --noEmit`                  | exit 0, sin errores      |
| Build raíz          | `pnpm build` (desde `/Users/guillermomarin/Documents/ejercicios/calistenia-app`) | exit 0 |
| Drift check         | `git diff --stat 4659cd6..HEAD -- packages/core/hooks/usePrograms.ts packages/core/lib/query-keys.ts` | sin cambios relevantes |

## Scope

**In scope** (únicos archivos que debes modificar):
- `packages/core/hooks/usePrograms.ts`

**Out of scope** (NO tocar):
- `packages/core/lib/query-keys.ts` — las keys existentes son correctas.
- `apps/web/**` y `apps/mobile/**` — el fix es en core; la API pública de
  `deleteProgram` no cambia (sigue retornando `Promise<boolean>`).
- Cualquier migración de PocketBase — no se añaden campos nuevos.

## Git workflow

- Branch: `feat/mobile-data-perf` (ya existe; hacer checkout antes de editar)
- Commit al terminar; estilo conventional commits:
  `fix(core): deleteProgram fallback uses user enrollments not global catalog`
- NO hacer push, merge, rebase ni PR.

## Steps

### Step 1: Checkout del branch correcto

```bash
git checkout feat/mobile-data-perf
```

**Verificar**: `git branch --show-current` → `feat/mobile-data-perf`

### Step 2: Ejecutar drift check

```bash
git diff --stat 4659cd6..HEAD -- packages/core/hooks/usePrograms.ts packages/core/lib/query-keys.ts
```

**Verificar**: sin cambios en los dos archivos. Si hay cambios, comparar con
los excerpts del plan — STOP si no coinciden.

### Step 3: Verificar el escape hatch — ¿es catalog realmente global?

**ANTES de tocar código**, confirmar que `qk.programs.catalog` contiene el
catálogo global y no los programas del usuario:

```bash
git show HEAD:packages/core/hooks/usePrograms.ts | grep -A 10 "programs.catalog"
```

Buscar la `queryFn` de la query que usa `qk.programs.catalog`. Si su filtro
incluye `user = {:uid}` o similar (solo programas del usuario), entonces el
bug descrito puede no existir — **STOP y reportar**.

Si el fetch es sin filtro de usuario (catálogo global), continúar al paso 4.

### Step 4: Reemplazar la lógica de fallback en deleteProgram

Localizar en `packages/core/hooks/usePrograms.ts` el bloque de fallback
dentro de `deleteProgram` (aproximadamente líneas 479–506 en `4659cd6`).

**Reemplazar el bloque completo** (desde `const remaining =` hasta el cierre
del `if (activeProgramId === programId)`) por lo siguiente:

```typescript
      // Actualiza el catálogo en caché eliminando el programa borrado.
      const catalogNow = (qc.getQueryData<ProgramMeta[]>(qk.programs.catalog) || []).filter(p => p.id !== programId)
      qc.setQueryData(qk.programs.catalog, catalogNow)

      if (activeProgramId === programId) {
        // Busca una inscripción activa del usuario en cualquier otro programa
        // (no en el catálogo global — el usuario podría no estar inscrito en esos).
        let nextEnrollmentProgramId: string | null = null
        try {
          const userEnrollments = await pb.collection('user_programs').getList(1, 1, {
            filter: pb.filter('user = {:uid} && program != {:pid} && status = "active"', { uid: userId, pid: programId }),
            sort: '-started_at',
          })
          if (userEnrollments.items.length > 0) {
            nextEnrollmentProgramId = userEnrollments.items[0].program
          }
        } catch { /* sin inscripciones activas restantes */ }

        if (nextEnrollmentProgramId) {
          try {
            // Marcar esa inscripción como current en PB.
            const nextEnrollment = await pb.collection('user_programs').getFirstListItem(
              pb.filter('user = {:uid} && program = {:pid}', { uid: userId, pid: nextEnrollmentProgramId }),
            )
            await pb.collection('user_programs').update(nextEnrollment.id, { is_current: true, status: 'active', ended_at: '' })
            qc.setQueryData(qk.programs.activeEnrollment(userId), nextEnrollmentProgramId)
          } catch (e) {
            console.warn('usePrograms: fallback de inscripción tras delete falló', e)
          }
        } else {
          // Sin inscripciones activas restantes: limpiar el programa activo.
          qc.setQueryData(qk.programs.activeEnrollment(userId), null)
        }
      }
```

Notas importantes:
1. `pb`, `qc`, `userId`, `activeProgramId`, `qk` y `nowLocalForPB` ya están
   en scope — no añadir imports.
2. La variable `remaining` del código original ya no se necesita para el
   fallback; se remplaza por `catalogNow` (solo para actualizar el catálogo
   en caché) y `nextEnrollmentProgramId`.
3. Ya **no se crea** una inscripción nueva en `user_programs` para el
   fallback — solo se actualiza una existente o se deja null.
4. Los comentarios en español (convención del repo).
5. El tipo de retorno de `deleteProgram` (`Promise<boolean>`) no cambia.

**Verificar**: `grep -n "remaining\[0\]" packages/core/hooks/usePrograms.ts`
→ debe retornar vacío (ninguna ocurrencia).

### Step 5: Typecheck

```bash
cd apps/web && pnpm exec tsc --noEmit
```
→ exit 0, sin errores.

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```
→ exit 0, sin errores.

### Step 6: Build

```bash
cd /Users/guillermomarin/Documents/ejercicios/calistenia-app && pnpm build
```
→ exit 0.

### Step 7: Commit

```bash
git add packages/core/hooks/usePrograms.ts
git commit -m "fix(core): deleteProgram fallback uses user enrollments not global catalog"
```

**Verificar**: `git log --oneline -1` → muestra el nuevo commit.

## Test plan

No hay harness de tests unitarios para este hook. Verificación manual
(puede hacerse con Playwright MCP o manualmente en la app):

**Escenario A — usuario con múltiples inscripciones activas:**
1. Crear dos programas y enrolarse en ambos. Activar el programa A.
2. Eliminar el programa A.
3. **Esperado**: el programa activo pasa a ser el programa B (la otra
   inscripción del usuario). No se crea ninguna inscripción nueva.

**Escenario B — usuario con una sola inscripción (la que se elimina):**
1. Enrolarse en un único programa. Activarlo.
2. Eliminar ese programa.
3. **Esperado**: `activeEnrollment` queda en `null`. El usuario ve la pantalla
   de selección de programa.

**Regresión a verificar (comportamiento incorrecto previo):**
- Antes del fix: al eliminar el programa activo con catálogo global no vacío,
  el usuario quedaba "activo" en un programa arbitrario del catálogo en el que
  puede no haber estado inscrito.

## Done criteria

- [ ] `grep -n "remaining\[0\]" packages/core/hooks/usePrograms.ts` retorna
  vacío (no hay selección de fallback desde el catálogo global)
- [ ] `grep -n "qk.programs.catalog" packages/core/hooks/usePrograms.ts`
  muestra que el catálogo solo se usa para actualizar la caché, no para
  seleccionar el fallback de active enrollment
- [ ] `cd apps/web && pnpm exec tsc --noEmit` → exit 0
- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` → exit 0
- [ ] `pnpm build` desde la raíz → exit 0
- [ ] Solo `packages/core/hooks/usePrograms.ts` está modificado
  (`git diff --name-only HEAD~1` muestra exactamente ese archivo)
- [ ] `plans/README.md` fila 006 actualizada a DONE

## STOP conditions

Detente y reporta si:

- El código en `packages/core/hooks/usePrograms.ts` (bloque `deleteProgram`
  líneas ~479–506) no coincide con el excerpt de "Current state" (el repo derivó).
- Al inspeccionar la `queryFn` de `qk.programs.catalog` (Paso 3), el fetch
  está filtrado por `user = {:uid}` — en ese caso el catálogo ya es solo del
  usuario y el bug descrito no existe. STOP y reportar.
- `qc.setQueryData(qk.programs.activeEnrollment(userId), ...)` espera un tipo
  diferente de `string | null` (p.ej. un objeto completo de enrollment) —
  STOP y reportar para ajustar el plan.
- La colección `user_programs` no tiene el campo `program` como relación
  (retorna un ID string) — verificar antes de asignar `userEnrollments.items[0].program`.
- El typecheck falla dos veces tras un intento razonable de corrección.
- El fix requiere tocar un archivo fuera del scope.

## Maintenance notes

- Si en el futuro `qk.programs.catalog` pasa a ser una query por usuario
  (filtrada por `user`), revisar si este fix sigue siendo necesario.
- La llamada a `pb.collection('user_programs').getList` en el fallback añade
  una round-trip de red al flujo de delete. Es aceptable dado que delete ya
  hace múltiples llamadas de red; no impacta el hot path.
- Revisor: verificar que la forma del campo `program` en los items de
  `user_programs` es un ID string (no un objeto expandido) antes de aprobar.
  Si PB expande relaciones por defecto en este endpoint, puede ser necesario
  añadir `expand: ''` o usar `items[0].program` (que en PB sin expand es el
  ID string).
- Seguimiento deferred: considerar invalidar `qk.programs.all` o
  `qk.programs.detail` tras el delete para limpiar el cache del programa
  eliminado — fuera del scope de este plan.
