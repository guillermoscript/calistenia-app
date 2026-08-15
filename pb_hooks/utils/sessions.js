/// <reference path="../../pb_data/types.d.ts" />

/**
 * Helpers compartidos para las tres colecciones de sesiones.
 *
 * Los handlers de PocketBase corren en runtimes JSVM aislados: requerir este
 * módulo desde el handler o helper que lo consume, nunca confiar en globals de
 * otro archivo.
 */

// Dueño (userId) de un session_id de comments/feed_reactions.
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
  findSessionOwner: findSessionOwner,
}
