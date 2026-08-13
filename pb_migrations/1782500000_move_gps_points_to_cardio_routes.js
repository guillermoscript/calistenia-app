/// <reference path="../pb_data/types.d.ts" />

/**
 * Saca la ruta GPS de `cardio_sessions` a una colección propia owner-only (#299).
 *
 * `cardio_sessions` es legible por cualquier cuenta autenticada desde
 * 1776700001 (lo necesitan el muro de actividad y las carreras) con el filtro
 * de bloqueo de 1778000002. El comentario de 1776700001:5-6 afirmaba que la
 * ruta «nunca se expone» porque las consultas de la app excluyen el campo,
 * pero eso es convención del cliente, no regla de servidor: una regla de PB
 * filtra registros, no campos, así que cualquier cuenta que llamase a la API
 * directamente recibía `gps_points` entero. Una ruta de carrera suele empezar
 * y terminar en el domicilio de quien la grabó.
 *
 * `hidden: true` no sirve: escondería la ruta también para su dueño, que es
 * justo quien necesita dibujar su mapa. De las tres salidas que plantea #299
 * se toma la (1): colección aparte `cardio_routes`, owner-only, que el detalle
 * y el historial propios leen en una segunda consulta. El muro no se toca.
 *
 * Todo va en UNA migración a propósito (crear + backfill + drop): PocketBase
 * las corre en transacción, así que un backfill incompleto aborta el borrado
 * del campo en vez de dejar las rutas a medio mover. Por eso el recuento
 * final lanza en vez de avisar.
 *
 * Ojo JSVM: `record.get()` de un campo json devuelve JSONRaw (bytes crudos en
 * goja), así que se lee con `getString()` + `JSON.parse`.
 *
 * El down es reversible de verdad: reconstruye el campo y devuelve los puntos.
 */

const PAGE = 200

/** Lee un campo json de un Record como valor JS (ver gotcha JSVM arriba). */
function readJson(rec, name) {
  try {
    return JSON.parse(rec.getString(name) || "null")
  } catch (e) {
    return null
  }
}

migrate((app) => {
  const sessions = app.findCollectionByNameOrId("cardio_sessions")

  // Idempotente: si el campo ya no está, la migración ya corrió entera.
  if (!sessions.fields.getByName("gps_points")) return

  // ── 1. Colección de rutas, owner-only ──────────────────────────────────
  let routes
  try {
    routes = app.findCollectionByNameOrId("pbc_cardio_rt01")
  } catch (e) {
    routes = new Collection({
      "id": "pbc_cardio_rt01",
      "name": "cardio_routes",
      "type": "base",
      "system": false,
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text_cr_id",
          "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$",
          "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text",
        },
        {
          "cascadeDelete": true, "collectionId": sessions.id, "hidden": false, "id": "relation_cr_session",
          "maxSelect": 1, "minSelect": 0, "name": "session", "presentable": false,
          "required": true, "system": false, "type": "relation",
        },
        {
          "cascadeDelete": true, "collectionId": "_pb_users_auth_", "hidden": false, "id": "relation_cr_user",
          "maxSelect": 1, "minSelect": 0, "name": "user", "presentable": false,
          "required": true, "system": false, "type": "relation",
        },
        {
          // 2 MB: por encima del límite por defecto de PB (1 MB) para que
          // ninguna ruta que hoy cabe en `gps_points` se quede fuera.
          "hidden": false, "id": "json_cr_points", "maxSize": 2000000, "name": "points",
          "presentable": false, "required": false, "system": false, "type": "json",
        },
      ],
      "indexes": [
        "CREATE UNIQUE INDEX idx_cardio_routes_session ON cardio_routes (session)",
        "CREATE INDEX idx_cardio_routes_user ON cardio_routes (user)",
      ],
      // Owner-only en las cinco reglas. Mismo patrón que user_health
      // (1781700000): create exige que el `user` del body sea el propio y
      // update impide reasignar la fila a otra cuenta.
      "listRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id",
      "createRule": '@request.auth.id != "" && @request.body.user = @request.auth.id',
      "updateRule": 'user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)',
      "deleteRule": "user = @request.auth.id",
    })
    app.save(routes)
    routes = app.findCollectionByNameOrId("pbc_cardio_rt01")
  }

  // ── 2. Backfill: una fila de ruta por sesión con puntos ─────────────────
  let expected = 0
  let moved = 0
  for (let page = 0; ; page++) {
    const batch = app.findRecordsByFilter("cardio_sessions", "id != ''", "id", PAGE, page * PAGE)
    if (!batch.length) break
    for (const s of batch) {
      const points = readJson(s, "gps_points")
      if (!Array.isArray(points) || !points.length) continue
      expected++

      // Reentrante: si ya existe la fila (migración parcial previa), no duplica.
      const already = app.findRecordsByFilter("cardio_routes", `session = '${s.id}'`, "", 1, 0)
      if (already.length) { moved++; continue }

      const rec = new Record(routes)
      rec.set("session", s.id)
      rec.set("user", s.getString("user"))
      rec.set("points", points)
      app.save(rec)
      moved++
    }
    if (batch.length < PAGE) break
  }

  // Cinturón: si falta una sola ruta, aborta la transacción entera y el campo
  // `gps_points` sigue en su sitio con los datos intactos.
  if (moved !== expected) {
    throw new Error(
      `cardio_routes backfill incompleto: ${moved}/${expected} rutas migradas; no se borra gps_points`
    )
  }

  // ── 3. Ya se puede borrar el campo del registro público ─────────────────
  sessions.fields.removeByName("gps_points")
  app.save(sessions)
}, (app) => {
  const sessions = app.findCollectionByNameOrId("cardio_sessions")

  if (!sessions.fields.getByName("gps_points")) {
    sessions.fields.add(new Field({
      "hidden": false, "id": "json_cs_gps_points", "maxSize": 2000000,
      "name": "gps_points", "presentable": false, "required": false,
      "system": false, "type": "json",
    }))
    app.save(sessions)
  }

  // Devuelve los puntos al registro de la sesión antes de tirar la colección.
  try {
    for (let page = 0; ; page++) {
      const batch = app.findRecordsByFilter("cardio_routes", "id != ''", "id", PAGE, page * PAGE)
      if (!batch.length) break
      for (const r of batch) {
        const points = readJson(r, "points")
        if (!Array.isArray(points) || !points.length) continue
        try {
          const s = app.findRecordById("cardio_sessions", r.getString("session"))
          s.set("gps_points", points)
          app.save(s)
        } catch (e) { /* sesión ya borrada */ }
      }
      if (batch.length < PAGE) break
    }

    app.delete(app.findCollectionByNameOrId("pbc_cardio_rt01"))
  } catch (e) { /* colección ya borrada */ }
})
