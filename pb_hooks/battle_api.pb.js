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
 * Los handlers viven en `pb_hooks/utils/battles/routes.js`, compuestos con el
 * wrapper `route()` de `utils/battles/http.js` (#481). Aquí solo quedan los
 * registros: cada callback corre en un runtime JSVM AISLADO y PocketBase lo
 * serializa, así que una closure compuesta en este archivo perdería sus variables
 * libres — por eso cada callback hace `require` y delega, y nada más.
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

// ── Rutas (handlers en utils/battles/routes.js) ──────────────────────────────

routerAdd("GET", "/api/battles/{id}/snapshot", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.snapshot(e)
}, $apis.requireAuth())

routerAdd("POST", "/api/battles/{id}/publish", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.publish(e)
}, $apis.requireAuth())

routerAdd("POST", "/api/battles/{id}/invites", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.issueInvite(e)
}, $apis.requireAuth())

routerAdd("POST", "/api/battles/{id}/invites/revoke", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.revokeInvites(e)
}, $apis.requireAuth())

// Sin auth a propósito: la landing de invitación debe funcionar para un amigo que
// aún no tiene cuenta. Ver el comentario del handler.
routerAdd("POST", "/api/public/battle-invite", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.publicInviteLanding(e)
})

routerAdd("POST", "/api/battles/join", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.join(e)
}, $apis.requireAuth())

routerAdd("POST", "/api/battles/{id}/ready", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.ready(e)
}, $apis.requireAuth())

routerAdd("POST", "/api/battles/{id}/start", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.start(e)
}, $apis.requireAuth())

routerAdd("POST", "/api/battles/{id}/progress", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.progress(e)
}, $apis.requireAuth())

routerAdd("POST", "/api/battles/{id}/finish", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.finish(e)
}, $apis.requireAuth())

routerAdd("POST", "/api/battles/{id}/leave", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.leave(e)
}, $apis.requireAuth())

routerAdd("POST", "/api/battles/{id}/cancel", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.cancel(e)
}, $apis.requireAuth())

routerAdd("POST", "/api/battles/{id}/rematch", function (e) {
  return require(`${__hooks}/utils/battles.js`).handlers.rematch(e)
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
  // Storage format, not ISO: this value is compared against the stored text.
  var cutoff = battles.filterTime(now - battles.LOBBY_TTL_MS)

  // Batch caps so one sweep cannot stall on a huge backlog. Hitting a cap is logged
  // rather than swallowed: the run still looks successful, and without the line nobody
  // would know the backlog is only draining 200 at a time.
  var BATTLE_BATCH = 200
  var INVITE_BATCH = 500

  var stale = []
  try {
    stale = $app.findRecordsByFilter(
      "battles",
      "(status = 'draft' || status = 'lobby' || status = 'ready') && last_activity_at < {:cutoff}",
      "", BATTLE_BATCH, 0, { cutoff: cutoff },
    )
  } catch (err) {
    console.log("[battles_expiry] battle lookup failed:", err)
  }

  for (var i = 0; i < stale.length; i++) {
    try {
      stale[i].set("status", "expired")
      // Seal the ranking here too: an expired lobby is a closed battle, and the history
      // list reads the result off the record rather than rebuilding it (#398).
      battles.sealFinalStandings($app, stale[i], null)
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
      "", INVITE_BATCH, 0, { now: battles.filterTime(now) },
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
  if (stale.length >= BATTLE_BATCH || expiredInvites.length >= INVITE_BATCH) {
    console.log("[battles_expiry] hit a batch cap — more remain, next run in 5 minutes")
  }
})
