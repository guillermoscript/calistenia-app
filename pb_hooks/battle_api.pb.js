/// <reference path="../pb_data/types.d.ts" />

/**
 * Server-authoritative battle API (issue #356).
 *
 * The #355 contract (`pb_migrations/1782800000_created_battles.js`) gives clients
 * exactly one write: create a `draft` battle. Every other mutation has a `null` API
 * rule and can only happen here, where we can authenticate the caller, re-check the
 * transition table inside the same transaction as the write, set every timestamp
 * server-side, and increment `revision` so realtime subscribers can detect gaps.
 *
 * JSVM rules that this file obeys and you must too (see tests/pb_hooks/README.md):
 *   - Each callback runs in an ISOLATED runtime. It cannot see top-level functions
 *     from this file, so every handler `require`s `utils/battles.js` in its own body.
 *   - `record.get()` on a json field returns bytes; always `getString()` + JSON.parse.
 *   - `record.getId()` does not exist; use `getString("id")`.
 *   - A ReferenceError inside a cron callback dies SILENTLY.
 *
 * Token handling: the raw invite token is returned to the creator exactly once and is
 * never stored (only `sha256(token)`), never logged, and never sent to analytics. The
 * lookup and join endpoints are POSTs specifically so the token travels in a request
 * body rather than in a URL path, which PocketBase writes to its request log.
 */

console.log("[battle_api] hook file loaded")

// ── Guard: validate the one client-writable operation ────────────────────────

/**
 * The createRule already pins `status = "draft"`, `revision = 0` and forbids the
 * server-owned timestamps. What it cannot do is validate the config JSON, so a draft
 * with a nonsense circuit would only blow up later, at start time, in front of a lobby
 * full of people. Reject it at creation instead.
 */
onRecordCreate(function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  var config = battles.jsonField(e.record, "config", null)
  var errors = battles.validateConfiguration(config)
  if (errors.length > 0) {
    throw new BadRequestError("Invalid battle configuration: " + errors.join("; "))
  }
  e.record.set("last_activity_at", battles.isoAt(battles.nowMs()))
  e.next()
}, "battles")

// ── GET /api/battles/{id}/snapshot ───────────────────────────────────────────

routerAdd("GET", "/api/battles/{id}/snapshot", function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  try {
    var userId = battles.requireUserId(e)
    var battle = battles.findBattle($app, e.request.pathValue("id"))
    battles.requireViewer($app, battle, userId)
    battles.expireIfStale($app, battle)
    return e.json(200, battles.snapshotOf($app, battle, userId))
  } catch (err) {
    return battles.respondError(e, err)
  }
}, $apis.requireAuth())

// ── POST /api/battles/{id}/publish — draft → lobby ───────────────────────────

routerAdd("POST", "/api/battles/{id}/publish", function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  try {
    var userId = battles.requireUserId(e)
    var battleId = e.request.pathValue("id")
    var body = battles.readBody(e)
    var result = null

    battles.runGuarded($app, function (txApp) {
      var battle = battles.findBattle(txApp, battleId)
      battles.requireCreator(battle, userId)

      if (!battles.claimIdempotencyKey(txApp, battleId, userId, "publish", body.idempotency_key)) {
        result = { replayed: true }
        return
      }

      battles.assertBattleTransition(battle.getString("status"), "lobby")

      var now = battles.nowMs()
      battle.set("status", "lobby")
      battle.set("invite_expires_at", battles.isoAt(now + battles.INVITE_TTL_MS))
      battles.touch(battle, now)
      battles.bumpRevision(battle)
      txApp.save(battle)

      // The creator is a participant like everyone else — they train too.
      if (!battles.findParticipantForUser(txApp, battleId, userId)) {
        var collection = txApp.findCollectionByNameOrId("battle_participants")
        var participant = new Record(collection)
        participant.set("battle", battleId)
        participant.set("user", userId)
        participant.set("status", "joined")
        participant.set("progress", battles.emptyProgress())
        participant.set("joined_at", battles.isoAt(now))
        participant.set("last_seen_at", battles.isoAt(now))
        txApp.save(participant)
      }
    })

    var fresh = battles.findBattle($app, battleId)
    var snapshot = battles.snapshotOf($app, fresh, userId)
    if (result && result.replayed) snapshot.replayed = true
    return e.json(200, snapshot)
  } catch (err) {
    return battles.respondError(e, err)
  }
}, $apis.requireAuth())

// ── POST /api/battles/{id}/invites — issue a single-use token ────────────────

routerAdd("POST", "/api/battles/{id}/invites", function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  try {
    var userId = battles.requireUserId(e)
    var battleId = e.request.pathValue("id")
    var issued = null

    battles.runGuarded($app, function (txApp) {
      var battle = battles.findBattle(txApp, battleId)
      battles.requireCreator(battle, userId)
      if (!battles.canAcceptJoin(battle.getString("status"))) {
        battles.fail(409, "lobby_closed", "The lobby is not accepting new participants")
      }

      var now = battles.nowMs()
      // Re-issuing after a revoke reopens invitations; otherwise the battle would be
      // permanently uninvitable once the creator revoked once.
      battle.set("invite_revoked_at", "")
      battle.set("invite_expires_at", battles.isoAt(now + battles.INVITE_TTL_MS))
      battles.touch(battle, now)
      txApp.save(battle)

      issued = battles.issueInvite(txApp, battle, userId, now)
    })

    // Deliberately NOT idempotency-keyed: a spare token is harmless (single-use,
    // expiring) whereas replaying this call could only ever return a null token,
    // since the raw value is never stored.
    return e.json(201, {
      token: issued.token,
      invite_id: issued.record.getString("id"),
      expires_at: issued.record.getString("expires_at"),
    })
  } catch (err) {
    return battles.respondError(e, err)
  }
}, $apis.requireAuth())

// ── POST /api/battles/{id}/invites/revoke ────────────────────────────────────

routerAdd("POST", "/api/battles/{id}/invites/revoke", function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  try {
    var userId = battles.requireUserId(e)
    var battleId = e.request.pathValue("id")
    var revoked = 0

    battles.runGuarded($app, function (txApp) {
      var battle = battles.findBattle(txApp, battleId)
      battles.requireCreator(battle, userId)

      var outstanding = []
      try {
        outstanding = txApp.findRecordsByFilter(
          "battle_invites",
          "battle = {:b} && status = 'active'",
          "", 0, 0, { b: battleId },
        )
      } catch (err) { outstanding = [] }

      var now = battles.nowMs()
      for (var i = 0; i < outstanding.length; i++) {
        outstanding[i].set("status", "revoked")
        txApp.save(outstanding[i])
        revoked++
      }

      battle.set("invite_revoked_at", battles.isoAt(now))
      battles.touch(battle, now)
      txApp.save(battle)
    })

    return e.json(200, { revoked: revoked })
  } catch (err) {
    return battles.respondError(e, err)
  }
}, $apis.requireAuth())

// ── POST /api/public/battle-invite — landing metadata, no identities ─────────

/**
 * Unauthenticated on purpose: a friend who is not logged in yet must be able to see
 * what they were invited to before signing up.
 *
 * POST rather than GET so the token is not written into PocketBase's request log, and
 * the response never contains a participant name, avatar or id — only counts.
 */
routerAdd("POST", "/api/public/battle-invite", function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  try {
    var body = battles.readBody(e)
    var invite = battles.findInviteByToken($app, body.token)
    var rejection = battles.inviteRejection($app, invite)
    if (rejection) {
      // Same 200 shape for "never existed", "expired" and "lobby closed": a guessed
      // token must not become an oracle for which battles exist.
      return e.json(200, { ok: false, reason: rejection, battle: null })
    }

    var battle = $app.findRecordById("battles", invite.getString("battle"))
    if (battles.expireIfStale($app, battle)) {
      return e.json(200, { ok: false, reason: "expired", battle: null })
    }

    var config = battles.jsonField(battle, "config", {}) || {}
    var participants = battles.findParticipants($app, battle.getString("id"))
    return e.json(200, {
      ok: true,
      reason: "",
      battle: {
        id: battle.getString("id"),
        status: battle.getString("status"),
        rounds: config.rounds || 0,
        exercise_count: Array.isArray(config.exercises) ? config.exercises.length : 0,
        workout_template_id: config.workout_template_id || "",
        participant_count: battles.lobbyParticipants(participants).length,
        expires_at: invite.getString("expires_at"),
      },
    })
  } catch (err) {
    return battles.respondError(e, err)
  }
})

// ── POST /api/battles/join — consume a token atomically ──────────────────────

routerAdd("POST", "/api/battles/join", function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  try {
    var userId = battles.requireUserId(e)
    var body = battles.readBody(e)
    var outcome = { battleId: "", alreadyJoined: false }

    battles.runGuarded($app, function (txApp) {
      var invite = battles.findInviteByToken(txApp, body.token)
      var rejection = battles.inviteRejection(txApp, invite)
      if (rejection) {
        battles.fail(rejection === "expired" ? 410 : 409, "invite_" + rejection, "This invite cannot be used")
      }

      var battleId = invite.getString("battle")
      outcome.battleId = battleId
      var battle = battles.findBattle(txApp, battleId)

      // Someone re-opening their own link: hand them their existing seat instead of
      // burning a second token or erroring at them.
      var existing = battles.findParticipantForUser(txApp, battleId, userId)
      if (existing) {
        outcome.alreadyJoined = true
        return
      }

      if (!battles.claimIdempotencyKey(txApp, battleId, userId, "join", body.idempotency_key)) {
        outcome.alreadyJoined = true
        return
      }

      var now = battles.nowMs()
      var collection = txApp.findCollectionByNameOrId("battle_participants")
      var participant = new Record(collection)
      participant.set("battle", battleId)
      participant.set("user", userId)
      participant.set("status", "joined")
      participant.set("progress", battles.emptyProgress())
      participant.set("joined_at", battles.isoAt(now))
      participant.set("last_seen_at", battles.isoAt(now))
      // The unique (battle, user) index is the real guard here: two devices on the
      // same account racing this call produce one participant, not two.
      txApp.save(participant)

      invite.set("status", "consumed")
      invite.set("used_at", battles.isoAt(now))
      invite.set("used_by", userId)
      txApp.save(invite)

      // A new participant makes the lobby un-ready again: everyone re-confirms.
      var participants = battles.findParticipants(txApp, battleId)
      battles.syncLobbyStatus(txApp, battle, participants)
      battles.touch(battle, now)
      battles.bumpRevision(battle)
      txApp.save(battle)
    })

    var fresh = battles.findBattle($app, outcome.battleId)
    var snapshot = battles.snapshotOf($app, fresh, userId)
    snapshot.already_joined = outcome.alreadyJoined
    return e.json(200, snapshot)
  } catch (err) {
    return battles.respondError(e, err)
  }
}, $apis.requireAuth())

// ── POST /api/battles/{id}/ready — joined ⇄ ready ────────────────────────────

routerAdd("POST", "/api/battles/{id}/ready", function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  try {
    var userId = battles.requireUserId(e)
    var battleId = e.request.pathValue("id")
    var body = battles.readBody(e)
    var wantReady = body.ready === undefined ? true : !!body.ready

    battles.runGuarded($app, function (txApp) {
      var battle = battles.findBattle(txApp, battleId)
      var participant = battles.requireParticipant(txApp, battle, userId)

      var status = battle.getString("status")
      if (status !== "lobby" && status !== "ready") {
        battles.fail(409, "invalid_transition", "Readiness can only change in the lobby")
      }

      if (!battles.claimIdempotencyKey(txApp, battleId, userId, "ready", body.idempotency_key)) return

      var from = participant.getString("status")
      var to = wantReady ? "ready" : "joined"
      if (from === to) return // double-tap on the same button

      battles.assertParticipantTransition(from, to)

      var now = battles.nowMs()
      participant.set("status", to)
      participant.set("ready_at", to === "ready" ? battles.isoAt(now) : "")
      participant.set("last_seen_at", battles.isoAt(now))
      txApp.save(participant)

      var participants = battles.findParticipants(txApp, battleId)
      battles.syncLobbyStatus(txApp, battle, participants)
      battles.touch(battle, now)
      battles.bumpRevision(battle)
      txApp.save(battle)
    })

    var fresh = battles.findBattle($app, battleId)
    return e.json(200, battles.snapshotOf($app, fresh, userId))
  } catch (err) {
    return battles.respondError(e, err)
  }
}, $apis.requireAuth())

// ── POST /api/battles/{id}/start — ready → live ──────────────────────────────

routerAdd("POST", "/api/battles/{id}/start", function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  try {
    var userId = battles.requireUserId(e)
    var battleId = e.request.pathValue("id")
    var body = battles.readBody(e)

    battles.runGuarded($app, function (txApp) {
      var battle = battles.findBattle(txApp, battleId)
      battles.requireCreator(battle, userId)

      if (!battles.claimIdempotencyKey(txApp, battleId, userId, "start", body.idempotency_key)) return

      battles.assertBattleTransition(battle.getString("status"), "live")

      var participants = battles.findParticipants(txApp, battleId)
      var ready = []
      for (var i = 0; i < participants.length; i++) {
        if (participants[i].getString("status") === "ready") ready.push(participants[i])
      }
      if (ready.length < battles.MIN_READY_TO_START) {
        battles.fail(409, "not_enough_participants",
          "A battle needs at least " + battles.MIN_READY_TO_START + " ready participants")
      }

      var now = battles.nowMs()
      // `starts_at` is the single source of truth for the countdown. Clients render it
      // against their measured server offset and never against the device clock.
      var startsAt = now + battles.COUNTDOWN_LEAD_MS
      battle.set("status", "live")
      battle.set("starts_at", battles.isoAt(startsAt))
      battles.touch(battle, now)
      battles.bumpRevision(battle)
      txApp.save(battle)

      for (var j = 0; j < ready.length; j++) {
        battles.assertParticipantTransition(ready[j].getString("status"), "active")
        ready[j].set("status", "active")
        ready[j].set("active_at", battles.isoAt(startsAt))
        ready[j].set("last_seen_at", battles.isoAt(now))
        txApp.save(ready[j])
      }
    })

    var fresh = battles.findBattle($app, battleId)
    return e.json(200, battles.snapshotOf($app, fresh, userId))
  } catch (err) {
    return battles.respondError(e, err)
  }
}, $apis.requireAuth())

// ── POST /api/battles/{id}/progress ──────────────────────────────────────────

routerAdd("POST", "/api/battles/{id}/progress", function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  try {
    var userId = battles.requireUserId(e)
    var battleId = e.request.pathValue("id")
    var body = battles.readBody(e)

    battles.runGuarded($app, function (txApp) {
      var battle = battles.findBattle(txApp, battleId)
      var participant = battles.requireParticipant(txApp, battle, userId)

      if (battle.getString("status") !== "live") {
        battles.fail(409, "battle_not_live", "The battle is not live")
      }
      if (participant.getString("status") !== "active") {
        battles.fail(409, "participant_not_active", "You are not an active participant")
      }
      if (battles.dateMs(battle, "starts_at") > battles.nowMs()) {
        battles.fail(409, "not_started", "The countdown has not finished")
      }

      var config = battles.jsonField(battle, "config", null)
      var previous = battles.jsonField(participant, "progress", battles.emptyProgress())
      // Rejects negatives, regressions, over-count rounds and unknown exercise
      // positions. A participant can only ever write their own row: `participant` was
      // resolved from the caller's user id, never from the request body.
      var next = battles.nextProgress(config, previous, body.progress)

      var now = battles.nowMs()
      participant.set("progress", next)
      participant.set("last_seen_at", battles.isoAt(now))
      txApp.save(participant)

      battles.touch(battle, now)
      battles.bumpRevision(battle)
      txApp.save(battle)
    })

    var fresh = battles.findBattle($app, battleId)
    return e.json(200, battles.snapshotOf($app, fresh, userId))
  } catch (err) {
    return battles.respondError(e, err)
  }
}, $apis.requireAuth())

// ── POST /api/battles/{id}/finish ────────────────────────────────────────────

routerAdd("POST", "/api/battles/{id}/finish", function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  try {
    var userId = battles.requireUserId(e)
    var battleId = e.request.pathValue("id")
    var body = battles.readBody(e)

    battles.runGuarded($app, function (txApp) {
      var battle = battles.findBattle(txApp, battleId)
      var participant = battles.requireParticipant(txApp, battle, userId)

      if (!battles.claimIdempotencyKey(txApp, battleId, userId, "finish", body.idempotency_key)) return
      if (participant.getString("status") === "finished") return

      battles.assertParticipantTransition(participant.getString("status"), "finished")

      var now = battles.nowMs()
      if (body.progress) {
        var config = battles.jsonField(battle, "config", null)
        var previous = battles.jsonField(participant, "progress", battles.emptyProgress())
        participant.set("progress", battles.nextProgress(config, previous, body.progress))
      }
      participant.set("status", "finished")
      participant.set("finished_at", battles.isoAt(now))
      participant.set("last_seen_at", battles.isoAt(now))
      txApp.save(participant)

      // A single participant finishing alone still produces a valid finished battle.
      var participants = battles.findParticipants(txApp, battleId)
      if (battles.countWithStatus(participants, "active") === 0 &&
          battle.getString("status") === "live") {
        battle.set("status", "finished")
        battle.set("finished_at", battles.isoAt(now))
        battle.set("ends_at", battles.isoAt(now))
      }
      battles.touch(battle, now)
      battles.bumpRevision(battle)
      txApp.save(battle)
    })

    var fresh = battles.findBattle($app, battleId)
    return e.json(200, battles.snapshotOf($app, fresh, userId))
  } catch (err) {
    return battles.respondError(e, err)
  }
}, $apis.requireAuth())

// ── POST /api/battles/{id}/leave ─────────────────────────────────────────────

routerAdd("POST", "/api/battles/{id}/leave", function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  try {
    var userId = battles.requireUserId(e)
    var battleId = e.request.pathValue("id")
    var body = battles.readBody(e)

    battles.runGuarded($app, function (txApp) {
      var battle = battles.findBattle(txApp, battleId)
      var participant = battles.requireParticipant(txApp, battle, userId)

      if (!battles.claimIdempotencyKey(txApp, battleId, userId, "leave", body.idempotency_key)) return
      if (participant.getString("status") === "left") return

      battles.assertParticipantTransition(participant.getString("status"), "left")

      var now = battles.nowMs()
      participant.set("status", "left")
      participant.set("left_at", battles.isoAt(now))
      participant.set("last_seen_at", battles.isoAt(now))
      txApp.save(participant)

      var status = battle.getString("status")
      var isCreator = battle.getString("creator") === userId
      var participants = battles.findParticipants(txApp, battleId)

      if (isCreator && (status === "draft" || status === "lobby" || status === "ready")) {
        // Nobody else can start it, so a creator walking out of the lobby cancels the
        // battle rather than leaving a zombie for the expiry sweep.
        battle.set("status", "cancelled")
      } else if (status === "live" && battles.countWithStatus(participants, "active") === 0) {
        // Mid-battle the creator is just another participant: the battle carries on
        // and only closes when the last active participant is gone.
        battle.set("status", "finished")
        battle.set("finished_at", battles.isoAt(now))
        battle.set("ends_at", battles.isoAt(now))
      } else {
        battles.syncLobbyStatus(txApp, battle, participants)
      }

      battles.touch(battle, now)
      battles.bumpRevision(battle)
      txApp.save(battle)
    })

    var fresh = battles.findBattle($app, battleId)
    return e.json(200, battles.snapshotOf($app, fresh, userId))
  } catch (err) {
    return battles.respondError(e, err)
  }
}, $apis.requireAuth())

// ── POST /api/battles/{id}/cancel ────────────────────────────────────────────

routerAdd("POST", "/api/battles/{id}/cancel", function (e) {
  var battles = require(`${__hooks}/utils/battles.js`)
  try {
    var userId = battles.requireUserId(e)
    var battleId = e.request.pathValue("id")
    var body = battles.readBody(e)

    battles.runGuarded($app, function (txApp) {
      var battle = battles.findBattle(txApp, battleId)
      battles.requireCreator(battle, userId)

      if (!battles.claimIdempotencyKey(txApp, battleId, userId, "cancel", body.idempotency_key)) return
      if (battle.getString("status") === "cancelled") return

      battles.assertBattleTransition(battle.getString("status"), "cancelled")

      var now = battles.nowMs()
      battle.set("status", "cancelled")
      battles.touch(battle, now)
      battles.bumpRevision(battle)
      txApp.save(battle)
    })

    var fresh = battles.findBattle($app, battleId)
    return e.json(200, battles.snapshotOf($app, fresh, userId))
  } catch (err) {
    return battles.respondError(e, err)
  }
}, $apis.requireAuth())

// ── Cron: sweep stale lobbies and invites ────────────────────────────────────

/**
 * Primary expiry sweep. `snapshotOf` callers also expire lazily, on purpose: if this
 * callback ever throws it dies silently (that is how the reminder crons stayed broken
 * for months), and a silently dead cron must not leave lobbies alive forever.
 */
cronAdd("battles_expiry", "*/5 * * * *", function () {
  var battles = require(`${__hooks}/utils/battles.js`)
  var now = battles.nowMs()
  var cutoff = battles.isoAt(now - battles.LOBBY_TTL_MS)

  var stale = []
  try {
    stale = $app.findRecordsByFilter(
      "battles",
      "(status = 'draft' || status = 'lobby' || status = 'ready') && last_activity_at < {:cutoff}",
      "", 200, 0, { cutoff: cutoff },
    )
  } catch (err) {
    console.log("[battles_expiry] battle lookup failed:", err)
  }

  for (var i = 0; i < stale.length; i++) {
    try {
      stale[i].set("status", "expired")
      stale[i].set("revision", stale[i].getInt("revision") + 1)
      $app.save(stale[i])
    } catch (err) {
      console.log("[battles_expiry] could not expire battle:", err)
    }
  }

  var expiredInvites = []
  try {
    expiredInvites = $app.findRecordsByFilter(
      "battle_invites",
      "status = 'active' && expires_at < {:now}",
      "", 500, 0, { now: battles.isoAt(now) },
    )
  } catch (err) {
    console.log("[battles_expiry] invite lookup failed:", err)
  }

  for (var j = 0; j < expiredInvites.length; j++) {
    try {
      expiredInvites[j].set("status", "expired")
      $app.save(expiredInvites[j])
    } catch (err) {
      console.log("[battles_expiry] could not expire invite:", err)
    }
  }

  console.log("[battles_expiry] expired", stale.length, "battles and", expiredInvites.length, "invites")
})
