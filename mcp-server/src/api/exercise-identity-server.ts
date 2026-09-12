/**
 * exercise-identity-server.ts — de un `exercise_id` de `sets_log` a la
 * identidad que la app enseña (#702, la parte de servidor de #692).
 *
 * Las series se registran bajo dos tipos de clave: el id canónico del catálogo
 * (`pushup_std`, sesiones libres y programas nuevos) o la clave de slot del
 * programa («lun_1_2», «mie_1_10»), cuyo nombre sólo existe en el programa.
 * Encima hay ids retirados con historial huérfano (`pushup` hasta junio de
 * 2026). #692 hizo que la web fusione todo eso por identidad resuelta con
 * `buildExerciseResolver` de core; hasta este fichero el MCP seguía tratando
 * cada id como un ejercicio distinto, y le contaba a Claude dos «Flexiones».
 *
 * Igual que `program-progress-server.ts` y `prs-server.ts`, aquí NO se
 * reimplementa el criterio: el resolutor es el de core, y lo único de servidor
 * son sus dos entradas.
 *
 *  - **El índice del catálogo.** La web lo carga con un `import()` dinámico del
 *    JSON de core; aquí se lee del disco `data/exercise-catalog.json` (la copia
 *    que el Dockerfile sí lleva) y se inyecta con `primeCatalogIndex`, la misma
 *    vía síncrona que usan React Native y los tests. Cargar una vez por proceso.
 *  - **`getWorkout`.** El paso 2 del resolutor pregunta por el ejercicio de un
 *    día del programa ACTIVO (`p{fase}_{día}` es el `workout_key` de la serie).
 *    Se monta desde `program_exercises` de la inscripción `is_current`, con
 *    `resolveExerciseDisplayName` para que un `exercise_name` que es un slug
 *    (#687) llegue al resolutor ya como nombre y case con el catálogo. Sólo el
 *    programa activo, como en la app: el historial de un programa anterior bajo
 *    clave de slot se queda sin resolver en los dos sitios.
 *
 * Lo que NO hace: escribir. `cal_log_set` sigue guardando el id que le den;
 * `exercise_id` es la clave del historial y de los PRs, y esto sólo lee.
 */

import {
  primeCatalogIndex,
  type CatalogIndex,
  type RawCatalog,
} from "@calistenia/core/lib/catalogIndex";
import {
  buildExerciseResolver,
  resolveExerciseDisplayName,
  type ExerciseResolver,
  type ResolvedExercise,
} from "@calistenia/core/lib/exercise-resolver";
import { localize, type TranslatableField } from "@calistenia/core/lib/i18n-db";
import { LEGACY_EXERCISE_IDS } from "@calistenia/core/lib/resolveExerciseId";
import type { Exercise, Workout } from "@calistenia/core/types";
import { readCatalogFile } from "../lib/catalog-file.js";
import { getCurrentProgram, listProgramExercises, type CurrentProgram, type PB, type RecordModel } from "./repos/index.js";

export type { ResolvedExercise };

// ── Índice del catálogo ──────────────────────────────────────────────────────

let _serverIndex: CatalogIndex | null | undefined;

/**
 * El índice del catálogo de este proceso, o `null` si el fichero no aparece.
 * Sin índice el resolutor no afirma nada (todo cae al paso 3, id crudo), que
 * es exactamente el comportamiento anterior a #702: degradar, no romper.
 */
export function getServerCatalogIndex(): CatalogIndex | null {
  if (_serverIndex !== undefined) return _serverIndex;
  try {
    _serverIndex = primeCatalogIndex(readCatalogFile() as RawCatalog);
  } catch (err) {
    console.error("[exercise-identity] Failed to load exercise catalog:", err);
    _serverIndex = null;
  }
  return _serverIndex;
}

// ── Resolutor ────────────────────────────────────────────────────────────────

export interface ExerciseAliases {
  /** Identidad a la que resuelve la entrada (sin resolver: la propia entrada). */
  identity: ResolvedExercise;
  /**
   * Todos los `exercise_id` que resuelven a esa identidad: la entrada, el id
   * canónico, sus ids retirados (`LEGACY_EXERCISE_IDS`) y las claves de slot
   * del programa activo que apuntan a él. Es el `IN` con el que hay que filtrar
   * `sets_log` para ver el historial entero de un ejercicio.
   */
  ids: string[];
}

export interface ServerExerciseResolver {
  /** El resolutor de core, tal cual: `(exercise_id, workout_key)`. */
  resolve: ExerciseResolver;
  /** Identidad de un id; para una clave de slot busca su `workout_key` en el programa activo. */
  identityOf(exerciseId: string, workoutKey?: string): ResolvedExercise;
  /** Ver `ExerciseAliases`. */
  aliasesOf(exerciseId: string): ExerciseAliases;
}

export interface ServerResolverInput {
  index: CatalogIndex | null;
  /** Filas de `program_exercises` del programa activo (todas las fases). */
  programExercises: RecordModel[];
  locale?: string;
}

/** `program_exercises` → `Workout` por `p{fase}_{día}`, con lo que el resolutor mira. */
function toWorkouts(rows: RecordModel[], index: CatalogIndex | null, locale: string): Map<string, Workout> {
  const map = new Map<string, Workout>();
  for (const r of rows) {
    const key = `p${r.phase_number}_${r.day_id}`;
    let w = map.get(key);
    if (!w) {
      w = {
        phase: Number(r.phase_number),
        day: r.day_id as Workout["day"],
        title: localize(r.workout_title as TranslatableField, locale),
        exercises: [],
      };
      map.set(key, w);
    }
    w.exercises.push({
      id: String(r.exercise_id ?? ""),
      // Un `exercise_name` que es un slug del catálogo (#687) se cambia por el
      // nombre del catálogo, que es lo que el paso 2 del resolutor busca por
      // nombre. El `id` se queda crudo: es la clave del historial.
      name: resolveExerciseDisplayName(r.exercise_name as TranslatableField, String(r.exercise_id ?? ""), locale, index),
      sets: (r.sets as number | string) ?? 0,
      reps: String(r.reps ?? ""),
      rest: Number(r.rest_seconds ?? 0),
      muscles: localize(r.muscles as TranslatableField, locale),
      note: "",
      youtube: "",
      priority: r.priority as Exercise["priority"],
      isTimer: !!r.is_timer,
      timerSeconds: r.timer_seconds as number | undefined,
    });
  }
  return map;
}

/**
 * Monta el resolutor a partir de sus dos entradas. Pura: los tests le pasan un
 * índice de mentira (`buildCatalogIndex`) y filas de programa inventadas.
 */
export function buildServerExerciseResolver({ index, programExercises, locale = "es" }: ServerResolverInput): ServerExerciseResolver {
  const workouts = toWorkouts(programExercises, index, locale);
  // Clave de slot → su `workout_key`, para poder resolver un slot cuando quien
  // llama sólo tiene el id (`cal_get_exercise_history lun_1_2`). Si el mismo
  // id apareciera en dos días, gana el primero: los slots son únicos por
  // programa, y un empate sería el mismo ejercicio de todas formas.
  const slotWorkoutKey = new Map<string, string>();
  for (const [wk, w] of workouts) {
    for (const ex of w.exercises) {
      if (ex.id && !slotWorkoutKey.has(ex.id)) slotWorkoutKey.set(ex.id, wk);
    }
  }

  const resolve = buildExerciseResolver({
    index,
    getWorkout: (phase, dayId) => workouts.get(`p${phase}_${dayId}`) ?? null,
    locale,
  });

  const identityOf = (exerciseId: string, workoutKey?: string): ResolvedExercise =>
    resolve(exerciseId, workoutKey || slotWorkoutKey.get(exerciseId) || "");

  const aliasesOf = (exerciseId: string): ExerciseAliases => {
    const identity = identityOf(exerciseId);
    const ids = new Set<string>([exerciseId]);
    if (identity.resolved) {
      if (index?.ids.has(identity.key)) ids.add(identity.key);
      for (const [legacy, heir] of Object.entries(LEGACY_EXERCISE_IDS)) {
        if (heir === identity.key) ids.add(legacy);
      }
      for (const [slotId, wk] of slotWorkoutKey) {
        if (resolve(slotId, wk).key === identity.key) ids.add(slotId);
      }
    }
    return { identity, ids: [...ids] };
  };

  return { resolve, identityOf, aliasesOf };
}

/**
 * El resolutor del usuario: catálogo del proceso + `program_exercises` de su
 * programa activo. Sin programa activo, o si la lectura falla, resuelve sólo
 * contra el catálogo — nunca lanza, como el resto de lecturas auxiliares.
 *
 * `current` se acepta para quien ya lo ha leído (el perfil, el briefing);
 * pasarlo ahorra la consulta.
 */
export async function loadUserExerciseResolver(
  pb: PB,
  userId: string,
  opts: { current?: CurrentProgram | null; locale?: string; index?: CatalogIndex | null } = {},
): Promise<ServerExerciseResolver> {
  const index = opts.index !== undefined ? opts.index : getServerCatalogIndex();
  const current = opts.current !== undefined ? opts.current : await getCurrentProgram(pb, userId).catch(() => null);
  const programExercises = current
    ? await listProgramExercises(pb, current.program.id as string).catch(() => [] as RecordModel[])
    : [];
  return buildServerExerciseResolver({ index, programExercises, locale: opts.locale });
}

// ── Agrupar series ───────────────────────────────────────────────────────────

export interface IdentityGroup<T> {
  /** `ResolvedExercise.key`: id de catálogo, nombre normalizado o id crudo. */
  key: string;
  name: string;
  resolved: boolean;
  /** Ejercicio de temporizador: sus «reps» son segundos. */
  is_timer: boolean;
  /** Los `exercise_id` crudos que se fusionaron en este grupo, en orden de aparición. */
  exercise_ids: string[];
  sets: T[];
}

/**
 * Agrupa filas de `sets_log` por identidad resuelta, no por `exercise_id`
 * crudo — el mismo criterio que `groupLogsByResolvedExercise` en la web,
 * sobre filas de PB en vez de sobre un `ProgressMap`. Conserva el orden de
 * aparición de los grupos y el de las series dentro de cada uno.
 */
export function groupSetsByIdentity<T extends { exercise_id?: unknown; workout_key?: unknown }>(
  rows: T[],
  resolver: ServerExerciseResolver,
): IdentityGroup<T>[] {
  const groups = new Map<string, IdentityGroup<T>>();
  for (const row of rows) {
    const rawId = String(row.exercise_id ?? "");
    const r = resolver.resolve(rawId, String(row.workout_key ?? ""));
    let g = groups.get(r.key);
    if (!g) {
      g = { key: r.key, name: r.name, resolved: r.resolved, is_timer: r.isTimer, exercise_ids: [], sets: [] };
      groups.set(r.key, g);
    }
    if (!g.exercise_ids.includes(rawId)) g.exercise_ids.push(rawId);
    g.sets.push(row);
  }
  return [...groups.values()];
}
