/// <reference path="../pb_data/types.d.ts" />

// These guards apply to all writes, including superusers and direct SDK clients.
// Every callback has an isolated JSVM; require the helper inside each callback.
onRecordCreate(function (e) {
  require(`${__hooks}/utils/fasting.js`).saveSession(e, false)
}, "fasting_sessions")

onRecordUpdate(function (e) {
  require(`${__hooks}/utils/fasting.js`).saveSession(e, true)
}, "fasting_sessions")

onRecordUpdate(function (e) {
  require(`${__hooks}/utils/fasting.js`).assertOwnerUnchanged(e.record)
  e.next()
}, "fasting_settings")
