/**
 * program-overrides-server.ts — la progresión que el usuario ya aceptó,
 * superpuesta a lo prescrito (#663, sobre #617).
 *
 * Cuando el programa es del usuario, aceptar una sugerencia escribe en
 * `program_exercises` y el servidor no tiene nada que hacer: lee el dato ya
 * corregido. Cuando el programa es ajeno —los 15 oficiales, o el de otra
 * persona— escribir ahí sería cambiarle el programa a todo el mundo, así que la
 * aceptación vive en `user_program_overrides` y es **quien monta el día** el que
 * la superpone. El cliente ya lo hacía; el MCP no, y por eso le decía «3×10» a
 * alguien que la app ya tiene en 3×12.
 *
 * La regla de superposición no se reescribe aquí: la pone
 * `applyOverrideToExercise` (packages/core/lib/programOverrides.ts), incluido el
 * detalle de que en un ejercicio de temporizador la dosis vive TAMBIÉN en
 * `timerSeconds` y actualizar solo `reps` deja el cronómetro contando lo viejo.
 * Este fichero es el adaptador entre las filas de PocketBase y esa función.
 *
 * LO QUE NO HACE: resolver el NOMBRE de la variante aceptada. Eso necesita el
 * índice del catálogo, y core lo pide precisamente inyectado por fuera para no
 * atarse al JSON. Sin nombre, una sustitución se reporta con el id de la
 * variante — que es lo que el modelo necesita para buscarla con
 * `cal_search_exercises`— y nunca con el nombre viejo, que sería mentir.
 */

import {
  applyOverrideToExercise,
  indexOverrides,
  type ProgramOverride,
} from "@calistenia/core/lib/programOverrides";
import type { Exercise } from "@calistenia/core/types";
import { localize } from "../lib/i18n.js";
import type { RecordModel } from "./repos/index.js";

/** `user_program_overrides` → lo que espera core. */
export function toProgramOverrides(rows: RecordModel[]): ProgramOverride[] {
  return rows.map((r) => ({
    exerciseId: String(r.exercise_id ?? ""),
    exerciseIdOverride: (r.exercise_id_override as string) || undefined,
    repsOverride: (r.reps_override as string) || undefined,
  }));
}

/** Un ejercicio del programa tal y como debe servirse a este usuario. */
export interface ResolvedProgramExercise {
  /** Clave del hueco en el día (`program_exercises.exercise_id`). */
  exercise_id: string;
  name: string;
  sets: number | string;
  reps: string;
  rest_seconds: number;
  muscles: string;
  is_timer: boolean;
  timer_seconds?: number;
  youtube: string | null;
  section: string;
  /**
   * Id de la variante que el usuario aceptó en lugar de la prescrita (#617).
   * `null` si hace el ejercicio del programa.
   */
  variant_of: string | null;
  /** `true` si esta fila lleva una progresión aceptada aplicada encima. */
  auto_progressed: boolean;
}

/** Fila cruda de `program_exercises` → el `Exercise` que espera core. */
function toExercise(row: RecordModel): Exercise {
  const reps = String(row.reps ?? "");
  const isTimer = !!row.is_timer;
  return {
    id: String(row.exercise_id ?? ""),
    name: localize(row.exercise_name as never),
    sets: (row.sets as number | string) ?? "",
    reps,
    rest: Number(row.rest_seconds ?? 0),
    muscles: localize(row.muscles as never),
    note: localize(row.note as never),
    youtube: String(row.youtube ?? ""),
    priority: (row.priority as Exercise["priority"]) ?? "primary",
    isTimer,
    // En temporizador la dosis prescrita ES el número de segundos de `reps`;
    // core lo necesita para poder recalcularlo cuando la progresión lo sube.
    timerSeconds: isTimer ? Number(String(reps).match(/\d+/)?.[0]) || undefined : undefined,
    variant_of: (row.variant_of as string) || undefined,
  };
}

/**
 * Los ejercicios de un día con los overrides del usuario ya aplicados.
 *
 * Sin overrides devuelve exactamente lo prescrito, así que es seguro llamarla
 * siempre: el caso normal (programa propio, o nadie que haya aceptado nada) no
 * paga nada más que el mapeo.
 */
export function resolveProgramExercises(
  rows: RecordModel[],
  overrides: ProgramOverride[],
): ResolvedProgramExercise[] {
  const byId = indexOverrides(overrides);

  return rows.map((row) => {
    const prescribed = toExercise(row);
    const resolved = applyOverrideToExercise(prescribed, byId.get(prescribed.id));
    return {
      exercise_id: prescribed.id,
      name: resolved.name,
      sets: resolved.sets,
      reps: resolved.reps,
      rest_seconds: resolved.rest,
      muscles: resolved.muscles,
      is_timer: !!resolved.isTimer,
      timer_seconds: resolved.timerSeconds,
      youtube: resolved.youtube || null,
      section: String(row.section ?? "main"),
      variant_of: resolved.variant_of ?? null,
      // Referencia distinta = core aplicó algo. Comparar campos uno a uno aquí
      // sería reimplementar su criterio de "esto cambia o no cambia".
      auto_progressed: resolved !== prescribed,
    };
  });
}
