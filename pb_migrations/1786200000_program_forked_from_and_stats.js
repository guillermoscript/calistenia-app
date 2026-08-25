/// <reference path="../pb_data/types.d.ts" />

/**
 * #620 — remix con crédito y contador de seguidores.
 *
 * DOS COSAS, y son independientes:
 *
 * 1. `programs.forked_from` — de qué programa salió esta copia.
 *
 *    `duplicateProgram` (packages/core/hooks/usePrograms.ts) escribía la copia
 *    con `created_by: userId` y ni un rastro del original. El vínculo no se
 *    perdía después: no se guardaba nunca. `exercises_catalog` ya tenía el
 *    patrón (`promoted_from` / `variant_of`); `programs` se quedó sin él.
 *
 *    VA SIN CASCADE A PROPÓSITO. Las tres hijas de `programs`
 *    (`program_phases`, `program_exercises`, `program_day_config`) sí declaran
 *    `cascadeDelete: true`, porque sin su programa no significan nada. Una copia
 *    es lo contrario: es un programa entero, con su autor y su gente inscrita, y
 *    que el original desaparezca no puede llevársela por delante. PocketBase
 *    vacía las relaciones NO cascade del registro borrado, y como el campo es
 *    opcional eso sale limpio: la copia sobrevive y sencillamente deja de
 *    acreditar a nadie. La UI ya distingue ese caso — sin `forked_from` no pinta
 *    la línea de crédito.
 *
 *    No hay backfill posible. Quién copió a qué no se guardó nunca, así que no
 *    está en ninguna parte de donde sacarlo; el crédito existe de aquí en
 *    adelante y los duplicados viejos se quedan sin él.
 *
 * 2. `view_program_stats` — cuánta gente sigue cada programa.
 *
 *    Los datos ya estaban en `user_programs` y en `sessions`, pero agregarlos
 *    desde el cliente costaría una consulta por programa del catálogo. Una view
 *    los cuenta en el servidor y el catálogo entero se resuelve en una petición.
 *
 * POR QUÉ LA VIEW LLEVA `visibility` Y `created_by`
 * ------------------------------------------------
 * No los pinta nadie: están para poder ESCRIBIR la regla de lectura. Una view de
 * PocketBase solo puede filtrarse por sus propias columnas, así que sin ellas la
 * única regla posible sería `@request.auth.id != ""` y estaríamos publicando el
 * número de inscritos de los programas privados de cualquiera. Con ellas la
 * regla replica exactamente el alcance que #603 le dio a `programs`: lo público,
 * más lo tuyo.
 *
 * Y OJO CON EL MODO DE FALLO: si esta regla estuviera mal escrita, PocketBase no
 * devolvería 403, devolvería 0 filas. El síntoma sería «no hay seguidores», que
 * se parece demasiado a un dato de verdad. Por eso
 * tests/pb_hooks/program_stats_view.test.mjs afirma los casos POSITIVOS (el
 * público, el propio privado) y no solo el negativo.
 *
 * SOBRE EL `status` VACÍO
 * -----------------------
 * `user_programs.status` se añadió en 1774378016, después de la colección, y es
 * opcional: las filas anteriores lo tienen vacío. Contarlas como abandonadas
 * borraría de un plumazo a los primeros inscritos de cada programa, así que
 * `COALESCE(status, '') = ''` cuenta como `active`, que es lo que esas filas
 * significaban cuando se escribieron (`is_current` era la única señal).
 *
 * `athletes_count` sale de `sessions`, no de `user_programs`: son dos preguntas
 * distintas. Una es «cuánta gente se apuntó», la otra «cuánta ha entrenado de
 * verdad». La UI enseña la primera, pero la segunda es la interesante para
 * ordenar el catálogo y no cuesta nada calcularla aquí.
 */

const PROGRAMS_COLLECTION_ID = "pbc_2970041692"

const STATS_VIEW_NAME = "view_program_stats"

/**
 * Una fila por programa. Las subconsultas van correlacionadas en vez de con
 * `LEFT JOIN … GROUP BY` porque los conteos salen de DOS tablas distintas
 * (`user_programs` y `sessions`): un join de las dos multiplicaría las filas
 * entre sí y los dos conteos saldrían inflados el uno por el otro.
 *
 * `id` tiene que ser único y es el del propio programa, que es justo lo que
 * queremos: así el cliente pide `view_program_stats` filtrando por los mismos
 * ids que ya tiene del catálogo.
 */
const STATS_VIEW_QUERY = [
  "SELECT",
  "  p.id AS id,",
  "  p.created_by AS created_by,",
  "  p.visibility AS visibility,",
  "  (SELECT COUNT(*) FROM user_programs up",
  "    WHERE up.program = p.id",
  "      AND COALESCE(up.status, '') IN ('', 'active')) AS active_count,",
  "  (SELECT COUNT(*) FROM user_programs up",
  "    WHERE up.program = p.id",
  "      AND up.status = 'completed') AS completed_count,",
  "  (SELECT COUNT(*) FROM user_programs up",
  "    WHERE up.program = p.id",
  "      AND COALESCE(up.status, '') IN ('', 'active', 'completed')) AS followers_count,",
  "  (SELECT COUNT(DISTINCT s.user) FROM sessions s",
  "    WHERE s.program = p.id) AS athletes_count",
  "FROM programs p",
].join("\n")

/**
 * El mismo alcance de lectura que `programs` desde #603 (1785000000): lo
 * público lo ve cualquier autenticado, lo privado solo su autor. admin y editor
 * mantienen la visión completa, igual que allí, para poder curar el catálogo.
 *
 * Va literal dentro del callback y no como constante de módulo: el JSVM de
 * PocketBase no garantiza que el scope del fichero llegue al callback, y una
 * constante que saliera `undefined` aquí dejaría la view abierta o cerrada del
 * todo sin decir nada (ver la cabecera de 1784700000).
 */
migrate((app) => {
  // ── 1. programs.forked_from ───────────────────────────────────────────────
  const programs = app.findCollectionByNameOrId(PROGRAMS_COLLECTION_ID)

  if (!programs.fields.find(f => f.name === "forked_from")) {
    programs.fields.add(new Field({
      "cascadeDelete": false,
      "collectionId": PROGRAMS_COLLECTION_ID,
      "hidden": false,
      "id": "relation_program_forked_from",
      "maxSelect": 1,
      "minSelect": 0,
      "name": "forked_from",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "relation"
    }))
    app.save(programs)
  }

  // ── 2. view_program_stats ─────────────────────────────────────────────────
  const readRule = '@request.auth.id != "" && (' +
    'visibility = "public" || ' +
    'created_by = @request.auth.id || ' +
    '@request.auth.role = "admin" || ' +
    '@request.auth.role = "editor")'

  let stats
  try {
    stats = app.findCollectionByNameOrId(STATS_VIEW_NAME)
  } catch (e) {
    stats = null
  }

  if (stats) {
    // Reaplicar la migración sobre un servidor que ya la tiene (`pocketbase
    // serve` las repasa al arrancar) no puede fallar ni dejar la view a medias.
    stats.viewQuery = STATS_VIEW_QUERY
    stats.listRule = readRule
    stats.viewRule = readRule
    app.save(stats)
    return
  }

  app.save(new Collection({
    type: "view",
    name: STATS_VIEW_NAME,
    viewQuery: STATS_VIEW_QUERY,
    listRule: readRule,
    viewRule: readRule,
  }))
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId(STATS_VIEW_NAME))
  } catch (e) { /* no llegó a crearse */ }

  try {
    const programs = app.findCollectionByNameOrId(PROGRAMS_COLLECTION_ID)
    programs.fields.removeById("relation_program_forked_from")
    app.save(programs)
  } catch (e) { /* no llegó a añadirse */ }
})
