/// <reference path="../pb_data/types.d.ts" />

/**
 * #386 — segunda mitad: cerrar a owner-only las tablas base cuya lectura cruzada
 * ya se sirve desde las views `public_*` de 1783500000_public_read_views.js.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANTES DE DESPLEGAR ESTO, LEE ESTO
 *
 * Esta migración es la que REALMENTE cierra la lectura, y por eso es la que
 * puede romper clientes. El despliegue de web y el de PocketBase van juntos
 * (misma imagen), así que la web nunca se queda descolgada. La app MÓVIL sí:
 * la que hay instalada en los teléfonos sigue leyendo `sessions`,
 * `cardio_sessions`, `settings` y `user_stats` directamente.
 *
 * Con esta migración aplicada y una versión antigua de la app, el usuario ve
 * —sin ningún error, porque todas esas lecturas llevan `.catch`— el muro solo
 * con su propia actividad, el ranking solo consigo mismo, los perfiles ajenos a
 * cero y el detalle de un cardio ajeno en blanco.
 *
 * Por eso va en un fichero aparte: para poder mezclar la primera mitad cuando
 * se quiera y dejar esta parada hasta que la versión de la app que lee de las
 * views esté publicada y suficientemente extendida. Si hay que aplazarla, basta
 * con no mezclar este fichero; el otro es inofensivo por sí solo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const OWNER_ONLY = [
  "sessions",
  "cardio_sessions",
  "circuit_sessions",
  "sets_log",
  "settings",
  "user_stats",
]

const OWNER_RULE = "user = @request.auth.id"

/** Regla que tenían antes (1778000002 / 1783400000), para el rollback. */
function blockRule(owner) {
  return '@request.auth.id != "" && ' +
    owner + '.blocked_users.id != @request.auth.id && ' +
    '@request.auth.blocked_users.id != ' + owner + '.id'
}

migrate((app) => {
  // Si las views no existen, algo salió mal con la migración anterior: abortar
  // antes de cerrar nada, o la app se queda sin ninguna vía de lectura.
  for (const name of ["public_sessions", "public_cardio_sessions", "public_circuit_sessions",
                      "public_sets_log", "public_prs", "public_user_stats"]) {
    app.findCollectionByNameOrId(name)
  }

  for (const name of OWNER_ONLY) {
    const collection = app.findCollectionByNameOrId(name)
    collection.listRule = OWNER_RULE
    collection.viewRule = OWNER_RULE
    app.save(collection)
  }
}, (app) => {
  for (const name of OWNER_ONLY) {
    try {
      const collection = app.findCollectionByNameOrId(name)
      collection.listRule = blockRule("user")
      collection.viewRule = blockRule("user")
      app.save(collection)
    } catch (e) { /* colección ausente en un rollback parcial */ }
  }
})
