/// <reference path="../../pb_data/types.d.ts" />

/**
 * Helpers compartidos para los hooks de notificaciones.
 *
 * IMPORTANTE (gotcha de PocketBase/goja): cada handler de hook
 * (onRecordAfterCreateSuccess, etc.) se ejecuta en un runtime JSVM AISLADO y
 * NO tiene acceso a las funciones/variables top-level declaradas en el .pb.js.
 * Por eso, antes vivían en notification_service.pb.js como funciones globales y
 * lanzaban "ReferenceError: getUserName/checkReferralBonus is not defined" dentro
 * de cada handler — atrapado por try/catch (→ create devolvía 200 pero ninguna
 * notificación se enviaba) o, sin try/catch, propagado → la API devolvía 400.
 *
 * Solución: viven aquí y cada handler hace
 *   const helpers = require(`${__hooks}/utils/notifications.js`)
 * Los globals de PocketBase ($app, $http, $os, Record) sí están disponibles
 * dentro del runtime del handler, así que estos helpers funcionan al requerirse.
 *
 * PREFERENCIAS (notification_prefs): modelo OPT-OUT. Sin registro → todo activo.
 * Una notificación solo se suprime si el booleano de su categoría es
 * explícitamente false. `push_enabled` es el master de push. Ver prefAllows().
 */

/**
 * Nombre PÚBLICO de un usuario: el que puede acabar en la pantalla de otro.
 *
 * NO cae al local-part del email (#458). Ese fallback filtraba parte de una
 * dirección privada —`juan.perez` de `juan.perez@gmail.com`— a cualquiera que
 * recibiera un aviso suyo, y el email no está ni en la lista blanca pública de
 * #411. Sin nombre devuelve "" y decide quien llama: los avisos ya usan
 * `|| "Alguien"` / `|| "Tu amigo"`.
 */
function getUserName(userId) {
  try {
    var user = $app.findRecordById("users", userId)
    return user.getString("display_name") || user.getString("name") || ""
  } catch (e) {
    return ""
  }
}

/**
 * Nombres públicos de un conjunto de usuarios en LOTE: una query por cada 50 ids
 * en vez de un `findRecordById` por cabeza (#481). Devuelve un mapa
 * `{ userId: nombre }` con TODAS las claves pedidas presentes ("" si el usuario
 * no existe o no tiene nombre).
 *
 * Esta es la resolución ÚNICA de display name del backend — `utils/battles/`
 * también la usa (la auditoría 2026-08-15 encontró dos implementaciones
 * divergentes). Misma precedencia y misma regla de privacidad que getUserName:
 * `display_name || name`, nunca el email (#458).
 *
 * `app` es opcional: dentro de una transacción se pasa el txApp para leer con la
 * misma conexión; por defecto usa $app, como el resto de helpers de este archivo.
 */
function getUserNames(userIds, app) {
  var db = app || $app
  var names = {}
  var ids = []
  var seen = {}
  for (var i = 0; i < (userIds || []).length; i++) {
    var id = userIds[i]
    if (!id || seen[id]) continue
    seen[id] = true
    ids.push(id)
    names[id] = ""
  }

  var CHUNK = 50
  for (var start = 0; start < ids.length; start += CHUNK) {
    var chunk = ids.slice(start, start + CHUNK)
    var parts = []
    var params = {}
    for (var j = 0; j < chunk.length; j++) {
      parts.push("id = {:id" + j + "}")
      params["id" + j] = chunk[j]
    }
    try {
      var recs = db.findRecordsByFilter("users", parts.join(" || "), "", 0, 0, params)
      for (var k = 0; k < recs.length; k++) {
        names[recs[k].getString("id")] =
          recs[k].getString("display_name") || recs[k].getString("name") || ""
      }
    } catch (e) {
      // Los ids de este chunk se quedan en "": quien llama ya trata el nombre
      // vacío ("Alguien" / "Tu amigo").
      console.log("[notif] getUserNames error:", e)
    }
  }
  return names
}

// type → categoría de preferencia. Mantener en sync con migration
// 1776800000_created_notification_prefs.js y useNotificationPrefs.
function categoryForType(type) {
  switch (type) {
    case "reaction": return "reactions"
    case "comment":
    case "comment_reply": return "comments"
    // Las solicitudes de #422 comparten categoría con el follow: quien silencia
    // los avisos de seguidores no quiere tampoco los de solicitud.
    case "follow":
    case "follow_request":
    case "follow_accepted": return "follows"
    case "challenge_join":
    case "challenge_complete": return "challenges"
    case "achievement":
    case "streak": return "own_milestones"
    case "referral_signup":
    case "referral_bonus": return "referrals"
    case "friend_workout":
    case "friend_joined": return "friend_workouts"
    case "friend_streak": return "friend_streaks"
    case "friend_achievement": return "friend_achievements"
    // Sin categoría A PROPÓSITO (#633). `program_deleted` avisa al inscrito de que
    // el programa que estaba siguiendo ya no existe: es un aviso transaccional
    // sobre SUS datos, no contenido social de otro usuario, y sin él se queda otra
    // vez sin «hoy toca» y sin explicación —que es justo el fallo que cierra #633—.
    // Ninguna de las nueve categorías encaja, y la menos mala (`own_milestones`,
    // «Tus logros y rachas») significaría que quien silencia sus rachas deja de
    // enterarse. Devolver "" lo deja siempre entregable: prefAllows() no bloquea
    // con categoría vacía. Va escrito como `case` y no cayéndose por el `default`
    // para que la decisión sea explícita y salga al grepear el tipo.
    case "program_deleted": return ""
    default: return ""
  }
}

// ¿El usuario permite esta categoría en este canal ("inapp" | "push")?
// Opt-out: sin registro o sin el campo → true. Solo false explícito suprime.
function prefAllows(userId, category, channel) {
  try {
    if (!userId) return true
    var recs = $app.findRecordsByFilter("notification_prefs", "user = {:u}", "", 1, 0, { u: userId })
    var rec = (recs && recs.length > 0) ? recs[0] : null
    if (!rec) return true
    if (channel === "push" && rec.getBool("push_enabled") === false) return false
    if (category && rec.getBool(category) === false) return false
    return true
  } catch (e) {
    // Nunca bloquear notificaciones por un error de preferencias.
    return true
  }
}

function createSelfNotification(userId, type, referenceId, referenceType, data) {
  if (!userId) return
  if (!prefAllows(userId, categoryForType(type), "inapp")) return
  try {
    var collection = $app.findCollectionByNameOrId("notifications")
    var notif = new Record(collection)
    notif.set("user", userId)
    notif.set("type", type)
    notif.set("actor", userId)
    notif.set("reference_id", referenceId)
    notif.set("reference_type", referenceType)
    notif.set("read", false)
    notif.set("data", JSON.stringify(data || {}))
    $app.save(notif)
  } catch (e) {
    console.log("[notif] self-create failed (type=" + type + "):", e)
  }
}

function createNotification(userId, type, actorId, referenceId, referenceType, data) {
  if (!userId || !actorId || userId === actorId) return
  // Guard de bloqueo: nunca notificar entre usuarios con bloqueo (cinturón
  // extra; los guards de creación ya cortan casi todo el fan-out).
  try {
    var blocks = require(`${__hooks}/utils/blocks.js`)
    if (blocks.isBlocked($app, userId, actorId)) return
  } catch (e) { /* nunca romper notificaciones por un error del guard */ }
  if (!prefAllows(userId, categoryForType(type), "inapp")) return
  try {
    var collection = $app.findCollectionByNameOrId("notifications")
    var notif = new Record(collection)
    notif.set("user", userId)
    notif.set("type", type)
    notif.set("actor", actorId)
    notif.set("reference_id", referenceId)
    notif.set("reference_type", referenceType)
    notif.set("read", false)
    notif.set("data", JSON.stringify(data || {}))
    $app.save(notif)
  } catch (e) {
    console.log("[notif] create failed (type=" + type + "):", e)
  }
}

/**
 * `actorId` es opcional pero debe pasarse SIEMPRE que el push hable de otro
 * usuario (#386). `createNotification` ya cortaba el par bloqueado, pero el
 * push se enviaba igual: quien bloquea seguía recibiendo el nombre y el texto
 * del bloqueado por notificación, aunque la notificación in-app se suprimiera.
 * Sin `actorId` no hay par que comprobar (push propio o del sistema).
 */
function sendPush(userId, title, body, url, type, actorId) {
  try {
    if (actorId && userId !== actorId) {
      try {
        var blocks = require(`${__hooks}/utils/blocks.js`)
        if (blocks.isBlocked($app, userId, actorId)) return
      } catch (e) { /* nunca romper el push por un error del guard */ }
    }
    if (type && !prefAllows(userId, categoryForType(type), "push")) return
    var apiUrl = $os.getenv("AI_API_URL") || "http://localhost:3001"
    var internalKey = $os.getenv("INTERNAL_API_KEY") || ""
    var headers = { "Content-Type": "application/json" }
    if (internalKey) {
      headers["X-Internal-Key"] = internalKey
    }
    $http.send({
      url: apiUrl + "/api/send-push",
      method: "POST",
      headers: headers,
      body: JSON.stringify({ user_id: userId, title: title, body: body, url: url }),
      timeout: 10,
    })
  } catch (e) {
    console.log("[notif] push error:", e)
  }
}

/**
 * Push a MUCHOS destinatarios en UNA llamada HTTP (#481).
 *
 * Antes el fan-out hacía un `$http.send` (timeout 10 s) por seguidor dentro del
 * hook de escritura: con 500 seguidores la creación de la sesión podía quedar
 * bloqueada minutos. Ahora los filtros por destinatario (bloqueos + preferencias,
 * queries locales) se aplican aquí y el envío real sale como una sola llamada con
 * `user_ids`; el AI API responde 202 y despacha en segundo plano.
 *
 * Mismas garantías que sendPush: `actorId` corta los pares bloqueados (#386) y
 * `type` aplica la preferencia de push por usuario. Nunca deja escapar un error.
 * Solo sirve cuando el mensaje es idéntico para todos — un push con URL nominal
 * por destinatario (revancha de batalla) sigue yendo por sendPush.
 */
function sendPushBatch(userIds, title, body, url, type, actorId) {
  try {
    var category = type ? categoryForType(type) : ""
    var blocks = null
    if (actorId) {
      try { blocks = require(`${__hooks}/utils/blocks.js`) } catch (e) { /* guard opcional */ }
    }

    var recipients = []
    var seen = {}
    for (var i = 0; i < (userIds || []).length; i++) {
      var uid = userIds[i]
      if (!uid || seen[uid]) continue
      seen[uid] = true
      if (blocks && actorId && uid !== actorId) {
        try { if (blocks.isBlocked($app, uid, actorId)) continue } catch (e) { /* nunca romper el push */ }
      }
      if (type && !prefAllows(uid, category, "push")) continue
      recipients.push(uid)
    }
    if (recipients.length === 0) return

    var apiUrl = $os.getenv("AI_API_URL") || "http://localhost:3001"
    var internalKey = $os.getenv("INTERNAL_API_KEY") || ""
    var headers = { "Content-Type": "application/json" }
    if (internalKey) {
      headers["X-Internal-Key"] = internalKey
    }
    $http.send({
      url: apiUrl + "/api/send-push",
      method: "POST",
      headers: headers,
      body: JSON.stringify({ user_ids: recipients, title: title, body: body, url: url }),
      timeout: 10,
    })
  } catch (e) {
    console.log("[notif] push batch error:", e)
  }
}

// ── Fan-out a seguidores ─────────────────────────────────────────────────────

// IDs de los usuarios que siguen a `userId` (los que verían su actividad).
//
// EXCLUYE las solicitudes pendientes (#422). Sin este filtro, quien solicita
// seguir a una cuenta privada empieza a recibir los avisos de su actividad
// —"Fulano ha entrenado"— sin que se le haya aceptado: la notificación se
// convierte en el canal de fuga que las reglas de las views acaban de cerrar.
//
// `status = ''` pasa a propósito: son las filas anteriores a #422, que el
// backfill dio por aceptadas, y las que crean los clientes viejos antes de que
// `follow_requests.pb.js` las normalice.
function getFollowers(userId) {
  var ids = []
  try {
    var recs = $app.findRecordsByFilter(
      "follows",
      "following = {:u} && status != 'pending'",
      "", 500, 0,
      { u: userId }
    )
    for (var i = 0; i < recs.length; i++) {
      var f = recs[i].getString("follower")
      if (f) ids.push(f)
    }
  } catch (e) {
    console.log("[notif] getFollowers error:", e)
  }
  return ids
}

// Notifica (in-app + push) a todos los seguidores de `actorId`.
// `push` = { title, body, url } o null para omitir el push.
// El gate de preferencias se aplica por seguidor (createNotification / sendPushBatch).
//
// Las notificaciones in-app siguen creándose una a una (son saves locales); el
// push sale en UNA llamada HTTP al final (#481) — antes era un POST con timeout
// de 10 s por seguidor, dentro del hook de escritura que disparó el fan-out.
function notifyFollowers(actorId, type, referenceId, data, push) {
  if (!actorId) return
  var blocks = null
  try { blocks = require(`${__hooks}/utils/blocks.js`) } catch (e) {}
  var followers = getFollowers(actorId)
  var pushTargets = []
  for (var i = 0; i < followers.length; i++) {
    var fid = followers[i]
    if (!fid || fid === actorId) continue
    if (blocks && blocks.isBlocked($app, fid, actorId)) continue
    createNotification(fid, type, actorId, referenceId, "user", data)
    if (push) pushTargets.push(fid)
  }
  if (push && pushTargets.length > 0) {
    sendPushBatch(pushTargets, push.title, push.body, push.url, type, actorId)
  }
}

// Cuenta sesiones del usuario (todos los tipos). `since` = "YYYY-MM-DD 00:00:00.000Z"
// o null para total histórico. Cap 3 por colección (solo nos importa 1 vs >1).
function countSessions(userId, since) {
  var count = 0
  var cols = ["sessions", "circuit_sessions", "cardio_sessions"]
  for (var c = 0; c < cols.length; c++) {
    try {
      var filter = "user = {:u}"
      var params = { u: userId }
      if (since) {
        filter += " && created >= {:since}"
        params.since = since
      }
      var recs = $app.findRecordsByFilter(cols[c], filter, "", 3, 0, params)
      count += recs.length
    } catch (e) { /* la colección puede no existir */ }
  }
  return count
}

function todayDateString() {
  var now = new Date()
  return now.getFullYear() + "-" +
    String(now.getMonth() + 1).padStart(2, "0") + "-" +
    String(now.getDate()).padStart(2, "0")
}

// Cuando un usuario crea una sesión: avisa a sus seguidores.
// - Primera sesión de su vida  → friend_joined ("empezó a entrenar")
// - Primera sesión del día      → friend_workout ("entrenó hoy")
// - Resto del día               → nada (evita spam)
// Se llama desde los handlers de sessions / circuit_sessions / cardio_sessions.
function notifyFriendsOnWorkout(userId) {
  try {
    if (!userId) return
    // Sin seguidores no hay nada que hacer (evita queries de conteo).
    var followers = getFollowers(userId)
    if (followers.length === 0) return

    var userName = getUserName(userId) || "Alguien"
    var total = countSessions(userId, null)

    if (total === 1) {
      notifyFollowers(userId, "friend_joined", userId, {}, {
        title: userName + " empezo a entrenar",
        body: "Acaba de completar su primer entrenamiento",
        url: "/u/" + userId,
      })
      return
    }

    var todayStart = todayDateString() + " 00:00:00.000Z"
    var todayCount = countSessions(userId, todayStart)
    if (todayCount === 1) {
      notifyFollowers(userId, "friend_workout", userId, {}, {
        title: userName + " entreno hoy",
        body: "Mira la actividad de tu amigo",
        url: "/u/" + userId,
      })
    }
  } catch (e) {
    console.log("[notif] notifyFriendsOnWorkout error:", e)
  }
}

// Referral bonus: cuando un usuario referido completa su PRIMERA sesión
// (de cualquier tipo), notifica al referrer.
function checkReferralBonus(userId) {
  try {
    var referrals = $app.findRecordsByFilter(
      "referrals",
      "referred = {:u}",
      "",
      1,
      0,
      { u: userId }
    )
    if (!referrals || referrals.length === 0) return

    var referrerId = referrals[0].getString("referrer")
    if (!referrerId) return

    // Cuenta de sesiones del usuario (todos los tipos). Solo dispara en la primera.
    var sessionCount = countSessions(userId, null)

    // Solo en la primerísima sesión (count === 1 porque el registro recién se creó).
    if (sessionCount !== 1) return

    var referredName = getUserName(userId)

    createNotification(
      referrerId,
      "referral_bonus",
      userId,
      userId,
      "user",
      { referredName: referredName }
    )

    sendPush(
      referrerId,
      "Tu referido completo su primer entrenamiento!",
      (referredName || "Tu referido") + " ya esta entrenando",
      "/referrals",
      "referral_bonus",
      userId
    )
  } catch (err) {
    console.log("[notif] referral_bonus error:", err)
  }
}

var STREAK_MILESTONES = [7, 14, 30, 50, 100, 200, 365]

/**
 * Notifica el hito de racha si `newStreak` acaba de cruzar uno.
 *
 * Lo llaman DOS sitios y ninguno sobra: el hook de update de `user_stats`
 * (cualquier escritura por la API de records) y utils/workout_stats.js, que
 * escribe con SQL atomico — sin perder incrementos en paralelo, pero tampoco
 * disparando hooks de record. Ver #412.
 */
function checkStreakMilestone(userId, oldStreak, newStreak) {
  if (!userId) return
  if (!(newStreak > oldStreak)) return

  // De mayor a menor: si un update cruza varios hitos (ej. 5 → 20) se notifica
  // solo el mayor — una notif por update, la mas significativa.
  for (var i = STREAK_MILESTONES.length - 1; i >= 0; i--) {
    var milestone = STREAK_MILESTONES[i]
    if (newStreak >= milestone && oldStreak < milestone) {
      createSelfNotification(userId, "streak", String(milestone), "streak", { days: milestone })
      sendPush(userId, milestone + " dias seguidos!", "Tu racha de entrenamiento sigue creciendo", "/progress", "streak")

      // Fan-out a seguidores: "tu amigo lleva N dias seguidos"
      notifyFollowers(userId, "friend_streak", String(milestone), { days: milestone }, {
        title: (getUserName(userId) || "Tu amigo") + " lleva " + milestone + " dias seguidos",
        body: "Tu amigo esta en racha",
        url: "/u/" + userId,
      })
      break
    }
  }
}

module.exports = {
  checkStreakMilestone: checkStreakMilestone,
  getUserName: getUserName,
  getUserNames: getUserNames,
  categoryForType: categoryForType,
  prefAllows: prefAllows,
  createSelfNotification: createSelfNotification,
  createNotification: createNotification,
  sendPush: sendPush,
  sendPushBatch: sendPushBatch,
  getFollowers: getFollowers,
  notifyFollowers: notifyFollowers,
  countSessions: countSessions,
  notifyFriendsOnWorkout: notifyFriendsOnWorkout,
  checkReferralBonus: checkReferralBonus,
}
