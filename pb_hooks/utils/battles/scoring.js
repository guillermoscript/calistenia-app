/// <reference path="../../../pb_data/types.d.ts" />

/**
 * Scoring y lecturas derivadas de una batalla (#481): puntuación, clasificación,
 * sellado del resultado, snapshot y expiración perezosa.
 *
 * Los nombres públicos salen de `utils/notifications.js#getUserNames` — la única
 * resolución de display name del backend — y en LOTE: una query por snapshot en
 * vez del `findRecordById('users')` por participante que hacía cada mutación y
 * cada tick de `/snapshot` (el N+1 de la auditoría 2026-08-15, F8).
 */

var state = require(`${__hooks}/utils/battles/state.js`)

// ── Scoring (mirror of createBattleScore / compareBattleScores) ───────────────

function scoreFor(participant) {
  var progress = state.jsonField(participant, 'progress', state.emptyProgress())
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
  var aFinished = state.parseMs(a.finished_at) || null
  var bFinished = state.parseMs(b.finished_at) || null
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

  var progress = state.jsonField(participant, 'progress', state.emptyProgress())
  var position = progress.current_exercise_position
  if (position === null || position === undefined) return null

  // Before the first confirmation there is no rest to be in: the progress row is seeded
  // with a timestamp at join time, and reading rest off that would show everyone resting
  // the moment the battle starts.
  var didAnything = (progress.completed_rounds || 0) > 0
    || (progress.completed_reps || 0) > 0
    || (progress.completed_time_seconds || 0) > 0
  if (!didAnything) return null

  var since = state.parseMs(progress.last_activity_at)
  if (!since) return null

  var previous = exercises[(position - 1 + exercises.length) % exercises.length]
  var restSeconds = Math.floor((previous && previous.rest_seconds) || 0)
  if (restSeconds <= 0) return null

  var until = since + restSeconds * 1000
  return until > state.nowMs() ? state.isoAt(until) : null
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
    var progress = state.jsonField(participantRecords[i], 'progress', state.emptyProgress())
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

// ── Display names ─────────────────────────────────────────────────────────────

/**
 * Nombres públicos de un conjunto de participantes, en UNA query.
 *
 * Delegado en `utils/notifications.js#getUserNames` a propósito: la auditoría
 * encontró dos resoluciones de display name distintas (batallas usaba solo
 * `display_name`; los avisos, `display_name || name`) y esta es la unificación.
 * `name` ya se muestra a otros usuarios en cada push social, así que no expone
 * nada que no fuera visible.
 */
function displayNamesFor(app, userIds) {
  var notifications = require(`${__hooks}/utils/notifications.js`)
  return notifications.getUserNames(userIds, app)
}

/**
 * Minimal public profile for a participant.
 *
 * Needed because `battle_participants.listRule` only lets a user read their OWN row
 * (plus the creator reading all), so a joiner cannot look the others up through the
 * collection API. Only the public name — enough to render a lobby, and nothing that is
 * not already visible on a public profile. The invite landing does NOT go through
 * here: nobody learns who is in a lobby before they join it.
 */
function displayNameFor(app, userId) {
  if (!userId) return ''
  return displayNamesFor(app, [userId])[userId] || ''
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
  var existing = state.jsonField(battle, 'final_standings', null)
  if (existing && existing.length) return

  var records = participantRecords || state.findParticipants(app, battle.getString('id'))
  var ids = []
  for (var i = 0; i < records.length; i++) {
    var user = records[i].getString('user')
    if (user) ids.push(user)
  }
  var nameByUser = displayNamesFor(app, ids)
  battle.set('final_standings', standingsFor(records, nameByUser, state.jsonField(battle, 'config', null)))
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

function snapshotOf(app, battle, userId) {
  var battleId = battle.getString('id')
  var participants = state.findParticipants(app, battleId)

  var ids = []
  for (var i = 0; i < participants.length; i++) {
    var uid = participants[i].getString('user')
    if (uid) ids.push(uid)
  }
  var nameByUser = displayNamesFor(app, ids)

  var serialized = []
  var mine = null
  for (var j = 0; j < participants.length; j++) {
    var row = state.serializeParticipant(participants[j])
    row.display_name = (row.user && nameByUser[row.user]) || ''
    serialized.push(row)
    if (userId && row.user === userId) mine = row
  }
  return {
    battle: state.serializeBattle(battle),
    participants: serialized,
    me: mine,
    standings: standingsFor(participants, nameByUser, state.jsonField(battle, 'config', null)),
    // Clients derive the countdown from this and their measured offset, never from
    // the device clock.
    server_time: state.isoAt(state.nowMs()),
  }
}

// ── Lazy expiry ──────────────────────────────────────────────────────────────

/**
 * Lazy lobby expiry. The cron is the primary sweep, but a `cronAdd` callback that
 * throws dies silently in the JSVM — that is how the reminder crons stayed broken for
 * months — so the read path must not depend on it having run.
 */
function expireIfStale(app, battle) {
  var status = battle.getString('status')
  if (status !== 'draft' && status !== 'lobby' && status !== 'ready') return false
  var last = state.dateMs(battle, 'last_activity_at') || state.parseMs(battle.getString('created'))
  if (!last) return false
  if (state.nowMs() - last < state.LOBBY_TTL_MS) return false

  battle.set('status', 'expired')
  sealFinalStandings(app, battle, null)
  state.bumpRevision(battle)
  app.save(battle)
  return true
}

module.exports = {
  scoreFor: scoreFor,
  compareScores: compareScores,
  restingUntilFor: restingUntilFor,
  standingsFor: standingsFor,
  displayNameFor: displayNameFor,
  displayNamesFor: displayNamesFor,
  sealFinalStandings: sealFinalStandings,
  snapshotOf: snapshotOf,
  expireIfStale: expireIfStale,
}
