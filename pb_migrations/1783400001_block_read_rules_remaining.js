/// <reference path="../pb_data/types.d.ts" />

/**
 * Cierra los huecos restantes del enforcement de bloqueo en lectura (#386).
 *
 * Auditamos TODAS las colecciones con lectura entre usuarios y comparamos con
 * las nueve que cubrió `1778000002_block_read_rules.js`. Además de `settings` y
 * `sets_log` (migración anterior), quedaban tres colecciones con datos de
 * usuario legibles por cualquier autenticado y sin filtro de bloqueo:
 *
 *  - `race_participants`: la más grave. Guarda `last_lat`, `last_lng` y
 *    `gps_track` — posición en vivo y traza completa del recorrido — además de
 *    distancia, ritmo y estado. Con la regla anterior (`@request.auth.id != ""`)
 *    una persona a la que has bloqueado podía leer tu ubicación en tiempo real.
 *  - `races`: expone `origin_lat`/`origin_lng` y `route_points`, es decir dónde
 *    entrena quien la crea. La regla anterior era
 *    `is_public = true || @request.auth.id != ""`; se conserva la carrera
 *    pública para invitados (la landing y las OG tags dependen de ello) pero se
 *    excluye al bloqueado en la rama autenticada.
 *  - `user_programs`: qué programa sigue cada usuario y desde cuándo.
 *
 * Colecciones revisadas y descartadas por no llevar datos de usuario (son
 * catálogo compartido): `achievements`, `exercise_progressions`, `foods`,
 * `food_categories`, `food_tags`, `exercises_catalog`, `programs`,
 * `program_phases`, `program_exercises`, `program_day_config`, `blog_posts`.
 *
 * `users` se trata aparte en la migración siguiente: es la colección auth y su
 * regla afecta a los `expand`, así que necesita su propio razonamiento.
 *
 * Multi-relación con != = all-match ("no contiene"); lista vacía pasa, así que
 * quien no tiene bloqueos no nota ningún cambio.
 *
 * Solo se tocan reglas: no se modifica ningún campo, se preservan los field.id.
 */
const TARGETS = [
  // [colección, campo dueño, regla previa para el down]
  ["race_participants", "user", '@request.auth.id != ""'],
  ["user_programs", "user", '@request.auth.id != ""'],
]

function blockClause(owner) {
  return owner + '.blocked_users.id != @request.auth.id && ' +
    '@request.auth.blocked_users.id != ' + owner + '.id'
}

migrate((app) => {
  for (const [name, owner] of TARGETS) {
    const collection = app.findCollectionByNameOrId(name)
    const rule = '@request.auth.id != "" && ' + blockClause(owner)
    collection.listRule = rule
    collection.viewRule = rule
    app.save(collection)
  }

  // `races` conserva la lectura pública de carreras públicas (invitados y OG
  // tags), pero un usuario autenticado y bloqueado por el creador ya no la ve.
  const races = app.findCollectionByNameOrId("races")
  const racesRule = 'is_public = true || (@request.auth.id != "" && ' +
    blockClause("creator") + ')'
  races.listRule = racesRule
  races.viewRule = racesRule
  app.save(races)
}, (app) => {
  for (const [name, , prevRule] of TARGETS) {
    try {
      const collection = app.findCollectionByNameOrId(name)
      collection.listRule = prevRule
      collection.viewRule = prevRule
      app.save(collection)
    } catch (e) {}
  }

  try {
    const races = app.findCollectionByNameOrId("races")
    races.listRule = 'is_public = true || @request.auth.id != ""'
    races.viewRule = 'is_public = true || @request.auth.id != ""'
    app.save(races)
  } catch (e) {}
})
