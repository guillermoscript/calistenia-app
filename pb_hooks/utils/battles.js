/// <reference path="../../pb_data/types.d.ts" />

/**
 * Shared logic for the server-authoritative battle API (issue #356).
 *
 * Every route callback in `battle_api.pb.js` runs in an ISOLATED JSVM runtime and
 * cannot see top-level functions from that file, so all shared logic lives here and
 * each callback does `require(`${__hooks}/utils/battles.js`)` inside its own body.
 * See `pb_hooks/utils/notifications.js` for the same pattern and the incident that
 * produced it.
 *
 * The state machines below are a deliberate transcription of
 * `packages/core/lib/battle.ts`. The JSVM cannot import TypeScript, so this is the
 * one place where the contract is duplicated; `tests/pb_hooks/battles.test.mjs` is
 * what keeps the two copies honest.
 */

// ── Policy constants (documented in the spec, version 2) ─────────────────────

/** Invite links must survive a logged-out friend installing the app and signing up. */
var INVITE_TTL_MS = 24 * 60 * 60 * 1000
/** A lobby nobody touches for this long is swept to `expired`. */
var LOBBY_TTL_MS = 2 * 60 * 60 * 1000
/** Lead time between the creator pressing start and `starts_at`, for the countdown. */
var COUNTDOWN_LEAD_MS = 5000
/** A battle of one is just a circuit session, which the app already has. */
var MIN_READY_TO_START = 2

var BATTLE_STATUS_TRANSITIONS = {
  draft: ['lobby', 'cancelled'],
  lobby: ['ready', 'expired', 'cancelled'],
  ready: ['lobby', 'live', 'expired', 'cancelled'],
  live: ['finished', 'expired', 'cancelled'],
  finished: [],
  expired: [],
  cancelled: [],
}

var PARTICIPANT_TRANSITIONS = {
  invited: ['joined', 'left'],
  joined: ['ready', 'left'],
  ready: ['joined', 'active', 'left'],
  active: ['finished', 'left'],
  finished: [],
  left: [],
}

var TERMINAL_BATTLE_STATUSES = ['finished', 'expired', 'cancelled']

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * A refusal the route should turn into an HTTP response. Anything else escaping a
 * handler is a bug and becomes a 500.
 */
function ApiError(status, code, message) {
  this.status = status
  this.code = code
  this.message = message || code
  this.isBattleApiError = true
}

function fail(status, code, message) {
  throw new ApiError(status, code, message)
}

// ── Dates ────────────────────────────────────────────────────────────────────

/**
 * PocketBase stores datetimes as `2026-08-11 10:00:00.000Z`; `Date.parse` wants the
 * `T` separator. Returns 0 for empty/unparseable values so callers can treat "no
 * timestamp" and "bad timestamp" identically.
 */
function parseMs(raw) {
  if (!raw) return 0
  var s = String(raw).trim()
  if (!s) return 0
  s = s.replace(' ', 'T')
  if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
  var ms = Date.parse(s)
  return isNaN(ms) ? 0 : ms
}

function dateMs(record, field) {
  var raw = ''
  try { raw = record.getString(field) } catch (err) { raw = '' }
  return parseMs(raw)
}

function isoAt(ms) {
  return new Date(ms).toISOString()
}

/**
 * The same instant in PocketBase's *storage* format (`2026-08-11 10:00:00.000Z`).
 *
 * Only for values interpolated into a filter expression, never for JSON we return:
 * a filter compares against the stored text, and `isoAt`'s `T` separator makes that
 * comparison wrong for same-day rows — `' '` (0x20) sorts before `'T'` (0x54), so
 * every freshly written row reads as older than a `T`-separated cutoff. That silently
 * expired every lobby within one sweep of being created. `server_time` and the date
 * fields keep the `T` form, which is what `Date.parse` accepts on the client.
 */
function filterTime(ms) {
  return new Date(ms).toISOString().replace('T', ' ')
}

function nowMs() {
  return Date.now()
}

// ── Record helpers ───────────────────────────────────────────────────────────

/** `record.get()` on a json field returns raw bytes in goja — always go via getString. */
function jsonField(record, field, fallback) {
  var raw = ''
  try { raw = record.getString(field) } catch (err) { raw = '' }
  if (!raw) return fallback
  try {
    var parsed = JSON.parse(raw)
    return parsed === null || parsed === undefined ? fallback : parsed
  } catch (err) {
    return fallback
  }
}

function emptyProgress() {
  return {
    completed_rounds: 0,
    completed_reps: 0,
    completed_time_seconds: 0,
    current_exercise_position: null,
    last_activity_at: null,
  }
}

function serializeBattle(record) {
  return {
    id: record.getString('id'),
    creator: record.getString('creator'),
    status: record.getString('status'),
    config: jsonField(record, 'config', null),
    revision: record.getInt('revision'),
    invite_expires_at: record.getString('invite_expires_at') || null,
    invite_revoked_at: record.getString('invite_revoked_at') || null,
    starts_at: record.getString('starts_at') || null,
    ends_at: record.getString('ends_at') || null,
    finished_at: record.getString('finished_at') || null,
    last_activity_at: record.getString('last_activity_at') || null,
    created: record.getString('created'),
    updated: record.getString('updated'),
  }
}

function serializeParticipant(record) {
  return {
    id: record.getString('id'),
    battle: record.getString('battle'),
    user: record.getString('user') || null,
    status: record.getString('status'),
    progress: jsonField(record, 'progress', emptyProgress()),
    joined_at: record.getString('joined_at') || null,
    ready_at: record.getString('ready_at') || null,
    active_at: record.getString('active_at') || null,
    finished_at: record.getString('finished_at') || null,
    left_at: record.getString('left_at') || null,
    last_seen_at: record.getString('last_seen_at') || null,
    created: record.getString('created'),
    updated: record.getString('updated'),
  }
}

// ── Loading ──────────────────────────────────────────────────────────────────

function findBattle(app, battleId) {
  if (!battleId) fail(404, 'not_found', 'Battle not found')
  try {
    return app.findRecordById('battles', battleId)
  } catch (err) {
    fail(404, 'not_found', 'Battle not found')
  }
}

function findParticipants(app, battleId) {
  try {
    // No sort argument: `findRecordsByFilter` throws a GoError on an unknown sort
    // field, and a throw inside a try/catch here would look like "no participants".
    return app.findRecordsByFilter('battle_participants', 'battle = {:b}', '', 0, 0, { b: battleId })
  } catch (err) {
    return []
  }
}

function findParticipantForUser(app, battleId, userId) {
  if (!userId) return null
  try {
    return app.findFirstRecordByFilter(
      'battle_participants',
      'battle = {:b} && user = {:u}',
      { b: battleId, u: userId },
    )
  } catch (err) {
    return null
  }
}

// ── Authorization ────────────────────────────────────────────────────────────

function requireUserId(e) {
  var auth = e.auth
  var userId = auth ? auth.getString('id') : ''
  if (!userId) fail(401, 'unauthorized', 'Authentication required')
  return userId
}

function requireCreator(battle, userId) {
  if (battle.getString('creator') !== userId) {
    // Deliberately the same shape as "not found": a non-creator should not be able
    // to probe which battle ids exist.
    fail(403, 'forbidden', 'Not allowed')
  }
}

function requireViewer(app, battle, userId) {
  if (battle.getString('creator') === userId) return null
  var participant = findParticipantForUser(app, battle.getString('id'), userId)
  if (!participant) fail(403, 'forbidden', 'Not allowed')
  return participant
}

function requireParticipant(app, battle, userId) {
  var participant = findParticipantForUser(app, battle.getString('id'), userId)
  if (!participant) fail(403, 'forbidden', 'Not allowed')
  return participant
}

// ── Transitions ──────────────────────────────────────────────────────────────

function canTransitionBattle(from, to) {
  var allowed = BATTLE_STATUS_TRANSITIONS[from]
  return !!allowed && allowed.indexOf(to) !== -1
}

function assertBattleTransition(from, to) {
  if (!canTransitionBattle(from, to)) {
    fail(409, 'invalid_transition', 'Invalid battle transition: ' + from + ' -> ' + to)
  }
}

function canTransitionParticipant(from, to) {
  var allowed = PARTICIPANT_TRANSITIONS[from]
  return !!allowed && allowed.indexOf(to) !== -1
}

function assertParticipantTransition(from, to) {
  if (!canTransitionParticipant(from, to)) {
    fail(409, 'invalid_transition', 'Invalid participant transition: ' + from + ' -> ' + to)
  }
}

function isTerminal(status) {
  return TERMINAL_BATTLE_STATUSES.indexOf(status) !== -1
}

/** New invite acceptances are only allowed while the battle is still in lobby. */
function canAcceptJoin(status) {
  return status === 'lobby'
}

// ── Configuration validation (mirror of validateBattleConfiguration) ─────────

function validateConfiguration(config) {
  var errors = []
  if (!config || typeof config !== 'object') return ['configuration is required']
  if (typeof config.workout_template_id !== 'string' || !config.workout_template_id.trim()) {
    errors.push('workout_template_id is required')
  }
  if (!isInteger(config.rounds) || config.rounds < 1) errors.push('rounds must be a positive integer')
  if (config.scoring_mode !== 'rounds_then_reps_then_time') errors.push('unsupported scoring_mode')
  if (!Array.isArray(config.exercises) || config.exercises.length === 0) {
    errors.push('at least one exercise is required')
    return errors
  }

  var positions = []
  var exerciseIds = []
  for (var i = 0; i < config.exercises.length; i++) {
    var exercise = config.exercises[i] || {}
    if (!isInteger(exercise.position) || exercise.position < 0) {
      errors.push('invalid exercise position: ' + exercise.position)
    } else if (positions.indexOf(exercise.position) !== -1) {
      errors.push('duplicate exercise position: ' + exercise.position)
    } else {
      positions.push(exercise.position)
    }
    var exerciseId = typeof exercise.exercise_id === 'string' ? exercise.exercise_id.trim() : ''
    if (!exerciseId) errors.push('exercise_id is required')
    if (exerciseIds.indexOf(exerciseId) !== -1) errors.push('duplicate exercise_id: ' + exerciseId)
    exerciseIds.push(exerciseId)
    if (!isInteger(exercise.rest_seconds) || exercise.rest_seconds < 0) {
      errors.push('invalid rest_seconds for ' + exerciseId)
    }
    var target = exercise.target || {}
    if (target.kind !== 'reps' && target.kind !== 'seconds') {
      errors.push('invalid target kind for ' + exerciseId)
    }
    if (!isInteger(target.value) || target.value <= 0) {
      errors.push('invalid target for ' + exerciseId)
    }
  }
  var ordered = positions.slice().sort(function (a, b) { return a - b })
  for (var j = 0; j < ordered.length; j++) {
    if (ordered[j] !== j) {
      errors.push('exercise positions must be contiguous from 0')
      break
    }
  }
  return errors
}

function isInteger(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value
}

// ── Progress ─────────────────────────────────────────────────────────────────

function toCount(value) {
  if (typeof value !== 'number' || !isFinite(value)) return null
  if (value < 0) return null
  return Math.floor(value)
}

/**
 * Validate a client-asserted progress payload against the battle configuration and
 * the participant's previous progress.
 *
 * Progress is client-asserted by design (no rep-counting AI in the MVP), so the
 * server's job is consistency, not truth: never negative, never going backwards,
 * never more rounds than the circuit has, and always a real exercise position.
 */
function nextProgress(config, previous, incoming) {
  if (!incoming || typeof incoming !== 'object') fail(400, 'invalid_progress', 'progress is required')

  var rounds = toCount(incoming.completed_rounds)
  var reps = toCount(incoming.completed_reps)
  var seconds = toCount(incoming.completed_time_seconds)
  if (rounds === null || reps === null || seconds === null) {
    fail(400, 'invalid_progress', 'progress values must be non-negative numbers')
  }

  var prev = previous || emptyProgress()
  if (rounds < (prev.completed_rounds || 0) ||
      reps < (prev.completed_reps || 0) ||
      seconds < (prev.completed_time_seconds || 0)) {
    fail(409, 'progress_regression', 'progress cannot decrease')
  }

  var maxRounds = config && isInteger(config.rounds) ? config.rounds : 0
  if (maxRounds > 0 && rounds > maxRounds) {
    fail(400, 'invalid_progress', 'completed_rounds exceeds the configured rounds')
  }

  var exerciseCount = config && Array.isArray(config.exercises) ? config.exercises.length : 0
  var position = incoming.current_exercise_position
  if (position === null || position === undefined) {
    position = null
  } else {
    var normalized = toCount(position)
    if (normalized === null || normalized >= exerciseCount) {
      fail(400, 'invalid_progress', 'current_exercise_position is not a valid exercise')
    }
    position = normalized
  }

  return {
    completed_rounds: rounds,
    completed_reps: reps,
    completed_time_seconds: seconds,
    current_exercise_position: position,
    last_activity_at: isoAt(nowMs()),
  }
}

// ── Scoring (mirror of createBattleScore / compareBattleScores) ───────────────

function scoreFor(participant) {
  var progress = jsonField(participant, 'progress', emptyProgress())
  var finishedAt = participant.getString('finished_at') || null
  return {
    completed_rounds: Math.floor(progress.completed_rounds || 0),
    completed_reps: Math.floor(progress.completed_reps || 0),
    completed_time_seconds: Math.floor(progress.completed_time_seconds || 0),
    finished_at: finishedAt,
    // The tie-break key is the participant record id: server-assigned, stable across
    // reconnects, and not a display name. Last resort only — see compareScores.
    tie_break_key: participant.getString('id'),
  }
}

/** Negative when `a` ranks ahead of `b`. Mirrors `compareBattleScores` in core. */
function compareScores(a, b) {
  if (a.completed_rounds !== b.completed_rounds) return b.completed_rounds - a.completed_rounds
  if (a.completed_reps !== b.completed_reps) return b.completed_reps - a.completed_reps
  if (a.completed_time_seconds !== b.completed_time_seconds) {
    return b.completed_time_seconds - a.completed_time_seconds
  }

  // Equal work is settled by who finished first: a battle is a race, and the two
  // all-reps circuits otherwise tie on every real component and fall through to the
  // record id, which is arbitrary (#387).
  var aFinished = parseMs(a.finished_at) || null
  var bFinished = parseMs(b.finished_at) || null
  if (aFinished !== bFinished) {
    if (aFinished === null) return 1
    if (bFinished === null) return -1
    return aFinished - bFinished
  }

  return a.tie_break_key < b.tie_break_key ? -1 : a.tie_break_key > b.tie_break_key ? 1 : 0
}

/**
 * Ranked standings. `left` participants keep a score and a rank so a battle result is
 * stable for everyone who took part, not only those who finished.
 */
function standingsFor(participantRecords, nameByUser) {
  var scored = []
  for (var i = 0; i < participantRecords.length; i++) {
    var user = participantRecords[i].getString('user') || null
    scored.push({
      participant_id: participantRecords[i].getString('id'),
      user: user,
      display_name: (nameByUser && user && nameByUser[user]) || '',
      status: participantRecords[i].getString('status'),
      score: scoreFor(participantRecords[i]),
    })
  }
  scored.sort(function (a, b) { return compareScores(a.score, b.score) })
  for (var j = 0; j < scored.length; j++) scored[j].rank = j + 1
  return scored
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

/**
 * Minimal public profile for a participant.
 *
 * Needed because `battle_participants.listRule` only lets a user read their OWN row
 * (plus the creator reading all), so a joiner cannot look the others up through the
 * collection API. Only `display_name` — enough to render a lobby, and nothing that is
 * not already visible on a public profile. The invite landing does NOT go through
 * here: nobody learns who is in a lobby before they join it.
 */
function displayNameFor(app, userId) {
  if (!userId) return ''
  try {
    return app.findRecordById('users', userId).getString('display_name') || ''
  } catch (err) {
    return ''
  }
}

// ── Notificaciones ───────────────────────────────────────────────────────────

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
    )
  } catch (err) {
    console.log('[battle_api] notify join failed:', err)
  }
}

function notifyBattleStart(app, battle, actorId) {
  try {
    var notifications = require(`${__hooks}/utils/notifications.js`)
    var battleId = battle.getString('id')
    var participants = findParticipants(app, battleId)
    for (var i = 0; i < participants.length; i++) {
      var userId = participants[i].getString('user')
      // Nunca al que pulsó empezar: ya está mirando la pantalla.
      if (!userId || userId === actorId) continue
      notifications.createNotification(
        userId, 'challenge_join', actorId, battleId, 'battle', { battle_id: battleId, kind: 'battle_start' },
      )
      notifications.sendPush(
        userId,
        'La batalla empieza',
        'Tu batalla arranca ahora',
        '/battle/' + battleId,
        'challenge_join',
      )
    }
  } catch (err) {
    console.log('[battle_api] notify start failed:', err)
  }
}

function snapshotOf(app, battle, userId) {
  var battleId = battle.getString('id')
  var participants = findParticipants(app, battleId)
  var serialized = []
  var mine = null
  var nameByUser = {}
  for (var i = 0; i < participants.length; i++) {
    var row = serializeParticipant(participants[i])
    row.display_name = displayNameFor(app, row.user)
    if (row.user) nameByUser[row.user] = row.display_name
    serialized.push(row)
    if (userId && row.user === userId) mine = row
  }
  return {
    battle: serializeBattle(battle),
    participants: serialized,
    me: mine,
    standings: standingsFor(participants, nameByUser),
    // Clients derive the countdown from this and their measured offset, never from
    // the device clock.
    server_time: isoAt(nowMs()),
  }
}

// ── Mutation plumbing ────────────────────────────────────────────────────────

function touch(battle, ms) {
  battle.set('last_activity_at', isoAt(ms))
}

function bumpRevision(battle) {
  battle.set('revision', battle.getInt('revision') + 1)
}

/**
 * Idempotency ledger. Returns false when this `(battle, key)` pair already ran, in
 * which case the caller must skip its side effects and return the CURRENT snapshot —
 * replaying a stored snapshot would hand the client stale state, which is exactly what
 * the reconnect contract forbids.
 *
 * Progress writes deliberately skip this: they are already idempotent because the
 * monotonic clamp makes a replayed value a no-op, and a ledger row per progress tick
 * would grow without bound.
 */
function claimIdempotencyKey(txApp, battleId, userId, endpoint, key) {
  if (!key) return true
  if (typeof key !== 'string' || key.length > 128) {
    fail(400, 'invalid_idempotency_key', 'idempotency_key must be a string of at most 128 characters')
  }
  try {
    var existing = txApp.findFirstRecordByFilter(
      'battle_mutations',
      'battle = {:b} && mutation_key = {:k}',
      { b: battleId, k: key },
    )
    if (existing) return false
  } catch (err) { /* no previous claim */ }

  var collection = txApp.findCollectionByNameOrId('battle_mutations')
  var record = new Record(collection)
  record.set('battle', battleId)
  record.set('user', userId)
  record.set('mutation_key', key)
  record.set('endpoint', endpoint)
  record.set('response', {})
  txApp.save(record)
  return true
}

/**
 * Lazy lobby expiry. The cron is the primary sweep, but a `cronAdd` callback that
 * throws dies silently in the JSVM — that is how the reminder crons stayed broken for
 * months — so the read path must not depend on it having run.
 */
function expireIfStale(app, battle) {
  var status = battle.getString('status')
  if (status !== 'draft' && status !== 'lobby' && status !== 'ready') return false
  var last = dateMs(battle, 'last_activity_at') || parseMs(battle.getString('created'))
  if (!last) return false
  if (nowMs() - last < LOBBY_TTL_MS) return false

  battle.set('status', 'expired')
  bumpRevision(battle)
  app.save(battle)
  return true
}

// ── Invites ──────────────────────────────────────────────────────────────────

function hashToken(token) {
  return $security.sha256(String(token))
}

/**
 * Invite tokens are single-use on purpose: a link that leaks out of the group chat can
 * burn at most one seat. The lobby UI issues a fresh token on every share, so the
 * creator experience is still "tap share, send a link".
 */
function issueInvite(txApp, battle, creatorId, ms) {
  var token = $security.randomString(40)
  var collection = txApp.findCollectionByNameOrId('battle_invites')
  var record = new Record(collection)
  record.set('battle', battle.getString('id'))
  record.set('created_by', creatorId)
  record.set('token_hash', hashToken(token))
  record.set('status', 'active')
  record.set('expires_at', isoAt(ms + INVITE_TTL_MS))
  txApp.save(record)
  // The raw token is returned to the caller and never stored, logged or tracked.
  return { token: token, record: record }
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
 * Why an invite cannot be used right now, or an empty string if it can.
 *
 * The reasons are deliberately coarse (`invalid` / `expired` / `closed`) and never
 * mention who else is in the lobby: an attacker holding a guessed token must not learn
 * anything about the participants from the landing endpoint.
 */
function inviteRejection(app, invite) {
  if (!invite) return 'invalid'
  var status = invite.getString('status')
  if (status === 'revoked') return 'invalid'
  if (status === 'consumed') return 'invalid'
  if (status !== 'active') return 'invalid'
  if (dateMs(invite, 'expires_at') <= nowMs()) return 'expired'

  var battle
  try {
    battle = app.findRecordById('battles', invite.getString('battle'))
  } catch (err) {
    return 'invalid'
  }
  if (dateMs(battle, 'invite_revoked_at')) return 'invalid'
  if (!canAcceptJoin(battle.getString('status'))) return 'closed'
  return ''
}

// ── Lobby readiness ──────────────────────────────────────────────────────────

/** Participants still in the lobby, i.e. not `left` and not yet `active`/`finished`. */
function lobbyParticipants(participants) {
  var out = []
  for (var i = 0; i < participants.length; i++) {
    var status = participants[i].getString('status')
    if (status === 'joined' || status === 'ready' || status === 'invited') out.push(participants[i])
  }
  return out
}

function countWithStatus(participants, status) {
  var n = 0
  for (var i = 0; i < participants.length; i++) {
    if (participants[i].getString('status') === status) n++
  }
  return n
}

/**
 * Keep the battle's lobby/ready status in sync with the participants. Everyone in the
 * lobby ready and at least MIN_READY_TO_START of them → `ready`; anyone un-ready →
 * back to `lobby`.
 */
function syncLobbyStatus(txApp, battle, participants) {
  var status = battle.getString('status')
  if (status !== 'lobby' && status !== 'ready') return false

  var inLobby = lobbyParticipants(participants)
  var readyCount = countWithStatus(inLobby, 'ready')
  var allReady = inLobby.length > 0 && readyCount === inLobby.length && readyCount >= MIN_READY_TO_START

  if (allReady && status === 'lobby') {
    battle.set('status', 'ready')
    return true
  }
  if (!allReady && status === 'ready') {
    battle.set('status', 'lobby')
    return true
  }
  return false
}

// ── Request bodies ───────────────────────────────────────────────────────────

function readBody(e) {
  try {
    var info = e.requestInfo()
    return (info && info.body) || {}
  } catch (err) {
    return {}
  }
}

/**
 * Run `fn` in a transaction without losing the refusal that aborted it.
 *
 * A JS exception thrown inside `runInTransaction` crosses the Go boundary and comes
 * back out as a generic error, which would turn every deliberate 403/409 into a 500.
 * So the callback catches its own error, stashes it, and throws a plain marker purely
 * to force the rollback; the real refusal is re-thrown here, on the JS side, intact.
 */
function runGuarded(app, fn) {
  var captured = null
  try {
    app.runInTransaction(function (txApp) {
      try {
        fn(txApp)
      } catch (err) {
        captured = err && err.isBattleApiError ? err : toApiError(err)
        throw new Error('battle_api_rollback')
      }
    })
  } catch (err) {
    if (!captured) {
      captured = toApiError(err)
    }
  }
  if (captured) throw captured
}

function toApiError(err) {
  var message = err && err.message ? String(err.message) : String(err)
  // A unique-index violation is what two devices racing the same join look like.
  if (/UNIQUE constraint failed/i.test(message)) {
    return new ApiError(409, 'conflict', 'This action was already applied')
  }
  console.log('[battle_api] unexpected transaction error:', message)
  return new ApiError(500, 'internal_error', 'Unexpected server error')
}

/**
 * Turn a refusal into its HTTP response. Anything that is not an ApiError is an
 * unexpected failure: log it (a swallowed error here would be indistinguishable from
 * a working endpoint) and return a generic 500 rather than leaking internals.
 */
function respondError(e, err) {
  if (err && err.isBattleApiError) {
    return e.json(err.status, { error: err.code, message: err.message })
  }
  console.log("[battle_api] unhandled error:", err)
  return e.json(500, { error: "internal_error", message: "Unexpected server error" })
}

module.exports = {
  INVITE_TTL_MS: INVITE_TTL_MS,
  LOBBY_TTL_MS: LOBBY_TTL_MS,
  COUNTDOWN_LEAD_MS: COUNTDOWN_LEAD_MS,
  MIN_READY_TO_START: MIN_READY_TO_START,
  BATTLE_STATUS_TRANSITIONS: BATTLE_STATUS_TRANSITIONS,
  PARTICIPANT_TRANSITIONS: PARTICIPANT_TRANSITIONS,

  ApiError: ApiError,
  fail: fail,

  parseMs: parseMs,
  dateMs: dateMs,
  isoAt: isoAt,
  filterTime: filterTime,
  notifyBattleJoin: notifyBattleJoin,
  notifyBattleStart: notifyBattleStart,
  nowMs: nowMs,

  jsonField: jsonField,
  emptyProgress: emptyProgress,
  serializeBattle: serializeBattle,
  serializeParticipant: serializeParticipant,

  findBattle: findBattle,
  findParticipants: findParticipants,
  findParticipantForUser: findParticipantForUser,

  requireUserId: requireUserId,
  requireCreator: requireCreator,
  requireViewer: requireViewer,
  requireParticipant: requireParticipant,

  canTransitionBattle: canTransitionBattle,
  assertBattleTransition: assertBattleTransition,
  canTransitionParticipant: canTransitionParticipant,
  assertParticipantTransition: assertParticipantTransition,
  isTerminal: isTerminal,
  canAcceptJoin: canAcceptJoin,

  validateConfiguration: validateConfiguration,
  nextProgress: nextProgress,
  scoreFor: scoreFor,
  compareScores: compareScores,
  standingsFor: standingsFor,

  displayNameFor: displayNameFor,
  snapshotOf: snapshotOf,
  touch: touch,
  bumpRevision: bumpRevision,
  claimIdempotencyKey: claimIdempotencyKey,
  expireIfStale: expireIfStale,

  hashToken: hashToken,
  issueInvite: issueInvite,
  findInviteByToken: findInviteByToken,
  inviteRejection: inviteRejection,

  lobbyParticipants: lobbyParticipants,
  countWithStatus: countWithStatus,
  syncLobbyStatus: syncLobbyStatus,

  readBody: readBody,
  respondError: respondError,
  runGuarded: runGuarded,
}
