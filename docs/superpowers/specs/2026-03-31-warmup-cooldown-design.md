# Design: Estiramientos Pre/Post (Warmup/Cooldown)

**Fecha:** 2026-03-31
**Estado:** Aprobado
**Spec borrador relacionado:** `docs/specs/feature-estiramientos-pre-post-rutinas-sesiones.md`

---

## Resumen

Agregar bloques de calentamiento (warmup) y vuelta a calma (cooldown) a rutinas de programa y sesiones libres. Los ejercicios se organizan por sección dentro del mismo array, el flujo de sesion detecta transiciones entre secciones, y se pre-cargan templates segun el tipo de dia.

---

## Decisiones de diseno

| Decision | Eleccion |
|---|---|
| Modelo de datos | Campo `section` en Exercise (no arrays separados) |
| Arquitectura de sesion | Section-aware stepper (no multi-phase rewrite) |
| Templates | Pre-cargados editables por DayType |
| Tracking | Completado/omitido + tiempo por bloque |
| Nudge al omitir | Toast suave una vez, sin escalado |
| Sesiones libres | Ofrecerlo al iniciar con auto-deteccion de DayType |

---

## 1. Modelo de datos

### Tipo `Exercise`

Nuevo campo opcional:

```ts
section?: 'warmup' | 'main' | 'cooldown'  // default: 'main'
stretchType?: 'dynamic' | 'static'        // dynamic = apto para warmup, static = apto para cooldown
```

Ejercicios existentes sin `section` se tratan como `'main'`. Backward-compatible.

### Coleccion `program_exercises` (PocketBase)

Nuevo campo:
- `section` — text, default `'main'`, opciones: `warmup`, `main`, `cooldown`

### Coleccion `sessions` (PocketBase)

Nuevos campos:
- `warmup_completed` — bool, default false
- `warmup_skipped` — bool, default false
- `warmup_duration_seconds` — number, default 0 (0 = no registrado)
- `cooldown_completed` — bool, default false
- `cooldown_skipped` — bool, default false
- `cooldown_duration_seconds` — number, default 0 (0 = no registrado)

**Nota:** Si `warmup_completed` y `warmup_skipped` son ambos false, significa que la sesion fue abandonada antes de terminar el warmup (o el workout no tenia warmup). Mismo criterio para cooldown.

### Helper reutilizable

```ts
function getExercisesBySection(exercises: Exercise[], section: 'warmup' | 'main' | 'cooldown'): Exercise[]
```

No se modifican `sets_log`, `settings`, ni `progress`. Los ejercicios de warmup/cooldown se logean individualmente como cualquier otro ejercicio.

---

## 2. Templates de estiramientos por DayType

Mapa estatico en codigo (no en DB):

```ts
const stretchTemplates: Record<DayType, { warmup: Exercise[], cooldown: Exercise[] }>
```

| DayType | Warmup (movilidad dinamica) | Cooldown (estatico/descarga) |
|---|---|---|
| `push` | movilidad hombro, activacion escapular, apertura toracica | pectoral, deltoide anterior, triceps |
| `pull` | movilidad toracica, activacion dorsal, cuello-hombro | dorsal, biceps, antebrazo, trapecio |
| `legs` | cadera, tobillo, bisagra de cadera dinamica | cuadriceps, isquios, gluteo, psoas |
| `lumbar` | movilidad columna y cadera controlada | descarga lumbar, gluteo medio, psoas, respiracion |
| `full` | rutina global corta (hombro + cadera + columna) | descarga global cadenas mas exigidas |
| `cardio` | movilidad tobillo, cadera, activacion general | isquios, gemelos, cadera, respiracion |
| `rest` | sin template | sin template |

Se amplia `supplementary-exercises.ts` con ejercicios de cooldown/estatico que falten. Cada ejercicio se etiqueta con `stretchType: 'dynamic' | 'static'` para distinguir aptitud para warmup vs cooldown.

En el editor de programa: al crear/editar un dia, warmup y cooldown se pre-cargan segun DayType. El usuario puede editar libremente.

---

## 3. Flujo de sesion activa (Section-aware stepper)

### Estado nuevo en `ActiveSessionContext`

```ts
currentSection: 'warmup' | 'main' | 'cooldown'  // derivado del stepIdx y exercises array
sectionStartTime: number | null                   // timestamp al entrar en seccion
```

`currentSection` se deriva del array de ejercicios y `stepIdx` (no se persiste). Solo `sectionStartTime` se persiste.

Se agrega `'section-transition'` al tipo `SessionPhase` existente (`'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'`) para representar las pantallas de transicion entre bloques.

### Logica de transicion

- Al avanzar `stepIdx`, se compara `exercises[stepIdx].section` con `exercises[stepIdx - 1].section`
- Si cambio de seccion: `phase` cambia a `'section-transition'` antes de continuar al siguiente ejercicio
- Se guarda `sectionStartTime` al entrar y se calcula duracion al salir

### Pantallas de transicion

- **Warmup -> Main:** "Calentamiento completado. Listo para entrenar!" + boton "Comenzar"
- **Main -> Cooldown:** "Bloque principal completado. Vuelta a calma." + boton "Continuar"
- En cada transicion se registra `duration_seconds` del bloque que termina

### Skip de bloque

- Al inicio de warmup: boton "Omitir calentamiento" -> salta a primer ejercicio `main`, registra `warmup_skipped = true`, muestra toast suave una vez
- En pantalla de transicion main->cooldown: boton "Omitir vuelta a calma" -> va directo a celebracion, registra `cooldown_skipped = true`, toast suave
- Durante ejercicios de cooldown: boton persistente "Omitir resto" en header para saltar los ejercicios restantes
- Toast de ejemplo: "Recuerda: el calentamiento reduce el riesgo de lesion"

### Ordenamiento de secciones (invariante)

Los ejercicios en el array DEBEN estar ordenados: todos los `warmup` primero, luego todos los `main`, luego todos los `cooldown`. El editor de programa valida este orden al guardar. Esto garantiza que la logica de transicion (comparar seccion con ejercicio anterior) funcione correctamente sin transiciones espurias.

### Sesion sin warmup/cooldown

Si el workout no tiene ejercicios con `section: 'warmup'` o `'cooldown'`, el flujo es identico al actual. Cero impacto en sesiones existentes.

### Persistencia

Se extiende `calistenia_strength_active` en localStorage con `sectionStartTime` para sobrevivir refresh/navegacion. `currentSection` se recalcula al restaurar desde el array de ejercicios y `stepIdx`.

---

## 4. Sesiones libres

1. El usuario selecciona ejercicios principales como hoy
2. Antes de iniciar, prompt: "Quieres agregar calentamiento y vuelta a calma?"
   - Dos toggles independientes: "Calentamiento" / "Vuelta a calma"
   - Ambos activados por defecto
3. Si acepta: la app detecta el DayType dominante analizando los grupos musculares de los ejercicios elegidos y pre-carga el template correspondiente
4. El usuario puede editar/quitar ejercicios del template antes de iniciar
5. Al iniciar: flujo identico al de programas (section-aware stepper)

### Deteccion de DayType

Se cuentan los `muscles` de los ejercicios seleccionados:
- Mayoria pecho/hombro/triceps -> `push`
- Mayoria espalda/biceps -> `pull`
- Mayoria piernas -> `legs`
- Mayoria core/lumbar/abs -> `lumbar`
- Si hay ejercicios de cardio -> `cardio`
- Mixto o no claro -> `full` (template global)

Si el usuario desactiva ambos toggles: sesion libre funciona exactamente como hoy.

---

## 5. Nudge y feedback

### Al omitir un bloque

- Toast breve, no bloqueante
- Warmup: "Recuerda: el calentamiento reduce el riesgo de lesion"
- Cooldown: "La vuelta a calma ayuda a tu recuperacion"
- Una sola vez por sesion, sin repetir, sin modal, sin escalado

### En historial de sesion

- Detalle de sesion muestra si warmup y cooldown fueron completados u omitidos, con duracion
- Indicador visual sutil (check verde si completo, gris si omitio)
- Informativo, sin juicio ni penalizacion

### Estadisticas (fuera de MVP)

Derivables de `warmup_completed`/`warmup_skipped` en `sessions`, pero sin UI dedicada en MVP.

---

## 6. Migraciones necesarias

1. Agregar campo `section` a coleccion `program_exercises` (default: `'main'`)
2. Agregar 6 campos de tracking a coleccion `sessions` (warmup/cooldown completed, skipped, duration)

Ambas migraciones son idempotentes y no-destructivas. Datos existentes funcionan sin cambios.

---

## 7. Archivos a modificar/crear

| Archivo | Cambio |
|---|---|
| `src/types/index.ts` | Agregar `section` y `stretchType` a `Exercise`, agregar `'section-transition'` a `SessionPhase` |
| `src/data/supplementary-exercises.ts` | Agregar ejercicios de cooldown/estatico, etiquetar con `stretchType` |
| `src/data/stretch-templates.ts` | **Nuevo** — mapa de templates por DayType |
| `src/contexts/ActiveSessionContext.tsx` | Section-aware stepper, transiciones, tracking de tiempo, persistir `sectionStartTime` |
| `src/components/SessionView.tsx` | Actualizar `buildSteps` para ser section-aware, renderizar transiciones |
| `src/components/session/SectionTransition.tsx` | **Nuevo** — pantalla de transicion entre bloques |
| `src/components/session/WarmupCooldownPrompt.tsx` | **Nuevo** — prompt para sesiones libres |
| `src/hooks/usePrograms.ts` | Pasar `section` al construir `WorkoutsMap` |
| `src/hooks/useProgramEditor.ts` | Soporte de secciones en editor |
| `pb_migrations/` | 2 migraciones (program_exercises.section, sessions warmup/cooldown fields) |
| `src/locales/en/translation.json` | i18n keys para transiciones, toasts, prompts |
| `src/locales/es/translation.json` | i18n keys para transiciones, toasts, prompts |
