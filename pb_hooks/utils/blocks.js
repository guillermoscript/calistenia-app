/// <reference path="../../pb_data/types.d.ts" />

/**
 * Helpers de bloqueo de usuarios. Igual que utils/notifications.js: requerir
 * DENTRO de cada handler (runtimes JSVM aislados).
 *
 * `app` es el App a usar: $app en contexto normal, e.app dentro de hooks
 * transaccionales (¡nunca mezclar!).
 */

// ¿Existe bloqueo entre a y b en cualquier dirección?
function isBlocked(app, a, b) {
  if (!a || !b || a === b) return false
  try {
    var recs = app.findRecordsByFilter(
      "user_blocks",
      "(blocker = '" + a + "' && blocked = '" + b + "') || (blocker = '" + b + "' && blocked = '" + a + "')",
      "", 1, 0
    )
    return recs.length > 0
  } catch (e) {
    return false
  }
}

// Dueño (userId) de un session_id de comments/feed_reactions.
// Cascada try/catch como notification_service.pb.js, AMPLIADA con
// circuit_sessions (la del servicio de notifs no lo incluye hoy).
function findSessionOwner(app, sessionId) {
  if (!sessionId) return ""
  var cols = ["sessions", "cardio_sessions", "circuit_sessions"]
  for (var i = 0; i < cols.length; i++) {
    try {
      var rec = app.findRecordById(cols[i], sessionId)
      return rec.getString("user")
    } catch (e) { /* probar siguiente colección */ }
  }
  return ""
}

module.exports = {
  isBlocked: isBlocked,
  findSessionOwner: findSessionOwner,
}
