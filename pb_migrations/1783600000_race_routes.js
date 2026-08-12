/// <reference path="../pb_data/types.d.ts" />

/**
 * Saca el recorrido de la carrera de `race_participants` a una colección propia
 * owner-only (#316). Es el mismo agujero que #299 cerró en el cardio, en la
 * colección de al lado, y se cierra de la misma forma.
 *
 * PROBLEMA
 * `race_participants` es legible por cualquier cuenta autenticada (1775200002,
 * con el filtro de bloqueo que le puso 1783400001) porque la carrera en vivo
 * necesita que cada corredor vea la posición y el progreso del resto. Pero una
 * regla de PocketBase filtra REGISTROS, no CAMPOS, y el recorrido completo
 * viajaba dentro de la misma fila que la posición: `gps_track` era un campo
 * `json` corriente, sin ninguna restricción de servidor.
 *
 * Y hay un agravante que no tenía el cardio: la carrera se alimenta por
 * REALTIME (`race_participants.subscribe`, en `src/lib/race/raceRealtime.ts` de
 * cada app). El payload de un evento realtime lleva el registro entero,
 * y `finishParticipant` escribía `gps_track` en el mismo `update` que marca
 * `status: 'finished'`. O sea que ese update DIFUNDÍA POR SSE el recorrido
 * íntegro de quien acababa de terminar a todos los suscriptores de la carrera.
 * Ni siquiera hacía falta llamar a la API a mano: bastaba con estar corriendo.
 * Un recorrido de carrera suele empezar y terminar en el domicilio de quien lo
 * grabó.
 *
 * POR QUÉ UNA COLECCIÓN APARTE Y NO UNA `view` (#386/#410)
 * Porque una `view` de PocketBase NO EMITE EVENTOS REALTIME: no tiene ciclo de
 * vida de registro (no hay create/update/delete sobre ella), así que no hay
 * nada que difundir. Medido contra este mismo PocketBase: suscribiéndose a la
 * tabla base `sessions` y actualizando una fila llegan 2 eventos; suscribiéndose
 * a la view `public_sessions` y haciendo lo mismo llegan 0. Y lo peor es que
 * FALLA EN SILENCIO: el POST de suscripción a la view contesta 204, igual que
 * el de una tabla base. Nada avisa; los eventos simplemente no llegan nunca.
 *
 * Así que aplicar aquí el patrón de #410 —cerrar la tabla base a owner-only y
 * servir la lectura cruzada desde `public_race_participants`— dejaría la
 * carrera en vivo sin actualizaciones en vivo: cada corredor vería a los demás
 * congelados en el instante de la carga inicial, sin ningún error. Es justo la
 * función que hay que preservar.
 *
 * Además la forma del dato pide el patrón de #299, no el de #410: allí había
 * VARIOS campos sensibles mezclados con varios públicos en la misma fila y
 * recortar por SELECT era la herramienta correcta; aquí hay UN solo campo
 * privilegiado, de escritura única (`finishParticipant`) y de lectura
 * exclusiva de su dueño. Es exactamente para lo que se diseñó `cardio_routes`.
 *
 * `hidden: true` tampoco sirve, por lo mismo que en #299: escondería el
 * recorrido también para su dueño, que es justo quien lo necesita para exportar
 * el GPX y para guardar la carrera como sesión de cardio.
 *
 * POR QUÉ NO SE PARTE EN DOS MIGRACIONES
 * La regla de la casa es partirla cuando cerrar la tabla base deja ciega a la
 * app ya instalada de Play. Aquí no se cierra ninguna tabla: se BORRA UN CAMPO.
 * La carrera en vivo no se toca —los participantes se siguen leyendo igual, con
 * los mismos campos y por la misma regla—, así que la app vieja no se queda a
 * oscuras. Lo único que pierde es su PROPIA traza al terminar, porque
 * PocketBase ignora en silencio las claves que no son campos de la colección
 * (verificado en tests/pb_hooks/race_routes.test.mjs): sin error, el botón de
 * exportar GPX no aparece y «guardar como entrenamiento» guarda la sesión sin
 * ruta. Degradado y acotado.
 *
 * Y a favor de dejarla entera está el argumento de #299: PocketBase corre cada
 * migración en transacción, así que crear + backfill + borrar el campo van
 * juntos o no van. Si el backfill se queda corto, el recuento lanza, la
 * transacción revienta y `gps_track` sigue en su sitio con los datos intactos.
 * Partiéndola, el borrado caería en otra transacción y habría una ventana en la
 * que se puede perder una traza de verdad.
 *
 * Ojo JSVM: `record.get()` de un campo json devuelve JSONRaw (bytes crudos en
 * goja), así que se lee con `getString()` + `JSON.parse`.
 *
 * El down es reversible de verdad: reconstruye el campo y devuelve las trazas.
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
  const participants = app.findCollectionByNameOrId("race_participants")

  // Idempotente: si el campo ya no está, la migración ya corrió entera.
  if (!participants.fields.getByName("gps_track")) return

  // ── 1. Colección de recorridos, owner-only ─────────────────────────────
  let routes
  try {
    routes = app.findCollectionByNameOrId("pbc_race_rt01")
  } catch (e) {
    routes = new Collection({
      "id": "pbc_race_rt01",
      "name": "race_routes",
      "type": "base",
      "system": false,
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text_rr_id",
          "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$",
          "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text",
        },
        {
          "cascadeDelete": true, "collectionId": participants.id, "hidden": false,
          "id": "relation_rr_participant", "maxSelect": 1, "minSelect": 0, "name": "participant",
          "presentable": false, "required": true, "system": false, "type": "relation",
        },
        {
          "cascadeDelete": true, "collectionId": "_pb_users_auth_", "hidden": false,
          "id": "relation_rr_user", "maxSelect": 1, "minSelect": 0, "name": "user",
          "presentable": false, "required": true, "system": false, "type": "relation",
        },
        {
          // 2 MB, igual que `cardio_routes.points`: por encima del límite por
          // defecto de PB (1 MB) para que ninguna traza que hoy cabe en
          // `gps_track` se quede fuera al mudarse.
          //
          // Ojo al leerlo: aquí los puntos son `{lat, lng, t}` con `t` relativo
          // al inicio de la carrera, NO los `{lat, lng, timestamp}` absolutos de
          // `cardio_routes`. Se llama igual porque son colecciones hermanas; la
          // conversión de un formato al otro la hace RaceResults al guardar la
          // carrera como sesión de cardio.
          "hidden": false, "id": "json_rr_points", "maxSize": 2000000, "name": "points",
          "presentable": false, "required": false, "system": false, "type": "json",
        },
      ],
      "indexes": [
        "CREATE UNIQUE INDEX idx_race_routes_participant ON race_routes (participant)",
        "CREATE INDEX idx_race_routes_user ON race_routes (user)",
      ],
      // Owner-only en las cinco reglas, mismo patrón que `cardio_routes`
      // (1782500000) y `user_health` (1781700000): create exige que el `user`
      // del body sea el propio y update impide reasignar la fila a otra cuenta.
      "listRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id",
      "createRule": '@request.auth.id != "" && @request.body.user = @request.auth.id',
      "updateRule": 'user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)',
      "deleteRule": "user = @request.auth.id",
    })
    app.save(routes)
    routes = app.findCollectionByNameOrId("pbc_race_rt01")
  }

  // ── 2. Backfill: una fila de recorrido por participación con traza ──────
  let expected = 0
  let moved = 0
  for (let page = 0; ; page++) {
    const batch = app.findRecordsByFilter("race_participants", "id != ''", "id", PAGE, page * PAGE)
    if (!batch.length) break
    for (const p of batch) {
      const track = readJson(p, "gps_track")
      if (!Array.isArray(track) || !track.length) continue
      expected++

      // Reentrante: si ya existe la fila (migración parcial previa), no duplica.
      const already = app.findRecordsByFilter("race_routes", `participant = '${p.id}'`, "", 1, 0)
      if (already.length) { moved++; continue }

      const rec = new Record(routes)
      rec.set("participant", p.id)
      rec.set("user", p.getString("user"))
      rec.set("points", track)
      app.save(rec)
      moved++
    }
    if (batch.length < PAGE) break
  }

  // Cinturón: si falta una sola traza, aborta la transacción entera y el campo
  // `gps_track` sigue en su sitio con los datos intactos.
  if (moved !== expected) {
    throw new Error(
      `race_routes backfill incompleto: ${moved}/${expected} recorridos migrados; no se borra gps_track`
    )
  }

  // ── 3. Ya se puede borrar el campo del registro que todos leen ──────────
  participants.fields.removeByName("gps_track")
  app.save(participants)
}, (app) => {
  const participants = app.findCollectionByNameOrId("race_participants")

  if (!participants.fields.getByName("gps_track")) {
    participants.fields.add(new Field({
      "hidden": false, "id": "json_rp_gps_track", "maxSize": 2000000,
      "name": "gps_track", "presentable": false, "required": false,
      "system": false, "type": "json",
    }))
    app.save(participants)
  }

  // Devuelve las trazas a la participación antes de tirar la colección.
  try {
    for (let page = 0; ; page++) {
      const batch = app.findRecordsByFilter("race_routes", "id != ''", "id", PAGE, page * PAGE)
      if (!batch.length) break
      for (const r of batch) {
        const track = readJson(r, "points")
        if (!Array.isArray(track) || !track.length) continue
        try {
          const p = app.findRecordById("race_participants", r.getString("participant"))
          p.set("gps_track", track)
          app.save(p)
        } catch (e) { /* participación ya borrada */ }
      }
      if (batch.length < PAGE) break
    }

    app.delete(app.findCollectionByNameOrId("pbc_race_rt01"))
  } catch (e) { /* colección ya borrada */ }
})
