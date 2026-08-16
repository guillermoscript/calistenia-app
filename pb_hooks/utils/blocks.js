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
      "(blocker = {:a} && blocked = {:b}) || (blocker = {:b} && blocked = {:a})",
      "", 1, 0, { a: a, b: b }
    )
    return recs.length > 0
  } catch (e) {
    return false
  }
}

/**
 * Ids de todas las personas con las que `userId` tiene bloqueo, en cualquier dirección.
 *
 * Para comprobar UN par usa `isBlocked`. Esto es para cuando hay que comprobar a `userId`
 * contra VARIOS de golpe (p. ej. el lobby entero de una batalla, #413): una sola consulta
 * en vez de una por candidato. La lista de bloqueos de una persona es pequeña —bloquear
 * es un acto manual, uno a uno— así que traerla entera sale más barato que N consultas y
 * el coste deja de crecer con el número de candidatos.
 *
 * Devuelve un objeto usado como conjunto: `counterparts[otroId] === true`.
 */
function blockedCounterparts(app, userId) {
  var set = {}
  if (!userId) return set
  try {
    var rows = app.findRecordsByFilter(
      "user_blocks",
      "blocker = {:u} || blocked = {:u}",
      "", 0, 0, { u: userId }
    )
    for (var i = 0; i < rows.length; i++) {
      var blocker = rows[i].getString("blocker")
      var blocked = rows[i].getString("blocked")
      var other = blocker === userId ? blocked : blocker
      if (other && other !== userId) set[other] = true
    }
  } catch (e) {
    // Mismo criterio que `isBlocked`: un fallo de consulta no puede tumbar la
    // funcionalidad entera (aquí dejaría a todo el mundo sin poder unirse a nada).
  }
  return set
}

function findSessionOwner(app, sessionId) {
  var sessions = require(`${__hooks}/utils/sessions.js`)
  return sessions.findSessionOwner(app, sessionId)
}

module.exports = {
  isBlocked: isBlocked,
  blockedCounterparts: blockedCounterparts,
  findSessionOwner: findSessionOwner,
}
