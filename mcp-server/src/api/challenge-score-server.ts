/**
 * challenge-score-server.ts — la clasificación de un reto, con el MISMO
 * criterio que la pantalla de la app (#667, sobre #352 y #386).
 *
 * `getScore` vive dentro de `hooks/useChallengeDetail.ts`, no está exportada y
 * habla con el singleton `pb` del cliente, así que no se puede importar desde
 * aquí. Lo que sí se importa —y es donde está la matemática que se puede
 * desincronizar— son las funciones puras de `lib/cumulative-scoring.ts` y
 * `lib/pr-utils.ts`: los totales, el dedupe y el desempate son literalmente los
 * mismos objetos de código que usa la app. Lo único que se reescribe aquí es de
 * dónde salen las filas.
 *
 * CUATRO COSAS QUE SE APRENDIERON EN EL CLIENTE Y QUE AQUÍ SIGUEN VALIENDO:
 *
 * - **Se lee de las views `public_*`, nunca de las tablas base.** Desde
 *   `1783500001_lock_base_collections.js` `sets_log`, `sessions` y compañía son
 *   owner-only: puntuar a un rival contra la tabla base devuelve 0 filas sin
 *   error (#422) y el rival aparece clavado a cero, que parece un resultado.
 * - **Las cuentas privadas salen del ranking, no bajan a cero.** Se decide
 *   ANTES de pedir un solo score, mirando `is_private` del usuario expandido:
 *   para un espectador sin follow aceptado las `public_*` no devuelven nada, y
 *   un privado en el último puesto con 0 es peor mentira que no listarlo. El
 *   propio usuario siempre se ve a sí mismo. Cuántos quedaron fuera se
 *   devuelve en `hidden_private_count` para poder decirlo en voz alta.
 * - **La ventana es del ESPECTADOR.** `starts_at` … `ends_at + 1 día` en la
 *   zona horaria de quien mira, igual que el leaderboard de la app. Aquí la
 *   zona entra como parámetro (`tzDate`) porque este proceso atiende a muchos
 *   usuarios; en el cliente sale del singleton de módulo.
 * - **El empate se rompe por antigüedad de inscripción.** Sin eso el orden lo
 *   decidía el azar del fetch y dos preguntas seguidas daban dos rankings.
 *
 * LO QUE NO HACE: `metric: 'custom'` no se puntúa (se lleva a mano, como en la
 * app) y sale 0 para todo el mundo; se marca con `scored: false` para que quien
 * formatee no presente un empate a cero como una clasificación.
 */

import {
  compareLeaderboardEntries,
  countWorkouts,
  sumDistanceKm,
  sumExerciseTotal,
} from "@calistenia/core/lib/cumulative-scoring";
import { parseRepsForPR } from "@calistenia/core/lib/pr-utils";
import { addDaysIn, localMidnightAsUTCIn, utcToLocalDateStrIn } from "@calistenia/core/lib/tzDate";
import { listChallengeParticipants, type PB, type RecordModel } from "./repos/index.js";

/** Lo mínimo que hace falta de un reto para puntuarlo. */
export interface ScorableChallenge {
  id: string;
  metric: string;
  exercise_slug?: string;
  starts_at: string;
  ends_at: string;
}

/** Una fila de la clasificación. */
export interface LeaderboardRow {
  rank: number;
  user_id: string;
  display_name: string;
  value: number;
  is_current_user: boolean;
  /** El propio usuario, cuando su cuenta es privada. Los demás ni salen. */
  is_private: boolean;
}

export interface ChallengeLeaderboard {
  entries: LeaderboardRow[];
  /** Participantes con cuenta privada que NO compiten en público (#422). */
  hidden_private_count: number;
  /** Participantes totales, privados incluidos. */
  participant_count: number;
  /** `false` en `metric: 'custom'`: no hay nada que calcular. */
  scored: boolean;
  /** Puesto del usuario (1-based), o `null` si no aparece en la clasificación. */
  my_rank: number | null;
  my_value: number | null;
}

/** Métricas que se puntúan solas. `custom` se lleva a mano y nunca entra. */
const SCORED_METRICS = new Set([
  "exercise",
  "total_exercise",
  "most_sessions",
  "most_pullups",
  "most_pushups",
  "most_lsit",
  "most_handstand",
  "total_workouts",
  "total_distance",
  "longest_streak",
]);

/** Métrica → campo `pr_*` de `public_prs` del que se lee su puntuación. */
const PR_METRIC_FIELD: Record<string, string> = {
  most_pullups: "pr_pullups",
  most_pushups: "pr_pushups",
  most_lsit: "pr_lsit",
  most_handstand: "pr_handstand",
};

/** Unidad en la que se cuenta cada métrica, para no imprimir números desnudos. */
export function metricUnit(metric: string): string {
  switch (metric) {
    case "most_pullups":
    case "most_pushups":
    case "exercise":
    case "total_exercise":
      return "reps";
    case "most_lsit":
    case "most_handstand":
      return "s";
    case "total_distance":
      return "km";
    case "longest_streak":
      return "days";
    default:
      return "";
  }
}

/**
 * La ventana del reto como par de datetimes UTC para los filtros de PocketBase.
 *
 * Copia deliberada de `useChallengeDetail`: el inicio se interpreta tal y como
 * viene (si `starts_at` trae hora, la conserva) y el final es la medianoche del
 * día SIGUIENTE al último, para que el último día cuente entero.
 */
export function challengeWindow(challenge: ScorableChallenge, tz: string): { start: string; end: string } {
  return {
    start: localMidnightAsUTCIn(challenge.starts_at, tz),
    end: localMidnightAsUTCIn(addDaysIn(challenge.ends_at, 1, tz), tz),
  };
}

/**
 * Puntuación de UN participante. Nunca lanza: un fallo de lectura vale 0, igual
 * que en el cliente, porque un ranking incompleto es mejor que ninguno.
 */
export async function scoreParticipant(
  pb: PB,
  userId: string,
  challenge: ScorableChallenge,
  tz: string,
): Promise<number> {
  try {
    return await computeScore(pb, userId, challenge, tz);
  } catch {
    return 0;
  }
}

async function computeScore(
  pb: PB,
  userId: string,
  challenge: ScorableChallenge,
  tz: string,
): Promise<number> {
  const { start, end } = challengeWindow(challenge, tz);
  const slug = challenge.exercise_slug ?? "";
  const utcToLocalDay = (utc: string) => utcToLocalDateStrIn(utc, tz);

  switch (challenge.metric) {
    case "exercise": {
      // Mejor serie del ejercicio dentro de la ventana.
      if (!slug) return 0;
      const sets = await publicSets(pb, userId, slug, start, end, "reps");
      let best = 0;
      for (const s of sets) {
        const n = parseRepsForPR(s.reps as string);
        if (n != null && n > best) best = n;
      }
      return best;
    }
    case "total_exercise": {
      if (!slug) return 0;
      // `id` es imprescindible: es la clave de dedupe de sumExerciseTotal.
      const sets = await publicSets(pb, userId, slug, start, end, "id,reps");
      return sumExerciseTotal(sets as Array<{ id?: string; reps?: string | null }>);
    }
    case "most_sessions": {
      const page = await pb.collection("public_sessions").getList(1, 1, {
        filter: pb.filter("user = {:userId} && completed_at >= {:start} && completed_at <= {:end}", {
          userId,
          start,
          end,
        }),
        requestKey: null,
      });
      return page.totalItems;
    }
    case "most_pullups":
    case "most_pushups":
    case "most_lsit":
    case "most_handstand": {
      const prs = await pb
        .collection("public_prs")
        .getFirstListItem<RecordModel>(pb.filter("user = {:userId}", { userId }), { requestKey: null })
        .catch(() => null);
      return Number(prs?.[PR_METRIC_FIELD[challenge.metric]]) || 0;
    }
    case "total_workouts": {
      const [sessions, cardio] = await Promise.all([
        publicSessions(pb, userId, start, end, "workout_key,completed_at"),
        publicCardio(pb, userId, start, end, "id,started_at"),
      ]);
      return countWorkouts(
        sessions as Array<{ workout_key?: string; completed_at?: string }>,
        cardio as Array<{ id?: string; started_at?: string }>,
        utcToLocalDay,
      );
    }
    case "total_distance": {
      const cardio = await publicCardio(pb, userId, start, end, "id,distance_km");
      return sumDistanceKm(cardio as Array<{ id?: string; distance_km?: number }>);
    }
    case "longest_streak": {
      const sessions = await publicSessions(pb, userId, start, end, "completed_at");
      const days = [
        ...new Set(sessions.map((s) => (s.completed_at ? utcToLocalDay(s.completed_at as string) : ""))),
      ]
        .filter(Boolean)
        .sort();
      if (days.length === 0) return 0;
      let best = 1;
      let run = 1;
      for (let i = 1; i < days.length; i++) {
        const diff = (new Date(days[i]).getTime() - new Date(days[i - 1]).getTime()) / 86_400_000;
        if (diff === 1) {
          run++;
          if (run > best) best = run;
        } else {
          run = 1;
        }
      }
      return best;
    }
    default:
      // 'custom' y cualquier métrica futura que el servidor no conozca todavía.
      return 0;
  }
}

function publicSets(
  pb: PB,
  userId: string,
  exerciseId: string,
  start: string,
  end: string,
  fields: string,
): Promise<RecordModel[]> {
  return pb.collection("public_sets_log").getFullList<RecordModel>({
    filter: pb.filter(
      "user = {:userId} && exercise_id = {:exerciseId} && logged_at >= {:start} && logged_at <= {:end}",
      { userId, exerciseId, start, end },
    ),
    fields,
    requestKey: null,
  });
}

function publicSessions(
  pb: PB,
  userId: string,
  start: string,
  end: string,
  fields: string,
): Promise<RecordModel[]> {
  return pb.collection("public_sessions").getFullList<RecordModel>({
    filter: pb.filter("user = {:userId} && completed_at >= {:start} && completed_at <= {:end}", {
      userId,
      start,
      end,
    }),
    fields,
    requestKey: null,
  });
}

/** El cardio puede no existir para este usuario; nunca debe tumbar el score. */
function publicCardio(
  pb: PB,
  userId: string,
  start: string,
  end: string,
  fields: string,
): Promise<RecordModel[]> {
  return pb
    .collection("public_cardio_sessions")
    .getFullList<RecordModel>({
      filter: pb.filter("user = {:userId} && started_at >= {:start} && started_at <= {:end}", {
        userId,
        start,
        end,
      }),
      fields,
      requestKey: null,
    })
    .catch(() => [] as RecordModel[]);
}

/**
 * `name` antes que el email: el email lo esconde `users_field_privacy.pb.js`
 * (#411) y en un alta por Google `name` viene vacío, así que hacen falta los
 * tres escalones para no acabar pintando «?».
 */
function displayNameOf(user: RecordModel | undefined): string {
  if (!user) return "?";
  const email = typeof user.email === "string" ? user.email.split("@")[0] : "";
  return (user.display_name as string) || (user.name as string) || email || "?";
}

/** La clasificación completa de un reto, ya ordenada. */
export async function buildChallengeLeaderboard(
  pb: PB,
  challenge: ScorableChallenge,
  currentUserId: string,
  tz: string,
): Promise<ChallengeLeaderboard> {
  const participants = await listChallengeParticipants(pb, challenge.id);
  const scored = SCORED_METRICS.has(challenge.metric);

  const visible = participants.filter((p) => {
    const user = (p.expand as { user?: RecordModel } | undefined)?.user;
    return user?.is_private !== true || p.user === currentUserId;
  });

  const ranked = await Promise.all(
    visible.map(async (p) => {
      const user = (p.expand as { user?: RecordModel } | undefined)?.user;
      const uid = String(p.user ?? "");
      return {
        user_id: uid,
        display_name: displayNameOf(user),
        value: scored ? await scoreParticipant(pb, uid, challenge, tz) : 0,
        is_current_user: uid === currentUserId,
        is_private: user?.is_private === true,
        // Desempate determinista: quien se unió antes gana.
        joinedAt: String(p.created ?? ""),
      };
    }),
  );

  ranked.sort((a, b) =>
    compareLeaderboardEntries(
      { value: a.value, joinedAt: a.joinedAt, userId: a.user_id },
      { value: b.value, joinedAt: b.joinedAt, userId: b.user_id },
    ),
  );

  const entries: LeaderboardRow[] = ranked.map((r, i) => ({
    rank: i + 1,
    user_id: r.user_id,
    display_name: r.display_name,
    value: r.value,
    is_current_user: r.is_current_user,
    is_private: r.is_private,
  }));

  const mine = entries.find((e) => e.is_current_user) ?? null;

  return {
    entries,
    hidden_private_count: participants.length - visible.length,
    participant_count: participants.length,
    scored,
    my_rank: mine ? mine.rank : null,
    my_value: mine ? mine.value : null,
  };
}
