/// <reference path="../pb_data/types.d.ts" />

/**
 * Solicitudes de seguimiento para cuentas privadas (#422).
 *
 * `1784100000_private_accounts.js` añade `users.is_private` y `follows.status`.
 * Este fichero es el que decide el `status`, y el único sitio desde el que una
 * solicitud puede pasar a `accepted` (`follows.updateRule` es `null`, así que
 * ningún cliente puede tocarlo por su cuenta).
 *
 * POR QUÉ EL SERVIDOR FIJA EL STATUS Y NO EL CLIENTE
 * `follows.createRule` solo exigía `follower = @request.auth.id`. Un `status`
 * que llegara del cuerpo lo elige el atacante: POSTear la fila ya `accepted`
 * salta la aprobación en UNA petición. Verificado contra una copia de
 * `pb_data` antes de escribir esto. Aquí se ignora lo que venga en el cuerpo y
 * se recalcula desde la privacidad del destino.
 *
 * La `createRule` de la migración es la segunda barrera, no la primera: rechaza
 * un `accepted` forjado contra una cuenta privada aunque este hook se cayera.
 * Acepta el `status` ausente a propósito, porque `useFollows.ts:107` —la app ya
 * publicada en Play— crea follows sin ese campo y este hook los normaliza.
 *
 * REGLAS DEL JSVM que este fichero obedece (ver tests/pb_hooks/README.md):
 *   - Cada callback corre en un runtime AISLADO: no ve nada del scope de este
 *     fichero, así que cada handler hace sus propios `require`.
 *   - `record.getId()` no existe; se usa `getString("id")`.
 *   - Los hooks son una CADENA: el que no llama a `e.next()` mata en silencio a
 *     los de OTROS ficheros (#412). Aquí `e.next()` va SIEMPRE.
 */

console.log("[follow_requests] hook file loaded")

// ── Normalización del status en la creación ──────────────────────────────────

/**
 * `onRecordCreate` y no `onRecordCreateRequest`: cierra también las creaciones
 * que no vengan de la API. El `status` del cuerpo se descarta siempre.
 *
 * Seguir a una cuenta pública sigue siendo instantáneo, exactamente como antes
 * de #422. Solo las privadas generan una solicitud.
 */
onRecordCreate(function (e) {
  var followingId = e.record.getString("following")
  var isPrivate = false

  if (followingId) {
    try {
      var target = e.app.findRecordById("users", followingId)
      isPrivate = target.getBool("is_private")
    } catch (err) {
      // Destino ilegible o inexistente: se cierra en fallo y queda pendiente.
      // La relación es `required`, así que un destino que no existe lo rechaza
      // PocketBase justo después.
      console.log("[follow_requests] no se pudo leer el destino:", err)
      isPrivate = true
    }
  }

  e.record.set("status", isPrivate ? "pending" : "accepted")
  e.next()
}, "follows")

// ── POST /api/follows/{id}/accept ────────────────────────────────────────────

/**
 * Acepta una solicitud. Solo la persona seguida (`following`) puede hacerlo.
 *
 * Idempotente: aceptar algo ya aceptado devuelve 200 sin escribir ni volver a
 * notificar. La bandeja se puede pulsar dos veces sin duplicar el aviso.
 */
routerAdd("POST", "/api/follows/{id}/accept", function (e) {
  var helpers = require(`${__hooks}/utils/notifications.js`)
  var blocks = require(`${__hooks}/utils/blocks.js`)

  var auth = e.auth
  var userId = auth ? auth.getString("id") : ""
  if (!userId) return e.json(401, { error: "unauthorized" })

  var record
  try {
    record = $app.findRecordById("follows", e.request.pathValue("id"))
  } catch (err) {
    return e.json(404, { error: "not_found" })
  }

  // Misma forma que "no existe": quien no es el destinatario no debe poder
  // averiguar qué ids de solicitud existen.
  if (record.getString("following") !== userId) {
    return e.json(404, { error: "not_found" })
  }

  var followerId = record.getString("follower")

  if (blocks.isBlocked($app, userId, followerId)) {
    return e.json(403, { error: "blocked" })
  }

  if (record.getString("status") === "accepted") {
    return e.json(200, { status: "accepted", already: true })
  }

  record.set("status", "accepted")
  $app.save(record)

  // El solicitante no tiene forma de enterarse por su cuenta: la fila le
  // cambia por debajo y no hay realtime suscrito a esto.
  try {
    var name = helpers.getUserName(userId)
    helpers.createNotification(
      followerId,
      "follow_accepted",
      userId,
      userId,
      "user",
      { followingName: name }
    )
    helpers.sendPush(
      followerId,
      (name || "Alguien") + " ha aceptado tu solicitud",
      "Ya puedes ver su actividad",
      "/u/" + userId,
      "follow_accepted",
      userId
    )
  } catch (err) {
    // Un fallo de notificación no debe deshacer una aceptación ya guardada.
    console.log("[follow_requests] notificación de aceptación falló:", err)
  }

  return e.json(200, { status: "accepted" })
}, $apis.requireAuth())

// ── POST /api/follows/{id}/reject ────────────────────────────────────────────

/**
 * Rechaza una solicitud BORRANDO la fila, en vez de dejarla en un estado
 * `rejected`. Dos motivos:
 *   - el índice único `(follower, following)` haría que un `rejected`
 *     persistente impidiera volver a solicitar nunca más;
 *   - un estado `rejected` guardado es una lista de "gente a la que dijiste que
 *     no", que no queremos almacenar.
 *
 * Rechazar no notifica a nadie, a propósito: es la norma en Instagram y en
 * Strava, y avisar convierte un "no" silencioso en una confrontación.
 */
routerAdd("POST", "/api/follows/{id}/reject", function (e) {
  var auth = e.auth
  var userId = auth ? auth.getString("id") : ""
  if (!userId) return e.json(401, { error: "unauthorized" })

  var record
  try {
    record = $app.findRecordById("follows", e.request.pathValue("id"))
  } catch (err) {
    return e.json(404, { error: "not_found" })
  }

  if (record.getString("following") !== userId) {
    return e.json(404, { error: "not_found" })
  }

  $app.delete(record)
  return e.json(200, { status: "rejected" })
}, $apis.requireAuth())
