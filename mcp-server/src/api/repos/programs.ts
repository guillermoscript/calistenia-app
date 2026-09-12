/**
 * repos/programs.ts — programs, phases, exercises and the user's current
 * program (#480). Replaces the "current program with `expand: program`" read
 * (5 sites), the "deactivate current + create" preamble (3 sites) and the
 * per-program phase/exercise listings.
 */

import type { PB, RecordModel } from "./pb.js";

export interface CurrentProgram {
  /** The `user_programs` row (with `expand.program`). */
  userProgram: RecordModel;
  /** The expanded `programs` record. */
  program: RecordModel;
}

/**
 * The user's current program (`is_current = true`) with the program expanded,
 * or null when none is set / the expand is missing. Callers used to unwrap
 * `userPrograms[0].expand?.program` themselves at every site.
 */
export async function getCurrentProgram(pb: PB, userId: string): Promise<CurrentProgram | null> {
  const rows = await pb.collection("user_programs").getFullList({
    filter: pb.filter("user = {:userId} && is_current = true", { userId }),
    expand: "program",
    requestKey: null,
  });
  const userProgram = rows[0];
  const program = userProgram?.expand?.program as RecordModel | undefined;
  if (!userProgram || !program) return null;
  return { userProgram, program };
}

/**
 * Make `programId` the user's current program: deactivate every current row,
 * then reactivate the user's existing row for that program (if any) or create
 * one. Returns the active `user_programs` record.
 *
 * Reusing the existing row (instead of always creating) is what the
 * cal_set_current_program tool already did; the "create + set current" flows
 * always created, which could leave duplicate rows for the same program.
 */
export async function setCurrentProgram(pb: PB, userId: string, programId: string): Promise<RecordModel> {
  const current = await pb.collection("user_programs").getFullList({
    filter: pb.filter("user = {:userId} && is_current = true", { userId }),
    fields: "id,program,is_current",
    requestKey: null,
  });
  for (const up of current) {
    await pb.collection("user_programs").update(up.id, { is_current: false });
  }

  const existing = await pb
    .collection("user_programs")
    .getFirstListItem(pb.filter("user = {:userId} && program = {:programId}", { userId, programId }), {
      requestKey: null,
    })
    .catch(() => null);

  const startedAt = new Date().toISOString();
  if (existing) {
    return pb.collection("user_programs").update(existing.id, { is_current: true, started_at: startedAt });
  }
  return pb.collection("user_programs").create({ user: userId, program: programId, is_current: true, started_at: startedAt });
}

/** Phases of a program, in `sort_order`. */
export function listProgramPhases<T extends RecordModel = RecordModel>(pb: PB, programId: string): Promise<T[]> {
  return pb.collection("program_phases").getFullList<T>({
    filter: pb.filter("program = {:programId}", { programId }),
    sort: "sort_order",
    requestKey: null,
  });
}

export interface ProgramExercisesQuery {
  /** Restrict to one phase (`phase_number`). */
  phase?: number;
  /** Restrict to one day (`day_id`); only meaningful together with `phase`. */
  dayId?: string;
  /** Sort expression. Default: `phase_number,day_id,sort_order`. */
  sort?: string;
}

/** Exercises of a program, optionally narrowed to a phase / day. */
export function listProgramExercises<T extends RecordModel = RecordModel>(
  pb: PB,
  programId: string,
  q: ProgramExercisesQuery = {},
): Promise<T[]> {
  const parts = ["program = {:programId}"];
  const params: Record<string, unknown> = { programId };
  if (q.phase !== undefined) {
    parts.push("phase_number = {:phase}");
    params.phase = q.phase;
  }
  if (q.dayId !== undefined) {
    parts.push("day_id = {:dayId}");
    params.dayId = q.dayId;
  }
  return pb.collection("program_exercises").getFullList<T>({
    filter: pb.filter(parts.join(" && "), params),
    sort: q.sort ?? "phase_number,day_id,sort_order",
    requestKey: null,
  });
}

/** Day configuration of a program (`program_day_config`), all phases. */
export function listProgramDayConfig<T extends RecordModel = RecordModel>(
  pb: PB,
  programId: string,
): Promise<T[]> {
  return pb.collection("program_day_config").getFullList<T>({
    filter: pb.filter("program = {:programId}", { programId }),
    sort: "phase_number,sort_order",
    requestKey: null,
  });
}

/**
 * The user's accepted auto-progressions for a program (#617).
 *
 * These rows only exist for programs the user does NOT own: on an own program
 * accepting a suggestion writes straight into `program_exercises`. Serving the
 * prescription without them tells someone already at 3x12 to do 3x10.
 *
 * Never throws: the collection is newer than the deployment that may be
 * running, and a program with no overrides is the normal case, so a failure
 * here degrades to "no overrides" instead of taking the whole tool down.
 */
export async function listProgramOverrides<T extends RecordModel = RecordModel>(
  pb: PB,
  userId: string,
  programId: string,
): Promise<T[]> {
  return pb
    .collection("user_program_overrides")
    .getFullList<T>({
      filter: pb.filter("user = {:userId} && program = {:programId}", { userId, programId }),
      requestKey: null,
    })
    .catch(() => [] as T[]);
}

/**
 * Cuánta gente sigue cada programa, de `view_program_stats` (#620, #669).
 *
 * Los conteos los agrega la view en el servidor; hacerlos aquí costaría una
 * consulta por programa del catálogo. La definición está en
 * `pb_migrations/1786200000_program_forked_from_and_stats.js` y el `id` de la
 * view ES el del programa, así que se filtra por los mismos ids que la tool ya
 * tiene en la mano.
 *
 * TRES COSAS QUE EL CLIENTE YA APRENDIÓ (`packages/core/hooks/useProgramStats.ts`)
 * Y QUE AQUÍ VALEN IGUAL:
 *
 * 1. **El filtro se trocea.** Viaja en la query string, y un catálogo entero en
 *    un solo `OR` genera una URL que el servidor rechaza (414) o que un proxy
 *    trunca. 50 ids por consulta, el mismo tamaño que usa `fetchCatalog`.
 * 2. **Nunca lanza.** Un despliegue sin la migración aplicada devuelve 404 en
 *    esta colección, y el contador es prueba social: sin él la tool tiene que
 *    seguir respondiendo igual que antes de #620.
 * 3. **Ausente NO es cero.** Si la regla de lectura de la view no casa,
 *    PocketBase devuelve 0 filas SIN error (#422): un programa que no vuelve
 *    puede ser «no lo sigue nadie» o «no puedes verlo», y desde aquí son
 *    indistinguibles. Se deja fuera del mapa en vez de meterlo a 0, para que el
 *    llamante pueda distinguir «no se sabe» de «nadie todavía». Rellenar con
 *    ceros convertiría un fallo de permisos en un «0 personas lo siguen»
 *    perfectamente creíble.
 */
export interface ProgramStats {
  active_count: number;
  completed_count: number;
  /** Activos + completados: el «N personas lo siguen» que pinta la app. */
  followers_count: number;
  /** Gente DISTINTA con al menos una sesión de este programa. */
  athletes_count: number;
}

/** Cuántos ids caben en un mismo `OR` antes de partir la consulta. */
const STATS_ID_CHUNK = 50;

export async function listProgramStats(
  pb: PB,
  programIds: readonly string[],
): Promise<Record<string, ProgramStats>> {
  const ids = [...new Set(programIds)].filter(Boolean);
  if (ids.length === 0) return {};

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += STATS_ID_CHUNK) chunks.push(ids.slice(i, i + STATS_ID_CHUNK));

  const pages = await Promise.all(
    chunks.map((chunk) =>
      pb
        .collection("view_program_stats")
        .getFullList<RecordModel>({
          filter: chunk.map((id) => pb.filter("id = {:id}", { id })).join(" || "),
          requestKey: null,
        })
        .catch(() => [] as RecordModel[]),
    ),
  );

  const byId: Record<string, ProgramStats> = {};
  for (const row of pages.flat()) {
    // `Number(x) || 0`: SQLite devuelve los COUNT como números, pero un campo
    // que no viniera daría `NaN` y saldría impreso tal cual.
    byId[row.id] = {
      active_count: Number(row.active_count) || 0,
      completed_count: Number(row.completed_count) || 0,
      followers_count: Number(row.followers_count) || 0,
      athletes_count: Number(row.athletes_count) || 0,
    };
  }
  return byId;
}
