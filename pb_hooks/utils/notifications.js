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
 */

function getUserName(userId) {
  try {
    var user = $app.findRecordById("users", userId)
    return user.getString("display_name") || user.getString("name") || user.getString("email").split("@")[0] || ""
  } catch (e) {
    return ""
  }
}

function createSelfNotification(userId, type, referenceId, referenceType, data) {
  if (!userId) return
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

function sendPush(userId, title, body, url) {
  try {
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
    var sessionCount = 0
    try {
      var sessions = $app.findRecordsByFilter("sessions", "user = '" + userId + "'", "", 2, 0)
      sessionCount += sessions.length
    } catch (err) { /* collection might not exist */ }
    try {
      var circuits = $app.findRecordsByFilter("circuit_sessions", "user = '" + userId + "'", "", 2, 0)
      sessionCount += circuits.length
    } catch (err) { /* collection might not exist */ }
    try {
      var cardio = $app.findRecordsByFilter("cardio_sessions", "user = '" + userId + "'", "", 2, 0)
      sessionCount += cardio.length
    } catch (err) { /* collection might not exist */ }

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
      "/referrals"
    )
  } catch (err) {
    console.log("[notif] referral_bonus error:", err)
  }
}

module.exports = {
  getUserName: getUserName,
  createSelfNotification: createSelfNotification,
  createNotification: createNotification,
  sendPush: sendPush,
  checkReferralBonus: checkReferralBonus,
}
