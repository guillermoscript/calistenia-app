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

function getUserName(userId) {
  try {
    var user = $app.findRecordById("users", userId)
    return user.getString("display_name") || user.getString("name") || user.getString("email").split("@")[0] || ""
  } catch (e) {
    return ""
  }
}

// type → categoría de preferencia. Mantener en sync con migration
// 1776800000_created_notification_prefs.js y useNotificationPrefs.
function categoryForType(type) {
  switch (type) {
    case "reaction": return "reactions"
    case "comment":
    case "comment_reply": return "comments"
    case "follow": return "follows"
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
    default: return ""
  }
}

// ¿El usuario permite esta categoría en este canal ("inapp" | "push")?
// Opt-out: sin registro o sin el campo → true. Solo false explícito suprime.
function prefAllows(userId, category, channel) {
  try {
    if (!userId) return true
    var recs = $app.findRecordsByFilter("notification_prefs", "user = '" + userId + "'", "", 1, 0)
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

function sendPush(userId, title, body, url, type) {
  try {
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

// ── Fan-out a seguidores ─────────────────────────────────────────────────────

// IDs de los usuarios que siguen a `userId` (los que verían su actividad).
function getFollowers(userId) {
  var ids = []
  try {
    var recs = $app.findRecordsByFilter("follows", "following = '" + userId + "'", "", 500, 0)
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
// El gate de preferencias se aplica por seguidor dentro de createNotification/sendPush.
function notifyFollowers(actorId, type, referenceId, data, push) {
  if (!actorId) return
  var blocks = null
  try { blocks = require(`${__hooks}/utils/blocks.js`) } catch (e) {}
  var followers = getFollowers(actorId)
  for (var i = 0; i < followers.length; i++) {
    var fid = followers[i]
    if (!fid || fid === actorId) continue
    if (blocks && blocks.isBlocked($app, fid, actorId)) continue
    createNotification(fid, type, actorId, referenceId, "user", data)
    if (push) {
      sendPush(fid, push.title, push.body, push.url, type)
    }
  }
}

// Cuenta sesiones del usuario (todos los tipos). `since` = "YYYY-MM-DD 00:00:00.000Z"
// o null para total histórico. Cap 3 por colección (solo nos importa 1 vs >1).
function countSessions(userId, since) {
  var count = 0
  var cols = ["sessions", "circuit_sessions", "cardio_sessions"]
  for (var c = 0; c < cols.length; c++) {
    try {
      var filter = "user = '" + userId + "'"
      if (since) filter += " && created >= '" + since + "'"
      var recs = $app.findRecordsByFilter(cols[c], filter, "", 3, 0)
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
      "referred = '" + userId + "'",
      "",
      1,
      0
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
      "referral_bonus"
    )
  } catch (err) {
    console.log("[notif] referral_bonus error:", err)
  }
}

module.exports = {
  getUserName: getUserName,
  categoryForType: categoryForType,
  prefAllows: prefAllows,
  createSelfNotification: createSelfNotification,
  createNotification: createNotification,
  sendPush: sendPush,
  getFollowers: getFollowers,
  notifyFollowers: notifyFollowers,
  countSessions: countSessions,
  notifyFriendsOnWorkout: notifyFriendsOnWorkout,
  checkReferralBonus: checkReferralBonus,
}
