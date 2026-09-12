/**
 * battle-server.ts — el marcador de una batalla, pedido donde toca (#667).
 *
 * `battles` y `battle_participants` NO son la fuente del marcador y no pueden
 * serlo: sus reglas de escritura son `null` y la de lectura de participantes es
 * `user = @request.auth.id || battle.creator = @request.auth.id`, así que un
 * participante que no sea el creador **solo se ve a sí mismo** (#413). Un
 * marcador montado desde esa colección enseñaría una batalla de un solo
 * corredor y parecería que va ganando.
 *
 * El estado autoritativo lo sirve `GET /api/battles/{id}/snapshot`
 * (`pb_hooks/battle_api.pb.js`, #356), que añade los `display_name` y calcula
 * el ranking, los descansos y el reloj del servidor. Este módulo es solo el
 * cliente de ese endpoint para el MCP; el de la app es
 * `packages/core/lib/battleApi.ts` y no se puede importar porque habla con el
 * singleton `pb` del cliente.
 *
 * UNA BATALLA CERRADA NO SE PIDE AL SNAPSHOT: su ranking está congelado en
 * `battles.final_standings` (#398), y una petición por fila no sobrevive a un
 * historial. Ojo con la lectura: `final_standings` es `null` en las batallas
 * que se cerraron ANTES de #398 — eso es «no hay resultado guardado», nunca una
 * derrota ni un ranking vacío.
 */

import type PocketBase from "pocketbase";
import type { PB, RecordModel } from "./repos/index.js";

/** `PB` más el `send` crudo que necesita el endpoint del snapshot. */
export type PBWithSend = PB & Pick<PocketBase, "send">;

/** Una fila del ranking, tal y como la sirven snapshot y `final_standings`. */
export interface BattleStandingRow {
  rank: number;
  display_name: string;
  user_id: string | null;
  status: string;
  completed_rounds: number;
  completed_reps: number;
  completed_time_seconds: number;
  /** En qué ejercicio va, o `null` si aún no ha empezado. */
  current_exercise_position: number | null;
  is_current_user: boolean;
}

export interface BattleView {
  id: string;
  status: string;
  rounds: number;
  exercise_count: number;
  starts_at: string | null;
  finished_at: string | null;
  standings: BattleStandingRow[];
  /**
   * De dónde salió el ranking: `snapshot` (vivo, autoritativo), `stored` (el
   * congelado al cerrar) o `none` — que significa «no se sabe», no «vacío».
   */
  standings_source: "snapshot" | "stored" | "none";
  my_rank: number | null;
}

interface RawStanding {
  rank?: number;
  display_name?: string;
  user?: string | null;
  status?: string;
  current_exercise_position?: number | null;
  score?: {
    completed_rounds?: number;
    completed_reps?: number;
    completed_time_seconds?: number;
  };
}

function toStandingRows(raw: unknown, currentUserId: string): BattleStandingRow[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawStanding[]).map((s, i) => ({
    rank: Number(s.rank) || i + 1,
    display_name: String(s.display_name ?? "?"),
    user_id: (s.user as string) ?? null,
    status: String(s.status ?? ""),
    completed_rounds: Number(s.score?.completed_rounds) || 0,
    completed_reps: Number(s.score?.completed_reps) || 0,
    completed_time_seconds: Number(s.score?.completed_time_seconds) || 0,
    current_exercise_position: s.current_exercise_position ?? null,
    is_current_user: !!s.user && s.user === currentUserId,
  }));
}

/** Configuración de la batalla, defensiva: `config` es un campo JSON. */
function configOf(row: RecordModel | Record<string, unknown>): { rounds: number; exercises: number } {
  const config = (row as { config?: { rounds?: number; exercises?: unknown[] } }).config;
  return {
    rounds: Number(config?.rounds) || 0,
    exercises: Array.isArray(config?.exercises) ? config.exercises.length : 0,
  };
}

/**
 * El marcador VIVO de una batalla abierta.
 *
 * Devuelve `null` si el endpoint falla (batalla que ya cerró entre dos
 * llamadas, red, despliegue sin el hook): el llamante cae al estado que ya
 * tiene en la mano en vez de inventarse un ranking.
 */
export async function fetchBattleSnapshot(
  pb: PBWithSend,
  battleId: string,
  currentUserId: string,
): Promise<BattleView | null> {
  const snapshot = await pb
    .send(`/api/battles/${battleId}/snapshot`, { method: "GET", requestKey: null })
    .catch(() => null);
  if (!snapshot || typeof snapshot !== "object") return null;

  const battle = (snapshot as { battle?: RecordModel }).battle;
  if (!battle) return null;
  const { rounds, exercises } = configOf(battle);
  const standings = toStandingRows((snapshot as { standings?: unknown }).standings, currentUserId);

  return {
    id: String(battle.id ?? battleId),
    status: String(battle.status ?? ""),
    rounds,
    exercise_count: exercises,
    starts_at: (battle.starts_at as string) ?? null,
    finished_at: (battle.finished_at as string) ?? null,
    standings,
    standings_source: "snapshot",
    my_rank: standings.find((s) => s.is_current_user)?.rank ?? null,
  };
}

/**
 * Una batalla cerrada, con el ranking que quedó guardado.
 *
 * `standings_source: "none"` cuando `final_standings` es null: la batalla se
 * jugó antes de #398 y no hay resultado que enseñar. Quien formatee debe decir
 * eso y no «sin clasificación», que se lee como que nadie puntuó.
 */
export function toClosedBattleView(row: RecordModel, currentUserId: string): BattleView {
  const { rounds, exercises } = configOf(row);
  const stored = row.final_standings;
  const standings = toStandingRows(stored, currentUserId);
  const hasStored = Array.isArray(stored);

  return {
    id: row.id,
    status: String(row.status ?? ""),
    rounds,
    exercise_count: exercises,
    starts_at: (row.starts_at as string) ?? null,
    finished_at: (row.finished_at as string) ?? (row.last_activity_at as string) ?? null,
    standings,
    standings_source: hasStored ? "stored" : "none",
    my_rank: standings.find((s) => s.is_current_user)?.rank ?? null,
  };
}
