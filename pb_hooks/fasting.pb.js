/// <reference path="../pb_data/types.d.ts" />

// These guards apply to all writes, including superusers and direct SDK clients.
// Every callback has an isolated JSVM; require the helper inside each callback.
onRecordCreateRequest(function (e) {
  require(`${__hooks}/utils/fasting.js`).validateRequestDates(e)
  e.next()
}, "fasting_sessions")

onRecordUpdateRequest(function (e) {
  require(`${__hooks}/utils/fasting.js`).updateRequest(e, function () { e.next() })
}, "fasting_sessions")

onRecordCreate(function (e) {
  require(`${__hooks}/utils/fasting.js`).saveSession(e, false, function () { e.next() })
}, "fasting_sessions")

onRecordUpdate(function (e) {
  require(`${__hooks}/utils/fasting.js`).saveSession(e, true, function () { e.next() })
}, "fasting_sessions")

onRecordUpdate(function (e) {
  require(`${__hooks}/utils/fasting.js`).assertOwnerUnchanged(e.record)
  e.next()
}, "fasting_settings")
