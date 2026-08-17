/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Avisos del ciclo de vida de una batalla (#390).
 *
 * Van SIEMPRE fuera de la transacción y nunca dejan escapar un error: unirse a una
 * batalla o arrancarla no puede fallar porque el aviso falle.
 *
 * Los tipos se mapean a la categoría de preferencias `challenges` en lugar de estrenar
 * una `battles`. No es pereza: los campos de `notification_prefs` son booleanos y una
 * columna nueva nace en `false` para todas las filas existentes, que es justo lo que
 * `prefAllows` interpreta como "desactivado" — estrenar categoría silenciaría los avisos
 * de batalla para todo el mundo salvo que se rellene la columna. Una batalla es una
 * competición, así que quien apaga los avisos de retos apaga estos también.
 */

var state = require(`${__hooks}/utils/battles/state.js`)

function notifyBattleJoin(app, battle, joinerId) {
  try {
    var notifications = require(`${__hooks}/utils/notifications.js`)
    var creatorId = battle.getString('creator')
    if (!creatorId || creatorId === joinerId) return

    var battleId = battle.getString('id')
    var name = notifications.getUserName(joinerId)
    notifications.createNotification(
      creatorId, 'challenge_join', joinerId, battleId, 'battle', { battle_id: battleId, kind: 'battle_join' },
    )
    notifications.sendPush(
      creatorId,
      name || 'Alguien',
      'se ha unido a tu batalla',
      '/battle/' + battleId,
      'challenge_join',
      joinerId,
    )
  } catch (err) {
    console.log('[battle_api] notify join failed:', err)
  }
}

/**
 * El push a los participantes sale en UNA llamada (`sendPushBatch`, #481): el
 * mensaje es idéntico para todos y esto corre en el request de `start`, que no
 * debe quedarse esperando un POST por cabeza.
 */
function notifyBattleStart(app, battle, actorId) {
  try {
    var notifications = require(`${__hooks}/utils/notifications.js`)
    var battleId = battle.getString('id')
    var participants = state.findParticipants(app, battleId)
    var recipients = []
    for (var i = 0; i < participants.length; i++) {
      var userId = participants[i].getString('user')
      // Nunca al que pulsó empezar: ya está mirando la pantalla.
      if (!userId || userId === actorId) continue
      notifications.createNotification(
        userId, 'challenge_join', actorId, battleId, 'battle', { battle_id: battleId, kind: 'battle_start' },
      )
      recipients.push(userId)
    }
    notifications.sendPushBatch(
      recipients,
      'La batalla empieza',
      'Tu batalla arranca ahora',
      '/battle/' + battleId,
      'challenge_join',
      actorId,
    )
  } catch (err) {
    console.log('[battle_api] notify start failed:', err)
  }
}

/**
 * A quién se re-invita en una revancha (#357).
 *
 * Todos los que estuvieron en la batalla original menos quien pulsa — incluidos los que
 * se salieron, porque "otra vez" es una invitación, no un premio por haber aguantado.
 * Se caen del reparto dos casos:
 *
 *   - cuentas borradas (`user` vacío): la relación es opcional y queda a null, así que
 *     la fila sigue en la clasificación pero no hay a quién invitar;
 *   - cualquier bloqueo con quien pide la revancha (#413), en los dos sentidos. La
 *     batalla original pudo montarla un tercero, así que dos personas que se han
 *     bloqueado desde entonces no pueden acabar juntas en la nueva.
 */
function rematchRecipients(app, battle, actorId) {
  var blocks = require(`${__hooks}/utils/blocks.js`)
  var counterparts = blocks.blockedCounterparts(app, actorId)
  var participants = state.findParticipants(app, battle.getString('id'))
  var seen = {}
  var out = []

  for (var i = 0; i < participants.length; i++) {
    var userId = participants[i].getString('user')
    if (!userId || userId === actorId) continue
    if (seen[userId]) continue
    if (counterparts[userId]) continue
    seen[userId] = true
    out.push(userId)
  }
  return out
}

/**
 * Avisar a los antiguos participantes de que hay revancha (#357).
 *
 * Cada uno recibe SU token, nominal y de un solo uso, en el enlace profundo. Es la razón
 * por la que un token de revancha puede viajar en una push: aunque la notificación se
 * filtre, `inviteBindingRejects` no deja que lo gaste nadie más.
 *
 * Fuera de la transacción y a prueba de fallos, como el resto de avisos: la revancha ya
 * existe y no puede caerse porque falle una notificación.
 *
 * Este aviso NO se puede pasar a `sendPushBatch`: cada destinatario lleva una URL
 * distinta (su token nominal). El reparto está acotado por el tamaño de la batalla
 * original, no por seguidores, así que el push por cabeza aquí es asumible.
 */
function notifyBattleRematch(app, newBattle, actorId, invites) {
  try {
    var notifications = require(`${__hooks}/utils/notifications.js`)
    var battleId = newBattle.getString('id')
    var name = notifications.getUserName(actorId)
    for (var i = 0; i < invites.length; i++) {
      var invite = invites[i]
      notifications.createNotification(
        invite.userId, 'challenge_join', actorId, battleId, 'battle',
        { battle_id: battleId, kind: 'battle_rematch' },
      )
      notifications.sendPush(
        invite.userId,
        name || 'Alguien',
        'te reta a la revancha',
        '/battle-invite/' + invite.token,
        'challenge_join',
        actorId,
      )
    }
  } catch (err) {
    console.log('[battle_api] notify rematch failed:', err)
  }
}

module.exports = {
  notifyBattleJoin: notifyBattleJoin,
  notifyBattleStart: notifyBattleStart,
  notifyBattleRematch: notifyBattleRematch,
  rematchRecipients: rematchRecipients,
}
