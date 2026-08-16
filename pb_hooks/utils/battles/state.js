/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Base del dominio de batallas (#481): constantes de política, errores, fechas,
 * helpers de Record, carga, autorización, máquinas de estado, validación de
 * configuración, progreso y sincronización del lobby.
 *
 * Es la capa sin dependencias: el resto de `utils/battles/*` la requiere y este
 * módulo no requiere a nadie. Los consumidores externos no importan este archivo
 * directamente — entran por la fachada `utils/battles.js`, que re-exporta la
 * superficie completa de siempre.
 *
 * Las máquinas de estado son una transcripción deliberada de
 * `packages/core/lib/battle.ts`. El JSVM no puede importar TypeScript, así que
 * este es el único sitio donde el contrato está duplicado;
 * `tests/pb_hooks/battles.test.mjs` es lo que mantiene honestas las dos copias.
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
    // Empty until the battle closes, and empty forever on battles that closed before
    // #398 shipped — clients read that as "no stored result", not as an empty ranking.
    final_standings: jsonField(record, 'final_standings', null),
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

// ── Mutation plumbing ────────────────────────────────────────────────────────

function touch(battle, ms) {
  battle.set('last_activity_at', isoAt(ms))
}

function bumpRevision(battle) {
  battle.set('revision', battle.getInt('revision') + 1)
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

  lobbyParticipants: lobbyParticipants,
  countWithStatus: countWithStatus,
  syncLobbyStatus: syncLobbyStatus,

  touch: touch,
  bumpRevision: bumpRevision,
}
