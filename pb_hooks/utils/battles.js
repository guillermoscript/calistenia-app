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
 * When a participant's rest ends, or null if they are not resting (#397).
 *
 * Derived, never stored and never accepted from a request body. The server already holds
 * everything it needs: which exercise they moved on to, when they confirmed it, and how
 * long the rest after the exercise before it lasts. Anything the client asserted about
 * its own rest would be something it could lie about to look busy while standing still.
 *
 * `current_exercise_position` points at what comes NEXT, so the rest that is running now
 * belongs to the exercise before it — wrapping round to the last one between rounds.
 */
function restingUntilFor(participant, config) {
  if (participant.getString('status') !== 'active') return null

  var exercises = config && Array.isArray(config.exercises) ? config.exercises : []
  if (!exercises.length) return null

  var progress = jsonField(participant, 'progress', emptyProgress())
  var position = progress.current_exercise_position
  if (position === null || position === undefined) return null

  // Before the first confirmation there is no rest to be in: the progress row is seeded
  // with a timestamp at join time, and reading rest off that would show everyone resting
  // the moment the battle starts.
  var didAnything = (progress.completed_rounds || 0) > 0
    || (progress.completed_reps || 0) > 0
    || (progress.completed_time_seconds || 0) > 0
  if (!didAnything) return null

  var since = parseMs(progress.last_activity_at)
  if (!since) return null

  var previous = exercises[(position - 1 + exercises.length) % exercises.length]
  var restSeconds = Math.floor((previous && previous.rest_seconds) || 0)
  if (restSeconds <= 0) return null

  var until = since + restSeconds * 1000
  return until > nowMs() ? isoAt(until) : null
}

/**
 * Ranked standings. `left` participants keep a score and a rank so a battle result is
 * stable for everyone who took part, not only those who finished.
 *
 * Each row also carries where that participant is right now, so the live board can say
 * "resting, 12s" instead of leaving a stalled counter that reads the same as someone who
 * quietly gave up (#397).
 */
function standingsFor(participantRecords, nameByUser, config) {
  var scored = []
  for (var i = 0; i < participantRecords.length; i++) {
    var user = participantRecords[i].getString('user') || null
    var progress = jsonField(participantRecords[i], 'progress', emptyProgress())
    var position = progress.current_exercise_position
    scored.push({
      participant_id: participantRecords[i].getString('id'),
      user: user,
      display_name: (nameByUser && user && nameByUser[user]) || '',
      status: participantRecords[i].getString('status'),
      score: scoreFor(participantRecords[i]),
      current_exercise_position: position === undefined ? null : position,
      last_activity_at: progress.last_activity_at || null,
      resting_until: restingUntilFor(participantRecords[i], config),
    })
  }
  scored.sort(function (a, b) { return compareScores(a.score, b.score) })
  for (var j = 0; j < scored.length; j++) scored[j].rank = j + 1
  return scored
}

/**
 * Freeze the ranking onto the battle as it closes (#398).
 *
 * A closed battle is immutable, so its result is stored once instead of rebuilt on every
 * read. That is not only about cost: a joiner cannot rebuild it at all, because the
 * participants read rule limits them to their own row — without this they would see a
 * ranking of one. Display names are frozen with it on purpose, so a past result reads
 * the way it read on the day rather than following later renames.
 *
 * Called from every path that closes a battle. Never overwrites: a result is written
 * once, and a second close (a replayed idempotent call, a cron racing a read) must not
 * be able to rewrite history.
 */
function sealFinalStandings(app, battle, participantRecords) {
  // NOT `getString(...)`: an empty json field reads back as the string "null", which is
  // truthy, so a truthiness check here silently sealed nothing at all.
  var existing = jsonField(battle, 'final_standings', null)
  if (existing && existing.length) return

  var records = participantRecords || findParticipants(app, battle.getString('id'))
  var nameByUser = {}
  for (var i = 0; i < records.length; i++) {
    var user = records[i].getString('user')
    if (user) nameByUser[user] = displayNameFor(app, user)
  }
  battle.set('final_standings', standingsFor(records, nameByUser, jsonField(battle, 'config', null)))
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
      joinerId,
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
        actorId,
      )
    }
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
  var participants = findParticipants(app, battle.getString('id'))
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
    standings: standingsFor(participants, nameByUser, jsonField(battle, 'config', null)),
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
 * Guardar el resultado de una mutación en su fila del ledger (#357).
 *
 * El resto de endpoints no lo necesitan: su respuesta es el snapshot de ESTA batalla, y
 * al reintentar se recalcula fresco — que es justo lo que exige el contrato de
 * reconexión. La revancha es la excepción, porque su respuesta es una batalla DISTINTA:
 * sin guardar cuál, el segundo toque no tiene forma de saber a dónde ir salvo creando
 * otra, que es exactamente lo que la clave de idempotencia existe para impedir.
 */
function recordMutationResponse(txApp, battleId, key, payload) {
  if (!key) return
  try {
    var row = txApp.findFirstRecordByFilter(
      'battle_mutations',
      'battle = {:b} && mutation_key = {:k}',
      { b: battleId, k: key },
    )
    if (!row) return
    row.set('response', payload)
    txApp.save(row)
  } catch (err) {
    // El ledger ya impidió la doble ejecución; no poder anotar la respuesta degrada la
    // repetición pero no puede tumbar una mutación que ya ocurrió.
    console.log('[battle_api] could not record mutation response:', err)
  }
}

/** Lo guardado por `recordMutationResponse`, o `null` si no hay nada legible. */
function findMutationResponse(app, battleId, key) {
  if (!key) return null
  try {
    var row = app.findFirstRecordByFilter(
      'battle_mutations',
      'battle = {:b} && mutation_key = {:k}',
      { b: battleId, k: key },
    )
    if (!row) return null
    return jsonField(row, 'response', null)
  } catch (err) {
    return null
  }
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
  sealFinalStandings(app, battle, null)
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
function issueInvite(txApp, battle, creatorId, ms, inviteeUserId) {
  var token = $security.randomString(40)
  var collection = txApp.findCollectionByNameOrId('battle_invites')
  var record = new Record(collection)
  record.set('battle', battle.getString('id'))
  record.set('created_by', creatorId)
  record.set('token_hash', hashToken(token))
  record.set('status', 'active')
  record.set('expires_at', isoAt(ms + INVITE_TTL_MS))
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

  var participants = findParticipants(app, battle.getString('id'))
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
  notifyBattleRematch: notifyBattleRematch,
  rematchRecipients: rematchRecipients,
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
  sealFinalStandings: sealFinalStandings,
  snapshotOf: snapshotOf,
  touch: touch,
  bumpRevision: bumpRevision,
  claimIdempotencyKey: claimIdempotencyKey,
  recordMutationResponse: recordMutationResponse,
  findMutationResponse: findMutationResponse,
  expireIfStale: expireIfStale,

  hashToken: hashToken,
  issueInvite: issueInvite,
  findInviteByToken: findInviteByToken,
  inviteRejection: inviteRejection,
  inviteBindingRejects: inviteBindingRejects,
  battleHasBlockWith: battleHasBlockWith,

  lobbyParticipants: lobbyParticipants,
  countWithStatus: countWithStatus,
  syncLobbyStatus: syncLobbyStatus,

  readBody: readBody,
  respondError: respondError,
  runGuarded: runGuarded,
}
