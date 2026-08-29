/**
 * program-progress-server.ts — la fase y la semana del programa activo (#663),
 * resueltas con la MISMA lib pura que usa el cliente.
 *
 * Hasta ahora el servidor leía `settings.phase`, un entero global del usuario.
 * Desde #616 esa ya no es la fase del programa: se deriva de
 * `user_programs.started_at` + los rangos `weeks` de `program_phases`, y el
 * override manual vive en `user_programs.current_phase`, es decir POR
 * INSCRIPCIÓN. Con el entero global, apuntarse a otro programa arrastraba la
 * fase del anterior — y el MCP construye con ese número las claves
 * `p{fase}_{día}` y el filtro `phase_number` de `program_exercises`, así que
 * equivocarse no era pintar un dato de más: era proponer los ejercicios de
 * otra fase.
 *
 * Igual que `insight-context-server.ts`, este fichero NO reimplementa el
 * cálculo: `computeProgramProgress` (packages/core/lib/programProgress.ts) es
 * una función pura y aquí solo está lo genuinamente de servidor — leer las
 * filas y, sobre todo, la zona horaria. El cliente tiene un singleton de
 * timezone; este proceso atiende a muchos usuarios, así que `tz` entra siempre
 * como parámetro explícito.
 *
 * PARIDAD CON LA APP, dos decisiones que parecen detalles y no lo son:
 *
 * - **Las sesiones NO se filtran por programa.** El cliente alimenta la lib con
 *   el `ProgressMap` de `useProgress`, que es del usuario entero. Filtrar aquí
 *   por `program` daría un `sessions_this_week` más "puro" pero distinto del
 *   que el usuario ve en su pantalla, y el MCP existe para hablar de lo que la
 *   app enseña.
 * - **`settings.phase` sobrevive como último recurso**, exactamente como en
 *   `useProgramProgress`: solo cuando no hay nada de donde derivar (programa
 *   sin fases, inscripción sin `started_at`), para que quien todavía no se ha
 *   inscrito siga viendo la fase que tenía.
 *
 * Nunca lanza por datos incompletos: sin programa activo devuelve `null` y el
 * llamante decide qué decir.
 *
 * POR QUÉ ESTE FICHERO AÑADIÓ `i18next` A package.json
 * ----------------------------------------------------
 * `programProgress` → `community-programs` → `dateUtils`, y ese último importa
 * `i18next` para formatear. El bundle de `mcp-use build` inlinea el código de
 * core, así que la dependencia tiene que estar en el árbol de `mcp-server`: en
 * local pnpm la encontraba subiendo a la raíz del monorepo y el build pasaba,
 * pero el job de CI hace `npm ci` DENTRO de mcp-server y enlaza
 * `packages/core/node_modules` a ese mismo árbol, donde no estaba → el build
 * moría al evaluar la entrada. Es la misma razón por la que `dayjs` y
 * `pocketbase` ya estaban declarados ahí (ver el comentario de
 * .github/workflows/build-ai-api.yml).
 *
 * De esa cadena solo se usa `addDays`, que es aritmética de calendario sobre
 * `YYYY-MM-DD`: depende del `_tz` singleton de core, que en este proceso es el
 * del contenedor, pero sumar días a una fecha sin hora da el mismo día en
 * cualquier zona. Las horas de verdad pasan por `utcToLocalDay`, que sí recibe
 * el `tz` del usuario.
 */

import {
  completedWorkoutsFromProgress,
  computeProgramProgress,
  type CompletedWorkout,
  type ProgramProgress,
} from "@calistenia/core/lib/programProgress";
import { utcToLocalDateStrIn } from "@calistenia/core/lib/tzDate";
import type { DayType, Phase, WeekDay } from "@calistenia/core/types";
import { localize } from "../lib/i18n.js";
import {
  getCurrentProgram,
  getSettings,
  listProgramDayConfig,
  listProgramPhases,
  type CurrentProgram,
  type PB,
  type RecordModel,
} from "./repos/index.js";

export type { ProgramProgress };

export interface ActiveProgramProgress {
  /** La inscripción activa y su programa, ya resueltos. */
  current: CurrentProgram;
  /** Progreso calculado por core: semana, fase, adherencia de la semana. */
  progress: ProgramProgress;
  /** Fases del programa, en orden. */
  phases: Phase[];
  /** Días de la semana **de la fase en curso** (los `rest` incluidos). */
  weekDays: WeekDay[];
}

/** `program_phases` → el `Phase` que espera core. */
function toPhases(rows: RecordModel[]): Phase[] {
  return rows.map((ph) => ({
    id: Number(ph.phase_number),
    name: localize(ph.name as never),
    weeks: String(ph.weeks ?? ""),
    color: String(ph.color ?? ""),
    bg: String(ph.bg_color ?? ""),
  }));
}

/** `program_day_config` de una fase → los `WeekDay` que espera core. */
function toWeekDays(rows: RecordModel[], phaseNumber: number): WeekDay[] {
  return rows
    .filter((dc) => Number(dc.phase_number) === phaseNumber)
    .map((dc) => ({
      id: dc.day_id as WeekDay["id"],
      name: localize(dc.day_name as never),
      focus: localize(dc.day_focus as never),
      type: (dc.day_type ?? "full") as DayType,
      color: String(dc.day_color ?? ""),
    }));
}

/**
 * Progreso del programa activo del usuario, o `null` si no tiene ninguno.
 *
 * `current` se acepta como parámetro para los llamantes que ya lo han leído
 * (el briefing diario lo necesita antes que la fase): pasarlo ahorra la
 * consulta, no pasarlo la hace aquí.
 */
export async function resolveActiveProgramProgress(
  pb: PB,
  userId: string,
  tz: string,
  today: string,
  opts: { current?: CurrentProgram | null } = {},
): Promise<ActiveProgramProgress | null> {
  const current = opts.current !== undefined ? opts.current : await getCurrentProgram(pb, userId);
  if (!current) return null;

  const { userProgram, program } = current;
  const programId = program.id as string;
  const startedAt = (userProgram.started_at as string) ?? "";

  const [phaseRows, dayRows, completed, settings] = await Promise.all([
    listProgramPhases(pb, programId),
    listProgramDayConfig(pb, programId).catch(() => [] as RecordModel[]),
    listCompletedWorkouts(pb, userId, tz, startedAt),
    getSettings(pb, userId),
  ]);

  const phases = toPhases(phaseRows);
  const input = {
    startedAt,
    durationWeeks: Number(program.duration_weeks ?? 0),
    phases,
    completed,
    utcToLocalDay: (utc: string) => utcToLocalDateStrIn(utc, tz),
    today,
    phaseOverride: (userProgram.current_phase as number) ?? null,
  };

  // Dos pasadas sobre una función pura, y el orden importa: los días
  // planificados de la semana salen de `program_day_config`, que está guardado
  // POR FASE, así que hay que saber la fase antes de poder elegir sus días. La
  // primera pasada va sin días (la fase no depende de ellos) y solo sirve para
  // preguntarle a core cuál es; la segunda ya calcula adherencia y `next_day`
  // con los días correctos. `program_day_config` se lee una sola vez.
  const withoutDays = computeProgramProgress({ ...input, weekDays: [] });
  const weekDays = toWeekDays(dayRows, withoutDays.currentPhase);
  const computed = computeProgramProgress({ ...input, weekDays });

  // Mismo último recurso que `useProgramProgress`: `settings.phase` solo pinta
  // cuando core no ha podido derivar NI aplicar override.
  const settingsPhase = Number(settings?.phase ?? 0);
  const progress: ProgramProgress =
    computed.phaseSource === "fallback" && Number.isFinite(settingsPhase) && settingsPhase >= 1
      ? { ...computed, currentPhase: Math.floor(settingsPhase) }
      : computed;

  return { current, progress, phases, weekDays };
}

/**
 * Entrenos completados del usuario desde que empezó el programa.
 *
 * Se leen las sesiones crudas y se pasan por `completedWorkoutsFromProgress`
 * con la forma de `ProgressMap` que esa función espera, para heredar su
 * deduplicación por (día local, `workout_key`) en vez de escribir otra aquí.
 *
 * Sin `startedAt` no hay ventana que calcular, así que tampoco hay nada que
 * leer: se ahorra la consulta y core devuelve su estado seguro.
 */
async function listCompletedWorkouts(
  pb: PB,
  userId: string,
  tz: string,
  startedAt: string,
): Promise<CompletedWorkout[]> {
  if (!startedAt) return [];
  const rows = await pb
    .collection("sessions")
    .getFullList({
      filter: pb.filter("user = {:userId} && completed_at >= {:startedAt}", { userId, startedAt }),
      fields: "id,workout_key,completed_at",
      sort: "completed_at",
      requestKey: null,
    })
    .catch(() => [] as RecordModel[]);

  const progressMap: Record<string, unknown> = {};
  for (const s of rows) {
    const completedAt = s.completed_at as string;
    const workoutKey = s.workout_key as string;
    if (!completedAt || !workoutKey) continue;
    progressMap[`done_${s.id}`] = {
      done: true,
      date: utcToLocalDateStrIn(completedAt, tz),
      workoutKey,
    };
  }
  return completedWorkoutsFromProgress(progressMap as never);
}
