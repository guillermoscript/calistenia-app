/// <reference path="../pb_data/types.d.ts" />

/**
 * Fuentes de actividad del muro: retos, circuitos y batallas.
 *
 * Hasta ahora `useActivityFeed` solo unía `public_sessions` y
 * `public_cardio_sessions`. El resto de lo que hace un usuario —apuntarse a un
 * reto, cerrar un circuito, ganar una batalla— no aparecía en ningún sitio
 * social. Esta migración abre EXACTAMENTE los datos que el muro necesita para
 * pintarlo, siguiendo el reparto de #386: nada se lee de la tabla base, todo
 * pasa por una `view` que enumera sus columnas a propósito.
 *
 * Tres cambios, todos aditivos:
 *
 * 1. `challenge_participants.created` (autodate).
 *    La colección NO tenía ningún timestamp — ni `created`. Sin él es
 *    literalmente imposible ordenar "se unió a un reto" dentro de un feed
 *    cronológico. Las filas anteriores se quedan con la cadena vacía que
 *    PocketBase pone al añadir la columna; el feed las filtra (`created != ''`)
 *    en vez de colocarlas en 1970.
 *
 * 2. `public_circuit_sessions` gana las columnas que pinta la tarjeta.
 *    La view se creó en #386 con `id, user, started_at, finished_at` porque su
 *    único consumidor era un CONTEO del leaderboard. Para enseñar el circuito en
 *    el muro hacen falta nombre, rondas y duración. Se dejan FUERA a propósito
 *    `exercises` y `config` (la composición del circuito es del dueño) y
 *    `hr_avg` / `hr_max` / `calories_actual` (datos de salud del reloj, que es
 *    justo lo que #386 vino a tapar).
 *
 * 3. `public_battle_finishes`: batallas cerradas, ya unidas a su participante.
 *    `battles` y `battle_participants` son ilegibles para quien no jugó
 *    (listRule = creador o participante), así que un seguidor no puede ver el
 *    resultado. En vez de relajar esas reglas —que también protegen el marcador
 *    EN VIVO— la view hace el JOIN y filtra `status = 'finished'`: solo se
 *    publica el resultado de una batalla que ya terminó, nunca una en curso.
 *    Se hace en una sola view en lugar de dos porque una `view` de PocketBase no
 *    puede re-apuntar su columna de relación: expandir `battle` desde la view
 *    aplicaría la regla de la tabla base y volvería a devolver vacío.
 *
 * Lo que NO cambia: ninguna escritura, ninguna regla existente y qué FILAS ve
 * cada uno (misma cláusula de bloqueo del repo).
 */

/** Cláusula de bloqueo estándar del repo (ver 1778000002). `owner` = campo dueño. */
function blockRule(owner) {
  return '@request.auth.id != "" && ' +
    owner + '.blocked_users.id != @request.auth.id && ' +
    '@request.auth.blocked_users.id != ' + owner + '.id'
}

const CIRCUIT_VIEW_QUERY =
  "SELECT id, user, started_at, finished_at, circuit_name, mode, " +
  "rounds_completed, rounds_target, duration_seconds, note, program, program_day_key " +
  "FROM circuit_sessions"

/** La view previa de #386, para poder revertir sin adivinar. */
const CIRCUIT_VIEW_QUERY_OLD =
  "SELECT id, user, started_at, finished_at FROM circuit_sessions"

/**
 * Una fila por participante de una batalla YA CERRADA, con el resumen de la
 * batalla pegado. `final_standings` es el resultado congelado (rank + user por
 * asiento) que ya pinta la pantalla de resultados; `config` trae el
 * `workout_template_id` con el que el cliente resuelve el nombre del preset.
 *
 * Fuera: `progress` (el marcador vivo del participante), `revision`,
 * `invite_*` y `last_activity_at`.
 */
const BATTLE_VIEW_QUERY =
  "SELECT bp.id AS id, bp.user AS user, bp.battle AS battle, " +
  "bp.status AS participant_status, bp.joined_at AS joined_at, " +
  "bp.finished_at AS finished_at, " +
  "b.status AS battle_status, b.starts_at AS battle_starts_at, " +
  "b.finished_at AS battle_finished_at, b.config AS battle_config, " +
  "b.final_standings AS battle_standings " +
  "FROM battle_participants bp " +
  "JOIN battles b ON b.id = bp.battle " +
  "WHERE b.status = 'finished'"

migrate((app) => {
  // ── 1. challenge_participants.created ──────────────────────────────────────
  const participants = app.findCollectionByNameOrId("challenge_participants")
  const hasCreated = (participants.fields || []).some(f => f.name === "created")
  if (!hasCreated) {
    participants.fields.push(new Field({
      "hidden": false,
      "id": "autodate_cp_created",
      "name": "created",
      "onCreate": true,
      "onUpdate": false,
      "presentable": false,
      "system": false,
      "type": "autodate"
    }))
    app.save(participants)
  }

  // ── 2. public_circuit_sessions ampliada ────────────────────────────────────
  const circuits = app.findCollectionByNameOrId("public_circuit_sessions")
  circuits.viewQuery = CIRCUIT_VIEW_QUERY
  app.save(circuits)

  // ── 3. public_battle_finishes ──────────────────────────────────────────────
  let battles
  try {
    battles = app.findCollectionByNameOrId("public_battle_finishes")
  } catch (e) {
    battles = null
  }
  if (battles) {
    battles.viewQuery = BATTLE_VIEW_QUERY
    battles.listRule = blockRule("user")
    battles.viewRule = blockRule("user")
    app.save(battles)
  } else {
    app.save(new Collection({
      "type": "view",
      "name": "public_battle_finishes",
      "viewQuery": BATTLE_VIEW_QUERY,
      "listRule": blockRule("user"),
      "viewRule": blockRule("user")
    }))
  }
}, (app) => {
  try {
    const participants = app.findCollectionByNameOrId("challenge_participants")
    participants.fields = participants.fields.filter(f => f.id !== "autodate_cp_created")
    app.save(participants)
  } catch (e) { /* no llegó a aplicarse */ }

  try {
    const circuits = app.findCollectionByNameOrId("public_circuit_sessions")
    circuits.viewQuery = CIRCUIT_VIEW_QUERY_OLD
    app.save(circuits)
  } catch (e) { /* idem */ }

  try {
    app.delete(app.findCollectionByNameOrId("public_battle_finishes"))
  } catch (e) { /* no llegó a crearse */ }
})
