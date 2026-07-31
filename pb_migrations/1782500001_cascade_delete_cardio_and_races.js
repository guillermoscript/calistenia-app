/// <reference path="../pb_data/types.d.ts" />

/**
 * `cascadeDelete: true` en la relación `user` de `cardio_sessions` y
 * `race_participants` (#299).
 *
 * Ambas colecciones se crearon sin la bandera (1774000029:12, 1775200002:15),
 * así que las sesiones de cardio —con su ruta— y las participaciones en
 * carreras SOBREVIVÍAN al borrado de la cuenta y había que barrerlas a mano.
 * El resto de colecciones de usuario sí cascadean: `body_photos`
 * (1774000008:26), `weight_entries` (1774000007:26), `sessions` (1773243396:26).
 *
 * `cardio_routes` (1782500000) ya nace cascadeando por partida doble: por
 * `user` y por `session`.
 *
 * OJO (ver el incidente de 1774378015): al reescribir un campo hay que
 * conservar su `id`. Con el mismo id, `fields.add()` lo REEMPLAZA en su sitio
 * y PocketBase lo trata como el mismo campo — solo cambia la bandera. Con un
 * id nuevo lo vería como «borrar columna + crear columna» y se perdería la
 * relación de cada registro con su dueño.
 */

const TARGETS = ["cardio_sessions", "race_participants"]

/** Reescribe la relación `user` de `name` con cascadeDelete = `flag`. */
function setUserCascade(app, name, flag) {
  const collection = app.findCollectionByNameOrId(name)
  const field = collection.fields.getByName("user")
  if (!field || field.cascadeDelete === flag) return

  collection.fields.add(new Field({
    "id": field.id, // ← imprescindible: mismo id = mismo campo, no recreación
    "name": "user",
    "type": "relation",
    "collectionId": "_pb_users_auth_",
    "cascadeDelete": flag,
    "maxSelect": 1,
    "minSelect": 0,
    "required": true,
    "hidden": false,
    "presentable": false,
    "system": false,
  }))
  app.save(collection)
}

migrate((app) => {
  for (const name of TARGETS) setUserCascade(app, name, true)
}, (app) => {
  for (const name of TARGETS) {
    try { setUserCascade(app, name, false) } catch (e) { /* colección ya borrada */ }
  }
})
