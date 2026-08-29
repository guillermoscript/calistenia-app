/**
 * repos/social.ts — lecturas de retos, batallas y carreras (#667).
 *
 * La épica #345 entera está en producción y el servidor MCP no la veía: no
 * había una sola referencia a `challenges`, `battles` ni `races` en
 * `mcp-server/src`. Este fichero es la capa de datos; la puntuación y el
 * formato viven fuera (ver `challenge-score-server.ts` y `tools/social.ts`).
 *
 * TRES REGLAS DE LECTURA QUE NO SON NEGOCIABLES AQUÍ:
 *
 * 1. **Las tablas base de actividad son owner-only** desde
 *    `1783500001_lock_base_collections.js`. Cualquier dato de OTRO participante
 *    se lee de las views `public_*` (#386). Leer `sets_log` a pelo para
 *    puntuar a un rival devuelve 0 filas y un marcador de ceros creíble.
 * 2. **`battle_participants` enseña MENOS de lo que ve la app**: su regla es
 *    `user = @request.auth.id || battle.creator = @request.auth.id`, así que un
 *    participante que no sea el creador solo se ve a sí mismo. El marcador vivo
 *    lo sirve `/api/battles/{id}/snapshot` (#413), nunca esta colección.
 * 3. **Una regla que no casa devuelve 0 filas EN SILENCIO** (#422). Ninguna de
 *    estas funciones convierte «no vino nada» en un cero de dominio: devuelven
 *    la lista vacía o `null` y es el llamante quien decide qué decir.
 */

import type { PB, RecordModel } from "./pb.js";

// ─── Retos ──────────────────────────────────────────────────────────────────

/**
 * Las participaciones del usuario con el reto expandido.
 *
 * Se entra por `challenge_participants` y no por `challenges` a propósito: la
 * lista de `challenges` es «cualquier usuario autenticado» y devolvería los
 * retos de todo el mundo. La participación es lo que hace que un reto sea del
 * usuario, exactamente como en `useChallenges`.
 */
export function listMyChallengeParticipations(pb: PB, userId: string): Promise<RecordModel[]> {
  return pb
    .collection("challenge_participants")
    .getFullList<RecordModel>({
      filter: pb.filter("user = {:userId}", { userId }),
      expand: "challenge",
      requestKey: null,
    })
    .catch(() => [] as RecordModel[]);
}

/** Un reto por id, o `null` si no existe o no se puede ver. */
export function getChallenge(pb: PB, challengeId: string): Promise<RecordModel | null> {
  return pb
    .collection("challenges")
    .getFirstListItem<RecordModel>(pb.filter("id = {:challengeId}", { challengeId }), {
      requestKey: null,
    })
    .catch(() => null);
}

/**
 * Participantes de un reto con el usuario expandido (nombre y `is_private`).
 *
 * `is_private` es imprescindible aquí y no un extra: decide quién entra en el
 * ranking antes de pedir un solo score (ver `challenge-score-server.ts`).
 */
export function listChallengeParticipants(pb: PB, challengeId: string): Promise<RecordModel[]> {
  return pb
    .collection("challenge_participants")
    .getFullList<RecordModel>({
      filter: pb.filter("challenge = {:challengeId}", { challengeId }),
      expand: "user",
      requestKey: null,
    })
    .catch(() => [] as RecordModel[]);
}

/**
 * Cuántos participantes tiene cada reto, `{ id: n }`.
 *
 * Una consulta por reto pidiendo UNA fila y quedándose con `totalItems`, igual
 * que `fetchChallenges`: es el único recuento exacto que da PocketBase sin
 * traerse las filas. Un reto cuyo conteo falla se queda FUERA del mapa en vez
 * de entrar a 0 — ver la regla 3 de la cabecera.
 */
export async function countChallengeParticipants(
  pb: PB,
  challengeIds: readonly string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(challengeIds)].filter(Boolean);
  const counted = await Promise.all(
    ids.map(async (challengeId) => {
      const page = await pb
        .collection("challenge_participants")
        .getList(1, 1, {
          filter: pb.filter("challenge = {:challengeId}", { challengeId }),
          requestKey: null,
        })
        .catch(() => null);
      return page ? ([challengeId, page.totalItems] as const) : null;
    }),
  );

  const byId: Record<string, number> = {};
  for (const row of counted) if (row) byId[row[0]] = row[1];
  return byId;
}

// ─── Batallas ───────────────────────────────────────────────────────────────

/** Estados en los que una batalla sigue en juego. */
const OPEN_BATTLE_STATUSES = ["draft", "lobby", "ready", "live"] as const;
/** Estados en los que ya no hay nada que jugar. */
const CLOSED_BATTLE_STATUSES = ["finished", "cancelled", "expired"] as const;

/** Cuántas batallas abiertas se miran antes de rendirse. Igual que `battleApi`. */
const ACTIVE_BATTLE_SCAN = 10;

/**
 * Las batallas abiertas del usuario, la más reciente primero.
 *
 * `sort: '-last_activity_at'` no es cosmético y lo aprendió el cliente:
 * `battles` NO tiene `created`/`updated` autodate, PocketBase responde 400 a un
 * `sort` sobre una columna que no existe, y sin orden la página vuelve
 * arbitraria. La regla de lista ya limita las filas a las que el usuario creó o
 * juega, así que no hace falta filtrar por usuario.
 */
export function listMyOpenBattles(pb: PB, limit = ACTIVE_BATTLE_SCAN): Promise<RecordModel[]> {
  return pb
    .collection("battles")
    .getList(1, limit, {
      filter: OPEN_BATTLE_STATUSES.map((s) => `status = '${s}'`).join(" || "),
      sort: "-last_activity_at",
      // La back-relation trae el asiento del usuario: el estado de la batalla
      // por sí solo no dice si a ÉL le queda algo que hacer (sigue `live`
      // mientras los rivales entrenan, mucho después de que él terminara).
      expand: "battle_participants_via_battle",
      requestKey: null,
    })
    .then((page) => page.items as RecordModel[])
    .catch(() => [] as RecordModel[]);
}

/**
 * Batallas cerradas del usuario, la última primero (#398).
 *
 * El ranking se lee de `final_standings` en vez de llamar al snapshot por
 * batalla: una batalla cerrada es inmutable y una petición por fila no
 * sobrevive a un historial. `finished_at` solo lo tienen las que llegaron a
 * jugarse; las canceladas y caducadas caen a su última actividad.
 */
export function listMyBattleHistory(pb: PB, limit = 30): Promise<RecordModel[]> {
  return pb
    .collection("battles")
    .getList(1, limit, {
      filter: CLOSED_BATTLE_STATUSES.map((s) => `status = '${s}'`).join(" || "),
      sort: "-finished_at,-last_activity_at",
      requestKey: null,
    })
    .then((page) => page.items as RecordModel[])
    .catch(() => [] as RecordModel[]);
}

// ─── Carreras ───────────────────────────────────────────────────────────────

/**
 * Las carreras del usuario, vía su fila de participante, con la carrera
 * expandida. `race_participants` es legible por cualquier autenticado (la
 * carrera es un evento compartido), pero la fila del usuario es la única que
 * dice en cuáles ha corrido.
 */
export function listMyRaceParticipations(pb: PB, userId: string): Promise<RecordModel[]> {
  return pb
    .collection("race_participants")
    .getFullList<RecordModel>({
      filter: pb.filter("user = {:userId}", { userId }),
      expand: "race",
      requestKey: null,
    })
    .catch(() => [] as RecordModel[]);
}

/**
 * Todos los participantes de una carrera.
 *
 * El RECORRIDO no está aquí y no se puede pedir: vive en `race_routes`,
 * owner-only desde #316, porque esta fila la leen todos los corredores y se
 * difunde entera por realtime. Una tool que quisiera pintar el trazado de otro
 * se llevaría 0 filas, que es exactamente lo que debe pasar.
 */
export function listRaceParticipants(pb: PB, raceId: string): Promise<RecordModel[]> {
  return pb
    .collection("race_participants")
    .getFullList<RecordModel>({
      filter: pb.filter("race = {:raceId}", { raceId }),
      requestKey: null,
    })
    .catch(() => [] as RecordModel[]);
}
