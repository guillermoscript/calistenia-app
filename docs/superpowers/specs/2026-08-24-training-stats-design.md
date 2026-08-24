# Estadísticas de entrenamiento — Diseño

**Fecha:** 2026-08-24
**Estado:** Aprobado por Guillermo (enfoque A: cálculo en cliente dentro de `packages/core`; móvil y web a la vez; pantalla propia)

## Objetivo

Que la app deje de medir el progreso "vago": hoy solo enseña sesiones recientes, calendario y tres contadores (sesiones totales, semana/objetivo, racha). Añadimos una pantalla de **Estadísticas** que responde, con datos reales de las series registradas, a:

- qué **grupos musculares** entreno más (y el balance push / pull / piernas / core),
- qué **ejercicios** hago más,
- mis **récords** por ejercicio (reps, o kg × reps → 1RM estimado) y cuáles son nuevos,
- **tendencia y totales**: volumen semanal a 12 semanas, series / reps / minutos, medias por sesión y en qué día de la semana entreno más.

Aplica a móvil y web, compartiendo el 100 % de la lógica de cálculo.

## Contexto actual (verificado 2026-08-24)

- **Móvil** (`apps/mobile/src/app/(tabs)/history.tsx`): 3 `StatCard` (sesiones, semana/objetivo, racha), rejilla del mes, filas a batallas y fotos, lista de sesiones. Cero gráficas de análisis.
- **Web** (`apps/web/src/pages/ProgressPage.tsx`): pestañas `resumen | graficas | cuerpo`. En Gráficas: `VolumeLoadChart` (4 semanas), `MuscleVolumeChart`, `WeightProgressionChart`, `OneRepMaxCalculator`, `ExerciseChart` por ejercicio.
- **`MuscleVolumeChart` (web) está rota de raíz**: suma las series *planificadas* de `WORKOUTS[workoutKey]` (mapa estático), no las registradas; ignora sesiones libres y cualquier programa que no esté en el mapa; usa una taxonomía propia de 8 claves en castellano en vez de `lib/muscles.ts`.
- **Datos en cliente**: `useProgress` (`packages/core/hooks/useProgress.ts`) ya carga con `getFullList` todas las `sessions` + `sets_log` + `cardio_sessions` del usuario y las fusiona en un `ProgressMap` (`Record<string, ExerciseLog | SessionDone>`) con caché en localStorage y overlay de la cola offline. Un `ExerciseLog` tiene `{ exerciseId, date, workoutKey, sets: SetData[] }` y cada `SetData` `{ reps: string, weight?: number, rpe?: number, note, timestamp }`. Un `SessionDone` tiene `date`, `workoutKey`, `count?`, `durationSeconds?`, `cardioSessionId?` (si está presente, es un marcador derivado de cardio que **todas** las estadísticas ignoran).
- **Identidad de ejercicio**: `sets_log.exercise_id` es a veces un id canónico del catálogo y a veces una clave de slot del programa (`lun_1_2`). Los nombres de los slots viven en el programa activo (`usePrograms.workoutsMap`, accesible vía `getWorkout(phase, dayId)` en los dos `WorkoutContext`; `workoutKey` tiene la forma `p{phase}_{dayId}`). `SessionDetailPage.tsx:24-34` ya hace esa resolución para una sesión.
- **Músculos**: `muscle_groups: string[]` (taxonomía canónica de 15 ids en `packages/core/lib/muscles.ts`) existe **solo en el JSON del catálogo empaquetado** (`packages/core/data/exercise-catalog.json`, 1554/1578 entradas), accesible por `CatalogIndex.byId` (`lib/catalogIndex.ts`, hook `useCatalogIndex`). **No está en PocketBase.** Los ejercicios de programa solo traen `muscles` como texto libre.
- **Resolución de ids**: `lib/resolveExerciseId.ts` ya resuelve id exacto → `seed_slug` → nombre normalizado (`normalizeForLookup`) contra el índice.
- **Récords**: `lib/pr-utils.ts` (`parseRepsForPR` = mayor entero del texto; `estimate1RM` = Epley) y `lib/pr-backfill.ts` reconstruyen `settings.prs` / `weight_prs` (localStorage). No hay UI que los liste.
- **Fechas**: `lib/dateUtils.ts` (dayjs + `isoWeek`, timezone de módulo `_tz`): `todayStr`, `addDays`, `diffDays`, `startOfWeekStr`.
- Web ya tiene `recharts`; móvil no tiene librería de gráficas (las barras de tendencia de `CardioStats` son `View` con ancho proporcional).
- i18n: `packages/core/locales/{es,en}/translation.json`, ES canónico, paridad de claves obligatoria; `muscleGroup.*` ya existen.

## Decisiones de diseño

1. **Todo el cálculo en cliente, en `packages/core`, sobre datos ya cargados.** Sin migraciones, sin fetch nuevo, funciona offline. Descartado servidor (exigiría llevar `muscle_groups` a PB; views/hooks de PB fallan en silencio) y descartado meterlo en los Insights de IA (el usuario quiere cifras, no prosa).
2. **Pantalla propia** (`/stats` en móvil, pestaña `estadisticas` en web) para no engordar Historial.
3. **Una serie cuenta para cada grupo muscular que lista su ejercicio.** El catálogo no distingue primario/secundario; no se inventa. La UI lo llama "series que implican".
4. **Los récords se calculan sobre todo el histórico**, nunca recortados por periodo. El periodo solo marca cuáles son nuevos.
5. **La cobertura se enseña, no se esconde**: las series cuyo ejercicio no resuelve a ningún grupo muscular se cuentan y se muestran como "N series sin grupo muscular".
6. **`MuscleVolumeChart` de web se elimina** y su sitio en Gráficas lo ocupa la nueva de músculos con datos reales. Dos gráficas con dos verdades es peor que ninguna.
7. **Se reutiliza sin duplicar**: `parseRepsForPR`, `estimate1RM`, `resolveExerciseId`, `normalizeForLookup`, `MUSCLE_GROUPS`, `dateUtils`. No se toca `OneRepMaxCalculator` (su fórmula distinta queda fuera de alcance).

## 1. Motor de cálculo (`packages/core`)

### 1.1 `lib/exercise-resolver.ts`

Traduce cualquier `exerciseId` del `ProgressMap` a una identidad estable con nombre y músculos.

```ts
export interface ResolvedExercise {
  /** Clave de agrupación: id canónico del catálogo si existe; si no, el nombre normalizado; si no, el id crudo. */
  key: string
  /** Nombre a pintar, ya localizado. */
  name: string
  /** Ids de `MUSCLE_GROUPS`. [] si no se pudo determinar. */
  muscleGroups: string[]
  /** true cuando `muscleGroups` viene de un match fiable (catálogo o tokens del texto libre); false si []. */
  resolved: boolean
}

export interface ExerciseResolverDeps {
  index: CatalogIndex | null
  /** `getWorkout` del WorkoutContext (solo conoce el programa activo). */
  getWorkout: (phase: number, dayId: string) => Workout | null
  locale: string
}

export function buildExerciseResolver(deps: ExerciseResolverDeps): (exerciseId: string, workoutKey: string) => ResolvedExercise
```

Cadena de resolución, en orden, con memo interno por `(exerciseId, workoutKey)`:

1. `resolveExerciseId(exerciseId)` → si el resultado está en `index.byId`, `key` = ese id, `name` = `localize(entry.name)`, `muscleGroups` = `getMuscleGroups(entry)`.
2. Si no, y `workoutKey` casa `^p(\d+)_(.+)$`, se busca en `getWorkout(phase, dayId).exercises` el ejercicio con `id === exerciseId`. Con su `name`: `index.byName.get(normalizeForLookup(name))` → si hay id, igual que el paso 1 pero conservando ese `key`. Si no hay match por nombre, `key` = `normalizeForLookup(name)`, `name` = nombre del programa, `muscleGroups` = `muscleTokensToGroups(ex.muscles)`.
3. Si nada de lo anterior: `key` = `exerciseId`, `name` = `exerciseId`, `muscleGroups` = `[]`, `resolved` = false. La UI trata estas claves como "ejercicio desconocido" (ver 2.3).

`muscleTokensToGroups(text: string): string[]` va en `lib/muscles.ts`: baja a minúsculas, parte por `[,\s/()+]+`, y mapea tokens por `includes` contra un diccionario ES/EN → id canónico (`pecho`/`chest`/`pectoral` → `pecho`; `dorsal`/`lat`/`espalda`/`back` → `espalda`; `hombro`/`deltoid`/`shoulder` → `hombros`; `tríceps`/`triceps` → `triceps`; `bíceps`/`bicep` → `biceps`; `antebrazo`/`forearm`/`grip` → `antebrazos`; `core`/`abs`/`abdominal`/`oblicuo`/`oblique` → `core`; `lumbar`/`erector` → `lumbar`; `glúteo`/`glute` → `gluteos`; `cuádriceps`/`quad` → `cuadriceps`; `isquio`/`hamstring`/`femoral` → `isquios`; `pantorrilla`/`calf`/`soleo`/`gemelo` → `pantorrillas`; `cadera`/`hip`/`flexor` → `cadera`; `cuello`/`neck`/`trapecio`/`trap` → `cuello`; `cardio`/`aeróbico` → `cardio`). Devuelve ids únicos, en el orden de `MUSCLE_GROUPS`. Mismo patrón que `detect-day-type.ts`, pero apuntando a la taxonomía canónica en lugar de a tipos de día.

### 1.2 `lib/training-stats.ts`

Función pura, sin React ni PocketBase.

```ts
export type StatsPeriod = '4w' | '3m' | '1y' | 'all'

export interface TrainingStatsInput {
  progress: ProgressMap
  resolve: (exerciseId: string, workoutKey: string) => ResolvedExercise
  period: StatsPeriod
  /** 'YYYY-MM-DD' local; inyectable para tests. */
  today: string
}

export interface TrainingStats {
  period: StatsPeriod
  /** Inclusive; `from` es null cuando period === 'all'. */
  range: { from: string | null; to: string }
  totals: {
    sessions: number
    sets: number
    /** Suma de `parseRepsForPR(reps)`; series no numéricas aportan 0. */
    reps: number
    /** Suma de `durationSeconds` / 60, redondeado. Sesiones sin duración aportan 0. */
    minutes: number
    /** reps × kg de las series con peso > 0. */
    volumeKg: number
    avgSetsPerSession: number
    avgMinutesPerSession: number
  }
  muscles: {
    /** Orden desc por `sets`. Solo grupos con sets > 0. */
    groups: Array<{ group: string; sets: number; reps: number; share: number }>
    /** push / pull / legs / core, en porcentaje sobre series asignadas; suma 100 o todo 0. */
    balance: { push: number; pull: number; legs: number; core: number }
    /** Series del periodo cuyo ejercicio no resolvió a ningún grupo. */
    unassignedSets: number
  }
  exercises: Array<{
    key: string
    name: string
    sessions: number
    sets: number
    reps: number
    lastDate: string
    best: ExerciseBest | null
  }>
  records: Array<{
    key: string
    name: string
    best: ExerciseBest
    /** true si `best.date` cae dentro de `range`. */
    isNew: boolean
  }>
  weekly: Array<{ weekStart: string; sessions: number; sets: number; reps: number }>
  /** Índice 0 = lunes … 6 = domingo. Sesiones del periodo. */
  weekdays: number[]
  /** Series del periodo con `resolved === false` (clave desconocida). */
  unknownExerciseSets: number
}

export type ExerciseBest =
  | { kind: 'reps'; reps: number; date: string }
  | { kind: 'weight'; weight: number; reps: number; e1rm: number; date: string }

export function computeTrainingStats(input: TrainingStatsInput): TrainingStats
```

Reglas de cálculo:

- **Rango**: `to = today`; `from` = `addDays(today, -27)` (4w), `-89` (3m), `-364` (1y), `null` (all). Una fecha entra si `from == null || date >= from`, y siempre `date <= today`.
- **Sesiones**: cada `SessionDone` sin `cardioSessionId` cuenta `count ?? 1` sesiones en su `date` (así se respetan repeticiones el mismo día). `minutes` suma `durationSeconds` una vez por entrada (no se multiplica por `count`: la duración registrada es la de la última). `weekly` y `weekdays` salen de aquí.
- **Series**: cada `SetData` de cada `ExerciseLog` en rango. Se resuelve con `resolve(log.exerciseId, log.workoutKey)`.
- **Músculos**: por cada serie, `+1 set` y `+reps` a cada `group` de `muscleGroups`; si `muscleGroups` está vacío, `unassignedSets++`. `share` = `sets del grupo / series asignadas` (series únicas con ≥1 grupo), no sobre la suma de barras. **Balance** por familia: push = `pecho, hombros, triceps`; pull = `espalda, biceps, antebrazos`; legs = `gluteos, cuadriceps, isquios, pantorrillas, cadera`; core = `core, lumbar`. `cuello` y `cardio` no entran en el balance. Una serie aporta 1 a cada familia que toque; luego se normaliza a 100.
- **Ejercicios**: agrupados por `key`; `sessions` = nº de `(date, workoutKey)` distintos con ≥1 serie; orden desc por `sessions`, luego `sets`, luego `name`. Las claves con `resolved === false` **no** entran en el ranking (van a `unknownExerciseSets`), pero sí a `totals`.
- **`best` y `records`**: se recorre **todo** el `ProgressMap` (no solo el rango). Para cada serie: `n = parseRepsForPR(reps)`; si `weight > 0` y `estimate1RM(weight, n)` supera el `e1rm` actual → `kind: 'weight'`; si no hay peso y `n` supera las reps actuales → `kind: 'reps'`. Un ejercicio con al menos una serie con peso reporta el récord de peso (el 1RM es más informativo que las reps a peso corporal); si nunca tuvo peso, el de reps. Empates: gana la fecha más antigua (primer día que se alcanzó). `records` = todos los ejercicios con `best`, orden desc por `best.date`, luego por nombre. `isNew` = `best.date` dentro de `range`.
- **`weekly`**: 12 cubos terminando en la semana ISO de `today`; `weekStart` = lunes en `'YYYY-MM-DD'`. Se rellenan a 0 las semanas sin actividad. Independiente de `period` (siempre 12 semanas) — es la gráfica de tendencia y su ventana fija es parte del contrato.
- Todo se calcula en un solo recorrido del `ProgressMap` más un segundo recorrido de ordenación; no hay estado global.

### 1.3 `hooks/useTrainingStats.ts`

```ts
export function useTrainingStats(period: StatsPeriod): { stats: TrainingStats; ready: boolean }
```

- Lee `progress` de `useWorkoutState()` y `getWorkout` de `useWorkoutActions()` **inyectados por parámetro**, no importados: los dos `WorkoutContext` viven en `apps/web` y `apps/mobile`, no en core. Firma real: `useTrainingStats(progress, getWorkout, period)`.
- `useCatalogIndex()` para el índice; `ready = index != null`. Con `ready === false` devuelve igualmente stats (los ejercicios de catálogo caen al paso 3 del resolver) — la pantalla pinta skeleton mientras `!ready` y recalcula al llegar el índice.
- `useMemo` con deps `[progress, getWorkout, index, period, i18n.language]`. El resolver se construye dentro del memo (memo interno por id) y no escapa.
- `today` = `todayStr()`.

## 2. UI

### 2.1 Móvil — `apps/mobile/src/app/stats.tsx` (`/stats`)

- Entrada: fila nueva en la cabecera de Historial, entre la rejilla del mes y la fila de batallas, con icono `BarChart3` de lucide, título `stats.title` y subtítulo `stats.rowDesc`. Mismo markup que la fila de fotos de progreso.
- Cabecera de pantalla con título Bebas `stats.title` y selector segmentado de periodo (`stats.period.4w | 3m | 1y | all`), mismo estilo que el toggle semana/mes de `CardioStats`. Estado local `useState<StatsPeriod>('3m')`.
- `ScrollView` con 5 secciones, cada una con kicker mono uppercase (`Kicker` de `ui/`) y `Card`:
  1. **Totales** (`stats.totals`): rejilla 2×2 de `StatCard` (sesiones, series, reps, minutos) y una fila de dos `MiniStat` (series/sesión, min/sesión). `volumeKg` se pinta solo si > 0.
  2. **Músculos** (`stats.muscles`): lista de barras horizontales — etiqueta `t(getMuscleGroupLabelKey(group))`, barra `View` de ancho `share * 100 %` en lima, cifra de series a la derecha. Debajo, **balance**: una barra apilada de 4 segmentos (push / pull / legs / core) con leyenda y porcentaje; los segmentos a 0 no se pintan. Si `unassignedSets > 0`, línea mono muted `stats.unassigned` con `{{count}}`.
  3. **Ejercicios** (`stats.topExercises`): top 10 filas `Pressable`; nombre, y en mono `{{sessions}} ses · {{sets}} series · {{reps}} reps`. Al pulsar, se expande en línea (`useState<string | null>` con la `key`): mejor serie formateada (`stats.bestReps` "{{reps}} reps" / `stats.bestWeight` "{{weight}} kg × {{reps}} · 1RM {{e1rm}}") y `stats.lastTime` con `relativeDate(lastDate)`.
  4. **Récords** (`stats.records`): filas nombre + mejor serie + fecha; `Chip` lima `stats.new` cuando `isNew`. Máximo 20 filas; si hay más, botón texto `stats.showAll` que quita el límite.
  5. **Tendencia** (`stats.trend`): 12 barras verticales de `sets` (`View` con altura proporcional al máximo, mínimo 2 px si > 0), etiquetas de semana cada 4 barras (`weekStart` como `DD/MM`). Debajo, **`stats.weekdays`**: 7 mini-barras con inicial del día (`L M X J V S D` / `M T W T F S S` por locale) y la más alta resaltada en lima.
- **Estados**: `!ready` → `Skeleton` de 3 bloques. `ready && totals.sessions === 0 && totals.sets === 0` → `EmptyState` (icono `BarChart3`, `stats.empty.title`, `stats.empty.body`, CTA `stats.empty.cta` → `router.push('/')`); si `period !== 'all'` y hay actividad fuera del rango (se detecta con un `computeTrainingStats` de `period: 'all'` memoizado solo en este caso), el body usa `stats.empty.bodyWiden` y el CTA cambia el periodo a `'all'`.
- Componentes privados en `apps/mobile/src/components/stats/`: `PeriodSelector`, `MuscleBars`, `BalanceBar`, `ExerciseRanking`, `RecordsList`, `WeeklyBars`, `WeekdayBars`. Todos reciben datos ya calculados; ninguno llama hooks de datos.
- Ruta nueva ⇒ regenerar `.expo/types/router.d.ts` para el typecheck (`npx expo customize` no; basta arrancar `expo start` o `expo export` una vez). Es un fichero generado y gitignored.

### 2.2 Web — pestaña `estadisticas` en `apps/web/src/pages/ProgressPage.tsx`

- Añadir `'estadisticas'` a la lista de tabs válidas del deep-link y un `TabsTrigger` `progress.tab.stats` entre Resumen y Gráficas.
- Contenido: `components/progress/stats/TrainingStatsPanel.tsx` con la misma estructura de 5 secciones y el mismo selector de periodo. Gráficas con `recharts` (ya en deps): barras horizontales para músculos, `BarChart` para las 12 semanas y para días de la semana; el balance es una barra apilada CSS. Ranking y récords como listas.
- Subcomponentes en `components/progress/stats/`: `PeriodSelector`, `MuscleBarsChart`, `BalanceBar`, `ExerciseRanking`, `RecordsList`, `WeeklyBarsChart`, `WeekdayBarsChart`.
- **Eliminar** `components/progress/MuscleVolumeChart.tsx` y su import/uso en `ProgressPage.tsx`; en su lugar, en la pestaña Gráficas, `MuscleBarsChart` alimentado por `useTrainingStats('4w')` para mantener la comparación de la ventana corta. El componente `VolumeLoadChart` se queda tal cual.
- Estados iguales a móvil (skeleton, vacío con CTA a `/`).

### 2.3 Ejercicios desconocidos

Series cuya clave no resuelve (paso 3 del resolver: slot de un programa que ya no es el activo, o id borrado del catálogo) se contabilizan en `totals` y en `unknownExerciseSets`, pero no aparecen en ranking ni en récords. Si `unknownExerciseSets > 0`, la sección de ejercicios muestra una línea mono muted `stats.unknownExercises` con `{{count}}`. No se intenta cargar programas inactivos: es un fetch nuevo fuera de alcance y la nota de cobertura ya evita mentir.

### 2.4 i18n

Claves nuevas bajo `stats.*` en `packages/core/locales/es/translation.json` (canónico) y `en/` (traducción real, no copia): `title`, `rowDesc`, `period.4w|3m|1y|all`, `totals`, `sessions`, `sets`, `reps`, `minutes`, `volume`, `setsPerSession`, `minPerSession`, `muscles`, `musclesHint` ("series que implican cada grupo"), `balance`, `balance.push|pull|legs|core`, `unassigned` ("{{count}} series sin grupo muscular"), `topExercises`, `exerciseMeta` ("{{sessions}} ses · {{sets}} series · {{reps}} reps"), `bestReps`, `bestWeight`, `lastTime`, `unknownExercises`, `records`, `new`, `showAll`, `trend`, `trendHint` ("series por semana, últimas 12"), `weekdays`, `empty.title`, `empty.body`, `empty.bodyWiden`, `empty.cta`, `empty.ctaWiden`. Más `progress.tab.stats` en web. Los tests de paridad de locales existentes deben seguir en verde.

## 3. Manejo de errores

- El motor es puro y no lanza: reps ilegibles → 0 reps; pesos ≤ 0 → ignorados para 1RM; fechas malformadas en el `ProgressMap` → la entrada se salta (ya vienen normalizadas por `buildProgressMap`).
- Sin índice de catálogo (`ready === false`): skeleton, nunca un error; cuando llega, el memo recalcula.
- Sin programa activo (`getWorkout` devuelve null): los slots caen al paso 3 y se reportan como desconocidos.
- Sin conexión: todo sale de la caché de `useProgress`; no hay ninguna petición nueva.

## 4. Tests

En `packages/core` (vitest, junto a `streak.test.ts` y `dateUtils.test.ts`):

- `lib/training-stats.test.ts`, con `setTimezone` fijo y `today` inyectado:
  - rango por periodo (4w/3m/1y/all) y exclusión de fechas futuras;
  - sesiones con `count` > 1; marcadores `cardioSessionId` ignorados en todo;
  - músculos: serie con 2 grupos suma a ambos, `share` sobre series únicas, `unassignedSets`, balance normalizado a 100 y todo 0 sin series;
  - ranking: mismo ejercicio bajo id de catálogo y bajo slot resuelto por nombre se fusiona; orden sesiones → series → nombre; claves no resueltas fuera del ranking pero dentro de `totals`;
  - récords: reps vs peso (el peso gana si existe), empate → fecha más antigua, `isNew` según rango, récords fuera del periodo siguen apareciendo;
  - `weekly`: 12 cubos, relleno a 0, cruce de año; `weekdays` índice lunes = 0.
- `lib/exercise-resolver.test.ts`: los tres pasos de la cadena con un `CatalogIndex` mínimo construido con `buildCatalogIndex` y un `getWorkout` de fixture; `muscleTokensToGroups` con texto ES y EN, con acentos y con paréntesis.
- Sin tests de componente (los snapshots de web tienen el gotcha conocido de `setup.ts`). QA manual: web en navegador y móvil en dispositivo.

## 5. Entrega

- Issue nuevo en GitHub: "Estadísticas de entrenamiento: músculos, ejercicios, récords y tendencias".
- Una rama `feat/training-stats`, un PR, commits separados: (1) core lib + resolver + tests, (2) hook, (3) móvil, (4) web (incluida la eliminación de `MuscleVolumeChart`), (5) i18n.
- Sin bump de versión móvil (va en su `chore(release)` propio).
- Fuera de alcance, explícitamente: alimentar los Insights de IA con estos datos; cargar programas inactivos para resolver slots viejos; unificar la fórmula de `OneRepMaxCalculator`; gráficas por ejercicio en móvil.
