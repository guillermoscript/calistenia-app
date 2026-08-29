/**
 * prs-server.ts — los récords personales de verdad (#666).
 *
 * El servidor servía cinco números: `settings.pr_pullups`, `pr_pushups`,
 * `pr_lsit`, `pr_pistol` y `pr_handstand`. Son **espejos heredados**, y su
 * propio origen lo dice: `computePRBackfill` habla de «mirror updates into the
 * 5 legacy pr_* fields». La verdad de la app son dos mapas con TODOS los
 * ejercicios —`prs` (mejores reps) y `weight_prs` (mejor serie con peso y su
 * 1RM estimado)— que `useProgress` reconstruye escaneando `sets_log` entero.
 *
 * POR QUÉ HAY QUE RECALCULARLOS AQUÍ Y NO LEERLOS
 * ----------------------------------------------
 * Porque **no están en PocketBase**. La colección `settings` solo tiene los
 * cinco `pr_*` numéricos; `prs` y `weight_prs` viven en localStorage del
 * cliente, y `useProgress` los recorta a propósito antes de escribir en PB
 * («strip prs/weight_prs (localStorage-only) before writing to PB typed
 * columns»). Un servidor no tiene ese localStorage, así que la única forma de
 * contar lo mismo que la app es rehacer el cálculo desde los sets.
 *
 * Y se rehace con la MISMA función pura del cliente, igual que
 * `program-progress-server.ts` hizo con la fase: `computePRBackfill` sale de
 * `packages/core/lib/pr-backfill.ts` y aquí solo está lo de servidor, que es
 * leer las filas. Reimplementar el criterio de «esto es mejor que aquello»
 * sería garantizar que las dos versiones se separan otra vez.
 *
 * La cadena de imports no arrastra nada nuevo al bundle: `pr-backfill` solo
 * importa `pr-utils` (sin imports propios) y `legacyPrKey` de
 * `challenge-scoring`, cuyos imports son de tipos. Lo de `progress-map` es
 * `import type` y desaparece al compilar. Esto importa: ver el encabezado de
 * `program-progress-server.ts` sobre por qué el build local miente.
 *
 * DOS COSAS QUE PARECEN ERRATAS Y NO LO SON
 * ----------------------------------------
 * - **En un ejercicio de temporizador el récord está en segundos.** Los
 *   cronómetros guardan los segundos en `reps` (una plancha de 45 s es
 *   `reps: "45"`), así que `parseRepsForPR` devuelve 45 y aquí sale un 45 que
 *   no son repeticiones. El cliente hace exactamente lo mismo, y de ahí venía
 *   el `'30s'` del viejo campo de texto. La unidad la pone el ejercicio.
 * - **No se resuelve el nombre del ejercicio.** Las claves son los
 *   `exercise_id` de `sets_log` tal cual, que es como el resto de tools del MCP
 *   ya habla de ejercicios (`cal_list_sets`, `cal_exercise_history`) y con lo
 *   que el modelo puede seguir tirando. Inventar un nombre bonito exige el
 *   índice del catálogo y, cuando el id es una clave de hueco de programa y no
 *   una de catálogo, se acaba enseñando el nombre equivocado.
 */

import { computePRBackfill } from "@calistenia/core/lib/pr-backfill";
import type { Settings, WeightPR } from "@calistenia/core/types";
import type { ProgressSetRow } from "@calistenia/core/lib/progress-map";
import type { PB, RecordModel } from "./repos/index.js";

export type { WeightPR };

/** Los cinco espejos heredados, ya resueltos a número. */
export interface LegacyPRs {
  pullups: number;
  pushups: number;
  l_sit: number;
  pistol_squat: number;
  handstand: number;
}

export interface PersonalRecords {
  /** `exercise_id` → mejores reps (o segundos, si es de temporizador). */
  reps: Record<string, number>;
  /** `exercise_id` → mejor serie con peso, por 1RM estimado. */
  weight: Record<string, WeightPR>;
  /** Los cinco campos de siempre, para lo que ya dependía de ellos. */
  legacy: LegacyPRs;
  /** Cuántos ejercicios distintos tienen algún récord de reps. */
  tracked_exercises: number;
}

/** Proyección mínima para el cálculo: nada más entra en el criterio. */
const PR_SET_FIELDS = "exercise_id,reps,weight_kg";

/**
 * Récords del usuario, recalculados desde `sets_log`.
 *
 * `settings` es la fila de PocketBase (puede ser `null` si el usuario todavía
 * no tiene): sus cinco `pr_*` entran como suelo, de modo que un récord que
 * alguien apuntó a mano y nunca registró como serie no desaparece del informe.
 *
 * Se lee el historial ENTERO, sin ventana, porque un récord es de siempre — es
 * lo mismo que hace `useProgress`, que pide `sets_log` completo con
 * `getFullList`.
 */
export async function resolvePersonalRecords(
  pb: PB,
  userId: string,
  settings: RecordModel | null,
): Promise<PersonalRecords> {
  const stored: Settings = {
    phase: Number(settings?.phase ?? 1),
    startDate: null,
    weeklyGoal: Number(settings?.weekly_goal ?? 5),
    pr_pullups: Number(settings?.pr_pullups ?? 0),
    pr_pushups: Number(settings?.pr_pushups ?? 0),
    pr_lsit: Number(settings?.pr_lsit ?? 0),
    pr_pistol: Number(settings?.pr_pistol ?? 0),
    pr_handstand: Number(settings?.pr_handstand ?? 0),
  };

  const rows = await pb
    .collection("sets_log")
    .getFullList<RecordModel>({
      filter: pb.filter("user = {:userId}", { userId }),
      fields: PR_SET_FIELDS,
      requestKey: null,
    })
    .catch(() => [] as RecordModel[]);

  const sets = rows.map((r) => ({
    exercise_id: String(r.exercise_id ?? ""),
    workout_key: "",
    reps: r.reps == null ? undefined : String(r.reps),
    weight_kg: r.weight_kg == null ? null : Number(r.weight_kg),
  })) as ProgressSetRow[];

  // `computePRBackfill` devuelve SOLO lo que mejora lo que ya había, y `null`
  // cuando no mejora nada. Sin `prs` de partida, cualquier serie mejora, así
  // que el mapa vuelve entero; sin series vuelve `null` y quedan los espejos.
  const computed = computePRBackfill(sets, stored) ?? {};
  const reps = computed.prs ?? {};

  return {
    reps,
    weight: computed.weight_prs ?? {},
    legacy: {
      pullups: computed.pr_pullups ?? stored.pr_pullups ?? 0,
      pushups: computed.pr_pushups ?? stored.pr_pushups ?? 0,
      l_sit: computed.pr_lsit ?? stored.pr_lsit ?? 0,
      pistol_squat: computed.pr_pistol ?? stored.pr_pistol ?? 0,
      handstand: computed.pr_handstand ?? stored.pr_handstand ?? 0,
    },
    tracked_exercises: Object.keys(reps).length,
  };
}

/** Los N ejercicios con mejor marca de reps, para no volcar el mapa entero. */
export function topRepRecords(prs: PersonalRecords, limit = 10): { exercise_id: string; best: number }[] {
  return Object.entries(prs.reps)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([exercise_id, best]) => ({ exercise_id, best }));
}
