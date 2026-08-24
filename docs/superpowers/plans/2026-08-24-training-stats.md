# Estadísticas de entrenamiento — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla de Estadísticas (móvil `/stats`, web `/progress?tab=estadisticas`) con músculos más entrenados, ranking de ejercicios, récords, totales y tendencia, calculados en cliente sobre el `ProgressMap` ya cargado.

**Architecture:** Motor puro en `packages/core/lib/training-stats.ts` + resolver de identidad en `lib/exercise-resolver.ts`, expuestos por `hooks/useTrainingStats.ts`. Las dos apps sólo pintan: reciben `TrainingStats` y no calculan nada. Spec: `docs/superpowers/specs/2026-08-24-training-stats-design.md`. Issue #596. Rama `feat/training-stats`.

**Tech Stack:** TypeScript, React 19, vitest (core), Expo Router + NativeWind (móvil), React Router + Tailwind v4 (web), i18next (claves planas `stats.*` ya en `packages/core/locales/{es,en}/translation.json`).

---

## Estado

- [x] **Task 1 — Motor de cálculo** (`32ffffd`): `lib/muscles.ts#muscleTokensToGroups`, `lib/exercise-resolver.ts`, `lib/training-stats.ts`, `lib/resolveExerciseId.ts` (índice inyectable), 44 tests en `lib/training-stats.test.ts` + `lib/exercise-resolver.test.ts`.
- [x] **Task 2 — Hook** (`ae129e4`): `hooks/useTrainingStats.ts`.
- [x] **Task 3 — i18n** (`a67dff6`): 44 claves `stats.*` + `progress.tab.stats`, es/en, tests de locales en verde.
- [ ] **Task 4 — Móvil** (abajo).
- [ ] **Task 5 — Web** (abajo).
- [ ] **Task 6 — Verificación y PR**.

## Contrato que consumen las UIs

```ts
// packages/core/lib/training-stats.ts
export type StatsPeriod = '4w' | '3m' | '1y' | 'all'
export const STATS_PERIODS: readonly StatsPeriod[]          // ['4w','3m','1y','all']
export type BalanceFamily = 'push' | 'pull' | 'legs' | 'core'
export type ExerciseBest =
  | { kind: 'reps'; reps: number; date: string }
  | { kind: 'weight'; weight: number; reps: number; e1rm: number; date: string }
export interface MuscleStat { group: string; sets: number; reps: number; share: number }   // share 0..1
export interface ExerciseStat { key; name; sessions; sets; reps; lastDate: string; best: ExerciseBest | null }
export interface RecordStat { key; name; best: ExerciseBest; isNew: boolean }
export interface WeeklyStat { weekStart: string; sessions; sets; reps }                    // 12 elementos, cronológico
export interface TrainingStats {
  period; range: { from: string | null; to: string }
  totals: { sessions; sets; reps; minutes; volumeKg; avgSetsPerSession; avgMinutesPerSession }
  muscles: { groups: MuscleStat[]; balance: Record<BalanceFamily, number>; unassignedSets: number }  // balance en %, suma 100 o todo 0
  exercises: ExerciseStat[]       // ya ordenado
  records: RecordStat[]           // ya ordenado por fecha desc
  weekly: WeeklyStat[]
  weekdays: number[]              // 7, índice 0 = lunes
  unknownExerciseSets: number
}

// packages/core/hooks/useTrainingStats.ts
useTrainingStats(progress: ProgressMap, getWorkout: (phase: number, dayId: string) => Workout | null, period: StatsPeriod)
  : { stats: TrainingStats; ready: boolean }
```

Etiquetas de músculo: `t(getMuscleGroupLabelKey(group))` de `@calistenia/core/lib/muscles` (claves `muscleGroup.*` ya existen). Fechas relativas: `relativeDate(dateStr)` de `@calistenia/core/lib/dateUtils`. Claves i18n disponibles: ver bloque `stats.*` en `packages/core/locales/es/translation.json` (líneas tras `progress.tab.body`). Las que tienen plural (`stats.unassigned`, `stats.unknownExercises`) se usan con `t('stats.unassigned', { count })`. `stats.weekdayInitials` es una lista separada por comas.

Estado vacío: `ready && stats.totals.sessions === 0 && stats.totals.sets === 0`. Para saber si hay datos fuera del rango (y ofrecer «Ver todo»), calcular además `useTrainingStats(progress, getWorkout, 'all')` y mirar sus totales — es barato y sólo se usa en ese caso.

---

### Task 4: Móvil — pantalla `/stats`

**Files:**
- Create: `apps/mobile/src/app/stats.tsx`
- Create: `apps/mobile/src/components/stats/PeriodSelector.tsx`, `MuscleBars.tsx`, `BalanceBar.tsx`, `ExerciseRanking.tsx`, `RecordsList.tsx`, `WeeklyBars.tsx`, `WeekdayBars.tsx`
- Modify: `apps/mobile/src/app/(tabs)/history.tsx` (fila nueva tras la card «Actividad del mes», antes de la fila de batallas)

Patrones a copiar (leer antes de escribir):
- Pantalla no-tab con cabecera y scroll: `apps/mobile/src/app/insights.tsx` o `app/battle-history.tsx`.
- Toggle segmentado: `apps/mobile/src/components/cardio/CardioStats.tsx` (bloque «Toggle semana / mes») — mismo markup para `PeriodSelector`.
- Barras con `View` proporcional: mismo fichero, bloque «Tendencia: distancia por semana».
- `StatCard`/`MiniStat`: mismo fichero (son privados; copiar el markup a `stats.tsx`, no importarlos).
- Fila de entrada en Historial: `history.tsx` bloque «Fotos de progreso» (Pressable > Card > CardContent flex-row, icono en círculo `bg-lime/10`, `ChevronRight`). Icono: `BarChart3` de `lucide-react-native`.
- Primitivas: `@/components/ui/{text,card,kicker,chip,skeleton,empty-state}`; colores en `@/lib/theme` (`COLORS.lime`, `COLORS.mutedIcon`).
- Contextos: `useWorkoutState()` → `progress`; `useWorkoutActions()` → `getWorkout` (`@/contexts/WorkoutContext`).

- [ ] **Step 1: `stats.tsx`** — `useState<StatsPeriod>('3m')`, `useTrainingStats(progress, getWorkout, period)`, cabecera Bebas `t('stats.title')` + `PeriodSelector`, `ScrollView` con 5 secciones en `Card` con `Kicker`: Totales (rejilla 2×2: sesiones, series, reps, minutos; fila de 2 mini: series/sesión, min/sesión; `volumeKg` sólo si > 0), Músculos (`MuscleBars` + `BalanceBar` + línea `stats.unassigned` si > 0), Ejercicios (`ExerciseRanking` + línea `stats.unknownExercises` si > 0), Récords (`RecordsList`), Tendencia (`WeeklyBars` + `WeekdayBars`). Skeleton si `!ready`; `EmptyState` según spec §2.1 (CTA `router.push('/')`, o cambiar periodo a `'all'` si hay datos fuera del rango).
- [ ] **Step 2: componentes** — todos reciben datos ya calculados, ninguno llama hooks de datos. `MuscleBars`: fila por grupo (etiqueta, barra lima ancho `share*100%`, cifra de series). `BalanceBar`: barra apilada de 4 segmentos (push lima, pull sky, legs amber, core violet; omitir 0) + leyenda con %. `ExerciseRanking`: top 10, `Pressable` que expande en línea (estado local con la `key`) mostrando `stats.bestReps`/`stats.bestWeight` y `stats.lastTime` con `relativeDate(lastDate)`. `RecordsList`: nombre + mejor serie + fecha, `Chip`/badge lima `stats.new` si `isNew`; 20 filas y botón `stats.showAll`. `WeeklyBars`: 12 barras de `sets` (altura proporcional al máximo, mínimo 2 px si > 0, la última en lima y el resto `bg-lime/20`), etiqueta `DD/MM` cada 4. `WeekdayBars`: 7 mini-barras con `stats.weekdayInitials`, la mayor en lima.
- [ ] **Step 3: fila en Historial** — `router.push('/stats')`, título `t('stats.title')`, subtítulo `t('stats.rowDesc')`.
- [ ] **Step 4: verificar** — `cd apps/mobile && npx tsc --noEmit` y `npx expo lint`. Si el typecheck se queja del `Href` `/stats`, hay que regenerar `.expo/types/router.d.ts` (gitignored): arrancar `npx expo start` unos segundos o mirar cómo se hizo para `/insights`. No commitear: lo hace la sesión principal.

### Task 5: Web — pestaña «Estadísticas»

**Files:**
- Create: `apps/web/src/components/progress/stats/TrainingStatsPanel.tsx`, `PeriodSelector.tsx`, `MuscleBarsChart.tsx`, `BalanceBar.tsx`, `ExerciseRanking.tsx`, `RecordsList.tsx`, `WeeklyBarsChart.tsx`, `WeekdayBarsChart.tsx`
- Modify: `apps/web/src/pages/ProgressPage.tsx` (tab nueva `estadisticas` entre Resumen y Gráficas; deep-link; en Gráficas sustituir `<MuscleVolumeChart progress={progress} />` por `<MuscleBarsChart>` alimentado por `useTrainingStats(progress, getWorkout, '4w')`)
- Delete: `apps/web/src/components/progress/MuscleVolumeChart.tsx`

Patrones a copiar:
- Barras con `div` proporcional y estilo de card: `apps/web/src/components/progress/VolumeLoadChart.tsx` (no usa recharts; no usarlo aquí tampoco).
- Primitivas: `../ui/card`, `../ui/kicker`, `../ui/badge`, `../ui/skeleton`, `../ui/empty-state`, `../ui/button` (`variant="limeSolid"`), `cn` de `../../lib/utils`.
- Contextos: `useWorkoutState()` → `progress`; `useWorkoutActions()` → `getWorkout` (`../contexts/WorkoutContext`).
- Tabs: `ProgressPage.tsx` líneas 86-162 (`initialTab`, `TabsTrigger` con `progress.tab.*`).

- [ ] **Step 1: `TrainingStatsPanel`** — mismas 5 secciones y mismo comportamiento que móvil (periodo por defecto `'3m'`, skeleton, vacío con `EmptyState` + CTA `navigate('/')` o «Ver todo»). Layout: totales en `grid grid-cols-2 md:grid-cols-4`; músculos y balance lado a lado en `md:grid-cols-2`; ranking y récords lado a lado en `md:grid-cols-2`; tendencia a ancho completo.
- [ ] **Step 2: componentes** — mismas responsabilidades que en móvil (ver Task 4 Step 2), con `div`/CSS. `ExerciseRanking` expande con `<details>` o estado local. `BalanceBar` apilada con `flex` y anchos `%`.
- [ ] **Step 3: `ProgressPage.tsx`** — añadir `'estadisticas'` al array de tabs válidas y un `TabsTrigger value="estadisticas"` con `t('progress.tab.stats')`; `TabsContent` con `<TrainingStatsPanel />`; borrar import y uso de `MuscleVolumeChart`, borrar el fichero.
- [ ] **Step 4: verificar** — `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` (o el script `typecheck` de `apps/web/package.json`) y `npx eslint src/components/progress/stats src/pages/ProgressPage.tsx`. `grep -rn MuscleVolumeChart apps/web/src` debe devolver 0. No commitear.

### Task 6: Verificación y PR

- [ ] `pnpm -r typecheck` y `pnpm --filter @calistenia/core test`.
- [ ] Commits separados: móvil, web. Push, PR con plantilla, «Closes #596».
- [ ] QA en navegador (dos Vites, ver memoria) y en dispositivo.
