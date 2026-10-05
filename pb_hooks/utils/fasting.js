/** Server guards for fasting intervals. Empty ended_at means an open interval. */
function invalid(field, code, message) {
  var data = {}
  data[field] = new ValidationError(code, message)
  throw new BadRequestError("Invalid fasting session.", data)
}

function assertOwnerUnchanged(record) {
  if (record.original().getString("user") !== record.getString("user")) {
    invalid("user", "fasting_owner", "The owner cannot be changed.")
  }
}

function timestamp(record, field) {
  // PocketBase date fields normalize to YYYY-MM-DD HH:mm:ss.sssZ. Use T for
  // consistent Goja parsing and compare the canonical strings in DB filters.
  return Date.parse(record.getString(field).replace(" ", "T"))
}

function validateSession(app, record) {
  var start = timestamp(record, "started_at")
  var endValue = record.getString("ended_at")
  var end = endValue ? timestamp(record, "ended_at") : Infinity
  var now = Date.now() + 5000 // allow small client/server clock differences
  if (!isFinite(start)) invalid("started_at", "fasting_date", "A valid start is required.")
  if (start > now) invalid("started_at", "fasting_future", "The start cannot be in the future.")
  if (endValue && !isFinite(end)) invalid("ended_at", "fasting_date", "The end must be a valid date.")
  if (endValue && end > now) invalid("ended_at", "fasting_future", "The end cannot be in the future.")
  if (end <= start) invalid("ended_at", "fasting_order", "The end must be after the start.")

  // Half-open intervals [start,end): consecutive sessions may share a boundary.
  // An active session extends indefinitely until the owner explicitly ends it.
  var filter = "user = {:user} && id != {:id} && (ended_at = '' || ended_at > {:start})"
  var params = { user: record.getString("user"), id: record.getString("id"), start: record.getString("started_at") }
  if (endValue) {
    filter += " && started_at < {:end}"
    params.end = endValue
  }
  if (app.findRecordsByFilter("fasting_sessions", filter, "", 1, 0, params).length > 0) {
    invalid("started_at", "fasting_overlap", "This session overlaps another fasting session.")
  }
}

function conflict() {
  throw new ApiError(409, "This fasting session changed. Refresh before saving.", {
    revision: new ValidationError("fasting_conflict", "This session changed on another device."),
  })
}

function validateRequestDates(e) {
  // requestInfo().body already contains prepared DateTime values here. Rebind
  // the original rereadable HTTP body to distinguish an invalid end from "".
  var raw = new DynamicModel({ ended_at: "" })
  try { e.bindBody(raw) } catch (_) {
    invalid("ended_at", "fasting_date", "The end must be a valid date.")
  }
  // A supplied nonempty end must never silently become an active session.
  if (raw.ended_at !== "" && !e.record.getString("ended_at")) {
    invalid("ended_at", "fasting_date", "The end must be a valid date.")
  }
}

function inTransaction(e, callback) {
  var originalApp = e.app
  var failure = null
  try {
    originalApp.runInTransaction(function (txApp) {
      e.app = txApp
      try { callback(txApp) } catch (err) {
        failure = err // preserve field-level API errors across the Go boundary
        throw err
      }
    })
  } catch (err) {
    throw failure || err
  } finally {
    e.app = originalApp
  }
}

function updateRequest(e, next) {
  assertOwnerUnchanged(e.record)
  validateRequestDates(e)
  var body = e.requestInfo().body
  var expected = body.expected_revision
  if (typeof expected !== "number" || !isFinite(expected) || Math.floor(expected) !== expected || expected < 1) conflict()
  inTransaction(e, function (txApp) {
    // API rules have already authenticated the owner before this request hook.
    // Reload under the same write transaction as the save, then compare both
    // the client's revision and the server snapshot loaded before the hook.
    var latest
    try { latest = txApp.findRecordById("fasting_sessions", e.record.getString("id")) }
    catch (_) { throw new NotFoundError("The session no longer exists.") }
    var revision = latest.getInt("revision")
    if (expected !== revision || e.record.original().getInt("revision") !== revision) conflict()
    var fields = ["started_at", "ended_at", "goal_hours", "notes", "client_id"]
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i]
      if (Object.prototype.hasOwnProperty.call(body, field)) latest.set(field, e.record.get(field))
    }
    // Keep unspecified fields from latest; neither the submitted revision nor
    // timestamp metadata is writable. The model hook increments the revision.
    e.record = latest
    next()
  })
}

function saveSession(e, updating, next) {
  if (updating) assertOwnerUnchanged(e.record)
  inTransaction(e, function (txApp) {
    if (updating) {
      var latest
      try { latest = txApp.findRecordById("fasting_sessions", e.record.getString("id")) }
      catch (_) { throw new NotFoundError("The session no longer exists.") }
      // Also reject stale direct model saves. Revisions remain server-owned
      // for superuser writes, SDK clients and internal hooks alike.
      if (e.record.original().getInt("revision") !== latest.getInt("revision")) conflict()
      e.record.set("revision", latest.getInt("revision") + 1)
    } else {
      e.record.set("revision", 1)
    }
    validateSession(txApp, e.record)
    next()
  })
}

module.exports = {
  assertOwnerUnchanged: assertOwnerUnchanged,
  saveSession: saveSession,
  updateRequest: updateRequest,
  validateRequestDates: validateRequestDates,
}
