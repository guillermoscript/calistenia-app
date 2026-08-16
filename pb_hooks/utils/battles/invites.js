/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Tokens de invitación de batallas (#481): emisión, búsqueda, rechazo y guard de
 * bloqueos. Ver la cabecera de `utils/battles.js` para las reglas del JSVM.
 */

var state = require(`${__hooks}/utils/battles/state.js`)

function hashToken(token) {
  return $security.sha256(String(token))
}

/**
 * Invite tokens are single-use on purpose: a link that leaks out of the group chat can
 * burn at most one seat. The lobby UI issues a fresh token on every share, so the
 * creator experience is still "tap share, send a link".
 */
function issueInvite(txApp, battle, creatorId, ms, inviteeUserId) {
  var token = $security.randomString(40)
  var collection = txApp.findCollectionByNameOrId('battle_invites')
  var record = new Record(collection)
  record.set('battle', battle.getString('id'))
  record.set('created_by', creatorId)
  record.set('token_hash', hashToken(token))
  record.set('status', 'active')
  record.set('expires_at', state.isoAt(ms + state.INVITE_TTL_MS))
  // Un invitado nominal (#357). El enlace que se comparte a mano no lo lleva y sigue
  // siendo para quien lo reciba; el de una revancha sí, porque viaja en una push y no
  // en una conversación. Ver `inviteBindingRejects`: un token nominal filtrado no le
  // sirve a nadie más que a su destinatario.
  if (inviteeUserId) record.set('invitee_user', inviteeUserId)
  txApp.save(record)
  // The raw token is returned to the caller and never stored, logged or tracked.
  return { token: token, record: record }
}

/**
 * ¿Este token es nominal y quien lo presenta no es su destinatario? (#357)
 *
 * Va aparte de `inviteRejection` porque esa la usa también la landing sin auth, que no
 * tiene identidad contra la que comparar. Devuelve un booleano y el handler responde el
 * MISMO 409 genérico que un token revocado: quien llega no debe poder distinguir "este
 * enlace no es para ti" de "este enlace ya no vale", o el token se vuelve un oráculo
 * sobre quién fue invitado.
 */
function inviteBindingRejects(invite, userId) {
  if (!invite) return false
  var bound = invite.getString('invitee_user')
  if (!bound) return false
  return bound !== userId
}

function findInviteByToken(app, token) {
  if (!token || typeof token !== 'string') return null
  try {
    return app.findFirstRecordByFilter(
      'battle_invites',
      'token_hash = {:h}',
      { h: hashToken(token) },
    )
  } catch (err) {
    return null
  }
}

/**
 * ¿Hay bloqueo entre `userId` y alguien que ya está dentro de la batalla — el creador
 * o cualquier participante (#413)?
 *
 * Una batalla es un evento de grupo, así que no basta con mirar al creador: si C monta
 * la batalla e invita a A y a B, que se bloquean entre ellos, el par acabaría junto
 * viéndose el progreso en vivo sin que ninguno sea el creador.
 *
 * `app` es el App del contexto de llamada (txApp dentro de la transacción del join,
 * nunca $app mezclado con ella).
 */
function battleHasBlockWith(app, battle, userId) {
  if (!userId) return false
  var blocks = require(`${__hooks}/utils/blocks.js`)

  // Una sola consulta a `user_blocks` en vez de una por candidato: el lobby no tiene tope
  // de participantes en el servidor, así que el coste de este guard no debe crecer con él.
  var counterparts = blocks.blockedCounterparts(app, userId)

  var creatorId = battle.getString('creator')
  if (creatorId && counterparts[creatorId]) return true

  var participants = state.findParticipants(app, battle.getString('id'))
  for (var i = 0; i < participants.length; i++) {
    var other = participants[i].getString('user')
    if (other && counterparts[other]) return true
  }
  return false
}

/**
 * Why an invite cannot be used right now, or an empty string if it can.
 *
 * The reasons are deliberately coarse (`invalid` / `expired` / `closed`) and never
 * mention who else is in the lobby: an attacker holding a guessed token must not learn
 * anything about the participants from the landing endpoint.
 *
 * El bloqueo NO se comprueba aquí sino en el handler del join, después de resolver si
 * quien llega ya tiene plaza: esta función también la usa la landing sin auth, que no
 * tiene identidad, y a un participante que ya está dentro no se le echa por un bloqueo
 * posterior (decisión de #413: se bloquea la entrada, no una batalla en marcha).
 */
function inviteRejection(app, invite) {
  if (!invite) return 'invalid'
  var status = invite.getString('status')
  if (status === 'revoked') return 'invalid'
  if (status === 'consumed') return 'invalid'
  if (status !== 'active') return 'invalid'
  if (state.dateMs(invite, 'expires_at') <= state.nowMs()) return 'expired'

  var battle
  try {
    battle = app.findRecordById('battles', invite.getString('battle'))
  } catch (err) {
    return 'invalid'
  }
  if (state.dateMs(battle, 'invite_revoked_at')) return 'invalid'
  if (!state.canAcceptJoin(battle.getString('status'))) return 'closed'
  return ''
}

module.exports = {
  hashToken: hashToken,
  issueInvite: issueInvite,
  inviteBindingRejects: inviteBindingRejects,
  findInviteByToken: findInviteByToken,
  inviteRejection: inviteRejection,
  battleHasBlockWith: battleHasBlockWith,
}
