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

function saveSession(e, updating) {
  if (updating) assertOwnerUnchanged(e.record)
  var originalApp = e.app
  var failure = null
  try {
    // Serialize the read-check-write together. The partial unique index also
    // protects a double start, but alone cannot prevent overlapping history.
    originalApp.runInTransaction(function (txApp) {
      e.app = txApp
      try {
        validateSession(txApp, e.record)
        e.next()
      } catch (err) {
        failure = err // preserve the field-level API error across the Go boundary
        throw err
      }
    })
  } catch (err) {
    throw failure || err
  } finally {
    e.app = originalApp
  }
}

module.exports = { assertOwnerUnchanged: assertOwnerUnchanged, saveSession: saveSession }
