/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Handlers del API de batallas (#356), compuestos con `http.route()` (#481).
 *
 * Viven aquí y no en `battle_api.pb.js` porque PocketBase serializa cada callback
 * de `routerAdd` y lo re-evalúa en un runtime aislado: una closure compuesta en el
 * `.pb.js` pierde sus variables libres. Dentro del sistema de módulos (`require`)
 * las closures funcionan con normalidad, así que el `.pb.js` registra callbacks de
 * una línea que delegan en estas funciones.
 *
 * El contrato HTTP (rutas, códigos, formas de respuesta) es el de siempre;
 * `tests/pb_hooks/battles.test.mjs` lo verifica endpoint a endpoint.
 */

var state = require(`${__hooks}/utils/battles/state.js`)
var scoring = require(`${__hooks}/utils/battles/scoring.js`)
var invites = require(`${__hooks}/utils/battles/invites.js`)
var notify = require(`${__hooks}/utils/battles/notify.js`)
var http = require(`${__hooks}/utils/battles/http.js`)

/** Alta de plaza — compartida por publish, join y rematch: quien entra, entrena. */
function createSeat(txApp, battleId, userId, now) {
  var collection = txApp.findCollectionByNameOrId('battle_participants')
  var participant = new Record(collection)
  participant.set('battle', battleId)
  participant.set('user', userId)
  participant.set('status', 'joined')
  participant.set('progress', state.emptyProgress())
  participant.set('joined_at', state.isoAt(now))
  participant.set('last_seen_at', state.isoAt(now))
  txApp.save(participant)
  return participant
}

// ── GET /api/battles/{id}/snapshot ───────────────────────────────────────────

var snapshot = http.route({ guard: 'viewer', tx: false }, function (ctx, app, battle) {
  scoring.expireIfStale(app, battle)
})

// ── POST /api/battles/{id}/publish — draft → lobby ───────────────────────────

var publish = http.route({ guard: 'creator' }, function (ctx, txApp, battle) {
  if (!http.claimIdempotencyKey(txApp, ctx.battleId, ctx.userId, 'publish', ctx.body.idempotency_key)) {
    ctx.extend.replayed = true
    return
  }

  state.assertBattleTransition(battle.getString('status'), 'lobby')

  var now = state.nowMs()
  battle.set('status', 'lobby')
  battle.set('invite_expires_at', state.isoAt(now + state.INVITE_TTL_MS))
  state.touch(battle, now)
  state.bumpRevision(battle)
  txApp.save(battle)

  // The creator is a participant like everyone else — they train too.
  if (!state.findParticipantForUser(txApp, ctx.battleId, ctx.userId)) {
    createSeat(txApp, ctx.battleId, ctx.userId, now)
  }
})

// ── POST /api/battles/{id}/invites — issue a single-use token ────────────────

var issueInvite = http.route({ guard: 'creator' }, function (ctx, txApp, battle) {
  if (!state.canAcceptJoin(battle.getString('status'))) {
    state.fail(409, 'lobby_closed', 'The lobby is not accepting new participants')
  }

  var now = state.nowMs()
  // Re-issuing after a revoke reopens invitations; otherwise the battle would be
  // permanently uninvitable once the creator revoked once.
  battle.set('invite_revoked_at', '')
  battle.set('invite_expires_at', state.isoAt(now + state.INVITE_TTL_MS))
  state.touch(battle, now)
  txApp.save(battle)

  var issued = invites.issueInvite(txApp, battle, ctx.userId, now)

  // Deliberately NOT idempotency-keyed: a spare token is harmless (single-use,
  // expiring) whereas replaying this call could only ever return a null token,
  // since the raw value is never stored.
  ctx.respond = function () {
    return ctx.e.json(201, {
      token: issued.token,
      invite_id: issued.record.getString('id'),
      expires_at: issued.record.getString('expires_at'),
    })
  }
})

// ── POST /api/battles/{id}/invites/revoke ────────────────────────────────────

var revokeInvites = http.route({ guard: 'creator' }, function (ctx, txApp, battle) {
  var outstanding = []
  try {
    outstanding = txApp.findRecordsByFilter(
      'battle_invites',
      "battle = {:b} && status = 'active'",
      '', 0, 0, { b: ctx.battleId },
    )
  } catch (err) { outstanding = [] }

  var now = state.nowMs()
  var revoked = 0
  for (var i = 0; i < outstanding.length; i++) {
    outstanding[i].set('status', 'revoked')
    txApp.save(outstanding[i])
    revoked++
  }

  battle.set('invite_revoked_at', state.isoAt(now))
  state.touch(battle, now)
  txApp.save(battle)

  ctx.respond = function () {
    return ctx.e.json(200, { revoked: revoked })
  }
})

// ── POST /api/public/battle-invite — landing metadata, no identities ─────────

/**
 * Unauthenticated on purpose: a friend who is not logged in yet must be able to see
 * what they were invited to before signing up.
 *
 * POST rather than GET so the token is not written into PocketBase's request log, and
 * the response never contains a participant name, avatar or id — only counts.
 */
var publicInviteLanding = http.route({ public: true, pathId: false, load: false, tx: false }, function (ctx, app) {
  // Toda respuesta va vía ctx.respond — nunca e.json() directo desde el handler
  // (ver la nota del wrapper: devolvería undefined y el wrapper respondería otra vez).
  var respondWith = function (payload) {
    ctx.respond = function () { return ctx.e.json(200, payload) }
  }

  var invite = invites.findInviteByToken(app, ctx.body.token)
  var rejection = invites.inviteRejection(app, invite)
  if (rejection) {
    // Same 200 shape for "never existed", "expired" and "lobby closed": a guessed
    // token must not become an oracle for which battles exist.
    return respondWith({ ok: false, reason: rejection, battle: null })
  }

  var battle = app.findRecordById('battles', invite.getString('battle'))
  if (scoring.expireIfStale(app, battle)) {
    return respondWith({ ok: false, reason: 'expired', battle: null })
  }

  var config = state.jsonField(battle, 'config', {}) || {}
  var participants = state.findParticipants(app, battle.getString('id'))
  respondWith({
    ok: true,
    reason: '',
    battle: {
      id: battle.getString('id'),
      status: battle.getString('status'),
      rounds: config.rounds || 0,
      exercise_count: Array.isArray(config.exercises) ? config.exercises.length : 0,
      workout_template_id: config.workout_template_id || '',
      participant_count: state.lobbyParticipants(participants).length,
      expires_at: invite.getString('expires_at'),
    },
  })
})

// ── POST /api/battles/join — consume a token atomically ──────────────────────

var join = http.route({ pathId: false, load: false }, function (ctx, txApp) {
  var invite = invites.findInviteByToken(txApp, ctx.body.token)
  var rejection = invites.inviteRejection(txApp, invite)
  if (rejection) {
    state.fail(rejection === 'expired' ? 410 : 409, 'invite_' + rejection, 'This invite cannot be used')
  }

  var battleId = invite.getString('battle')
  ctx.battleId = battleId
  var battle = state.findBattle(txApp, battleId)
  var alreadyJoined = false

  // Someone re-opening their own link: hand them their existing seat instead of
  // burning a second token or erroring at them.
  if (state.findParticipantForUser(txApp, battleId, ctx.userId)) {
    alreadyJoined = true
  } else if (invites.battleHasBlockWith(txApp, battle, ctx.userId)) {
    // Un par bloqueado no entra en la misma batalla (#413). Esta ruta corre con
    // `$app`, así que se salta las API rules: sin esta comprobación el bloqueado
    // podría unirse igual y la regla de lectura solo lo esconderá después, que a
    // mitad de batalla es peor experiencia que no dejarle entrar.
    //
    // El 409 es exactamente el de un token revocado: quien llega no debe poder
    // distinguir un bloqueo de un enlace caducado. Va DESPUÉS de la rama de plaza
    // existente a propósito — a quien ya está dentro no se le echa.
    state.fail(409, 'invite_invalid', 'This invite cannot be used')
  } else if (invites.inviteBindingRejects(invite, ctx.userId)) {
    // Un token nominal solo lo gasta su destinatario (#357). Hoy solo los emite la
    // revancha, que los manda por push en vez de por una conversación; el error es a
    // propósito el mismo que el de un token revocado, para que no se pueda usar como
    // oráculo de a quién invitaron. Igual que el bloqueo, va DESPUÉS de la rama de
    // plaza existente: a quien ya está dentro no se le echa.
    state.fail(409, 'invite_invalid', 'This invite cannot be used')
  } else if (!http.claimIdempotencyKey(txApp, battleId, ctx.userId, 'join', ctx.body.idempotency_key)) {
    alreadyJoined = true
  } else {
    var now = state.nowMs()
    // The unique (battle, user) index is the real guard here: two devices on the
    // same account racing this call produce one participant, not two.
    createSeat(txApp, battleId, ctx.userId, now)

    invite.set('status', 'consumed')
    invite.set('used_at', state.isoAt(now))
    invite.set('used_by', ctx.userId)
    txApp.save(invite)

    // A new participant makes the lobby un-ready again: everyone re-confirms.
    var participants = state.findParticipants(txApp, battleId)
    state.syncLobbyStatus(txApp, battle, participants)
    state.touch(battle, now)
    state.bumpRevision(battle)
    txApp.save(battle)
  }

  ctx.extend.already_joined = alreadyJoined
  if (!alreadyJoined) {
    // Fuera de la transacción y a prueba de fallos: avisar al creador es útil, pero si
    // la notificación revienta, la plaza ya está tomada y el usuario debe entrar igual.
    ctx.after = function (fresh) {
      notify.notifyBattleJoin($app, fresh, ctx.userId)
    }
  }
})

// ── POST /api/battles/{id}/ready — joined ⇄ ready ────────────────────────────

var ready = http.route({ guard: 'participant' }, function (ctx, txApp, battle) {
  var wantReady = ctx.body.ready === undefined ? true : !!ctx.body.ready

  var status = battle.getString('status')
  if (status !== 'lobby' && status !== 'ready') {
    state.fail(409, 'invalid_transition', 'Readiness can only change in the lobby')
  }

  if (!http.claimIdempotencyKey(txApp, ctx.battleId, ctx.userId, 'ready', ctx.body.idempotency_key)) return

  var from = ctx.participant.getString('status')
  var to = wantReady ? 'ready' : 'joined'
  if (from === to) return // double-tap on the same button

  state.assertParticipantTransition(from, to)

  var now = state.nowMs()
  ctx.participant.set('status', to)
  ctx.participant.set('ready_at', to === 'ready' ? state.isoAt(now) : '')
  ctx.participant.set('last_seen_at', state.isoAt(now))
  txApp.save(ctx.participant)

  var participants = state.findParticipants(txApp, ctx.battleId)
  state.syncLobbyStatus(txApp, battle, participants)
  state.touch(battle, now)
  state.bumpRevision(battle)
  txApp.save(battle)
})

// ── POST /api/battles/{id}/start — ready → live ──────────────────────────────

var start = http.route({ guard: 'creator' }, function (ctx, txApp, battle) {
  // La cuenta atrás dura 5 s: quien tenga la app en segundo plano se pierde el
  // arranque si nadie se lo dice. Fuera de la transacción, y nunca puede tumbar el
  // arranque de la batalla. Se avisa también en la repetición idempotente, igual
  // que siempre: el aviso es a prueba de fallos y no duplica registros in-app.
  ctx.after = function (fresh) {
    notify.notifyBattleStart($app, fresh, ctx.userId)
  }

  if (!http.claimIdempotencyKey(txApp, ctx.battleId, ctx.userId, 'start', ctx.body.idempotency_key)) return

  state.assertBattleTransition(battle.getString('status'), 'live')

  var participants = state.findParticipants(txApp, ctx.battleId)
  var readyOnes = []
  for (var i = 0; i < participants.length; i++) {
    if (participants[i].getString('status') === 'ready') readyOnes.push(participants[i])
  }
  if (readyOnes.length < state.MIN_READY_TO_START) {
    state.fail(409, 'not_enough_participants',
      'A battle needs at least ' + state.MIN_READY_TO_START + ' ready participants')
  }

  var now = state.nowMs()
  // `starts_at` is the single source of truth for the countdown. Clients render it
  // against their measured server offset and never against the device clock.
  var startsAt = now + state.COUNTDOWN_LEAD_MS
  battle.set('status', 'live')
  battle.set('starts_at', state.isoAt(startsAt))
  state.touch(battle, now)
  state.bumpRevision(battle)
  txApp.save(battle)

  for (var j = 0; j < readyOnes.length; j++) {
    state.assertParticipantTransition(readyOnes[j].getString('status'), 'active')
    readyOnes[j].set('status', 'active')
    readyOnes[j].set('active_at', state.isoAt(startsAt))
    readyOnes[j].set('last_seen_at', state.isoAt(now))
    txApp.save(readyOnes[j])
  }
})

// ── POST /api/battles/{id}/progress ──────────────────────────────────────────

var progress = http.route({ guard: 'participant' }, function (ctx, txApp, battle) {
  if (battle.getString('status') !== 'live') {
    state.fail(409, 'battle_not_live', 'The battle is not live')
  }
  if (ctx.participant.getString('status') !== 'active') {
    state.fail(409, 'participant_not_active', 'You are not an active participant')
  }
  if (state.dateMs(battle, 'starts_at') > state.nowMs()) {
    state.fail(409, 'not_started', 'The countdown has not finished')
  }

  var config = state.jsonField(battle, 'config', null)
  var previous = state.jsonField(ctx.participant, 'progress', state.emptyProgress())
  // Rejects negatives, regressions, over-count rounds and unknown exercise
  // positions. A participant can only ever write their own row: `ctx.participant`
  // was resolved from the caller's user id, never from the request body.
  var next = state.nextProgress(config, previous, ctx.body.progress)

  var now = state.nowMs()
  ctx.participant.set('progress', next)
  ctx.participant.set('last_seen_at', state.isoAt(now))
  txApp.save(ctx.participant)

  state.touch(battle, now)
  state.bumpRevision(battle)
  txApp.save(battle)
})

// ── POST /api/battles/{id}/finish ────────────────────────────────────────────

var finish = http.route({ guard: 'participant' }, function (ctx, txApp, battle) {
  // The same gate `progress` applies. Without it the two routes disagreed about when
  // a battle has started, and `finish` is the more consequential of the two: it is
  // terminal, it feeds `sealFinalStandings`, and finishing during the countdown
  // ranked you first on an empty score against people who never got to move.
  //
  // Checked before claiming the idempotency key, so a rejected call does not burn it.
  if (state.dateMs(battle, 'starts_at') > state.nowMs()) {
    state.fail(409, 'not_started', 'The countdown has not finished')
  }

  if (!http.claimIdempotencyKey(txApp, ctx.battleId, ctx.userId, 'finish', ctx.body.idempotency_key)) return
  if (ctx.participant.getString('status') === 'finished') return

  state.assertParticipantTransition(ctx.participant.getString('status'), 'finished')

  var now = state.nowMs()
  if (ctx.body.progress) {
    var config = state.jsonField(battle, 'config', null)
    var previous = state.jsonField(ctx.participant, 'progress', state.emptyProgress())
    ctx.participant.set('progress', state.nextProgress(config, previous, ctx.body.progress))
  }
  ctx.participant.set('status', 'finished')
  ctx.participant.set('finished_at', state.isoAt(now))
  ctx.participant.set('last_seen_at', state.isoAt(now))
  txApp.save(ctx.participant)

  // A single participant finishing alone still produces a valid finished battle.
  var participants = state.findParticipants(txApp, ctx.battleId)
  if (state.countWithStatus(participants, 'active') === 0 &&
      battle.getString('status') === 'live') {
    battle.set('status', 'finished')
    battle.set('finished_at', state.isoAt(now))
    battle.set('ends_at', state.isoAt(now))
    scoring.sealFinalStandings(txApp, battle, participants)
  }
  state.touch(battle, now)
  state.bumpRevision(battle)
  txApp.save(battle)
})

// ── POST /api/battles/{id}/leave ─────────────────────────────────────────────

var leave = http.route({ guard: 'participant' }, function (ctx, txApp, battle) {
  if (!http.claimIdempotencyKey(txApp, ctx.battleId, ctx.userId, 'leave', ctx.body.idempotency_key)) return
  if (ctx.participant.getString('status') === 'left') return

  state.assertParticipantTransition(ctx.participant.getString('status'), 'left')

  var now = state.nowMs()
  ctx.participant.set('status', 'left')
  ctx.participant.set('left_at', state.isoAt(now))
  ctx.participant.set('last_seen_at', state.isoAt(now))
  txApp.save(ctx.participant)

  var status = battle.getString('status')
  var isCreator = battle.getString('creator') === ctx.userId
  var participants = state.findParticipants(txApp, ctx.battleId)

  if (isCreator && (status === 'draft' || status === 'lobby' || status === 'ready')) {
    // Nobody else can start it, so a creator walking out of the lobby cancels the
    // battle rather than leaving a zombie for the expiry sweep.
    battle.set('status', 'cancelled')
    scoring.sealFinalStandings(txApp, battle, participants)
  } else if (status === 'live' && state.countWithStatus(participants, 'active') === 0) {
    // Mid-battle the creator is just another participant: the battle carries on
    // and only closes when the last active participant is gone.
    battle.set('status', 'finished')
    battle.set('finished_at', state.isoAt(now))
    battle.set('ends_at', state.isoAt(now))
    scoring.sealFinalStandings(txApp, battle, participants)
  } else {
    state.syncLobbyStatus(txApp, battle, participants)
  }

  state.touch(battle, now)
  state.bumpRevision(battle)
  txApp.save(battle)
})

// ── POST /api/battles/{id}/cancel ────────────────────────────────────────────

var cancel = http.route({ guard: 'creator' }, function (ctx, txApp, battle) {
  if (!http.claimIdempotencyKey(txApp, ctx.battleId, ctx.userId, 'cancel', ctx.body.idempotency_key)) return
  if (battle.getString('status') === 'cancelled') return

  state.assertBattleTransition(battle.getString('status'), 'cancelled')

  var now = state.nowMs()
  battle.set('status', 'cancelled')
  scoring.sealFinalStandings(txApp, battle, null)
  state.touch(battle, now)
  state.bumpRevision(battle)
  txApp.save(battle)
})

// ── POST /api/battles/{id}/rematch — play the same circuit again ─────────────

/**
 * Revancha (#357).
 *
 * Crea una batalla NUEVA con la misma configuración y no toca la original ni un byte: un
 * resultado es un registro de lo que pasó, y reutilizar la fila para una segunda ronda
 * destruiría la primera. De ahí salen gratis dos de los criterios del issue — la nueva
 * nace con `revision: 0` y con su propia identidad, así que los tokens viejos, que están
 * atados por hash al id de la batalla vieja, no pueden abrirla.
 *
 * La puede pedir CUALQUIER antiguo participante, no solo quien la creó: si "otra vez con
 * los mismos" dependiera del creador, una batalla cuyo creador ya no está sería un
 * callejón sin salida. Quien la pide se convierte en creador de la nueva.
 *
 * Se permite desde `cancelled` y `expired` además de `finished`. Una sala que caducó sin
 * llegar a empezar es el caso en el que más sentido tiene volver a intentarlo.
 */
var rematch = http.route({ guard: 'viewer', status: 201 }, function (ctx, txApp, source) {
  var sourceId = ctx.battleId

  if (!state.isTerminal(source.getString('status'))) {
    state.fail(409, 'battle_open', 'This battle has not finished yet')
  }

  // La respuesta de esta mutación es OTRA batalla, así que repetir la clave no puede
  // contestar con el snapshot de la de siempre: se devuelve la que creó el primer
  // toque. Sin esto, el segundo toque de un doble toque crearía una segunda batalla.
  if (!http.claimIdempotencyKey(txApp, sourceId, ctx.userId, 'rematch', ctx.body.idempotency_key)) {
    var stored = http.findMutationResponse(txApp, sourceId, ctx.body.idempotency_key)
    if (stored && stored.battle_id) {
      ctx.battleId = stored.battle_id
      ctx.extend.replayed = true
      return
    }
    state.fail(409, 'rematch_in_flight', 'A rematch for this battle is already being created')
  }

  var now = state.nowMs()
  var collection = txApp.findCollectionByNameOrId('battles')
  var battle = new Record(collection)
  battle.set('creator', ctx.userId)
  // Directo a `lobby`: `draft` existe para que el creador ajuste el circuito antes de
  // publicarlo, y una revancha ya sabe qué circuito es.
  battle.set('status', 'lobby')
  battle.set('config', state.jsonField(source, 'config', null))
  battle.set('revision', 0)
  battle.set('invite_expires_at', state.isoAt(now + state.INVITE_TTL_MS))
  state.touch(battle, now)
  txApp.save(battle)

  var battleId = battle.getString('id')
  ctx.battleId = battleId

  // Quien pide la revancha entrena también, igual que en `publish`.
  createSeat(txApp, battleId, ctx.userId, now)

  // Un token nominal por cabeza. Se emiten aquí, dentro de la transacción, para que
  // una revancha no pueda existir a medias — con batalla pero sin invitaciones.
  var recipients = notify.rematchRecipients(txApp, source, ctx.userId)
  var issuedInvites = []
  for (var i = 0; i < recipients.length; i++) {
    var issued = invites.issueInvite(txApp, battle, ctx.userId, now, recipients[i])
    issuedInvites.push({ userId: recipients[i], token: issued.token })
  }

  http.recordMutationResponse(txApp, sourceId, ctx.body.idempotency_key, { battle_id: battleId })

  // Fuera de la transacción y a prueba de fallos. En una repetición no se vuelve a
  // avisar: los tokens de la primera vez siguen vivos y mandar la push dos veces solo
  // duplicaría el aviso.
  if (issuedInvites.length > 0) {
    ctx.after = function (fresh) {
      notify.notifyBattleRematch($app, fresh, ctx.userId, issuedInvites)
    }
  }
})

module.exports = {
  snapshot: snapshot,
  publish: publish,
  issueInvite: issueInvite,
  revokeInvites: revokeInvites,
  publicInviteLanding: publicInviteLanding,
  join: join,
  ready: ready,
  start: start,
  progress: progress,
  finish: finish,
  leave: leave,
  cancel: cancel,
  rematch: rematch,
}
