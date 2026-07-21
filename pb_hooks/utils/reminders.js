/// <reference path="../../pb_data/types.d.ts" />

/**
 * Helpers de los crons de recordatorios. Igual que utils/notifications.js:
 * requerir DENTRO de cada callback de cronAdd (runtimes JSVM aislados — las
 * funciones top-level del .pb.js NO existen cuando corre el callback; antes
 * eran top-level en push_reminders.pb.js y cada tick moría con ReferenceError
 * silencioso → ningún reminder push se envió nunca).
 */

/**
 * Parse days_of_week de un record. Acepta array real de días, JSON string
 * (getString sobre campo json) o el JSONRaw de record.get(), que goja expone
 * como ARRAY DE BYTES ([91,48,44,...] = "[0,1,...]") — Array.isArray da true
 * y antes se devolvía tal cual → includes(día) nunca matcheaba y todos los
 * reminders se saltaban en silencio. Preferir getString en los callers.
 */
function parseDaysOfWeek(raw) {
  if (Array.isArray(raw) && raw.every(function (d) { return typeof d === "number" && d >= 0 && d <= 6 })) {
    return raw
  }
  if (raw != null) {
    try {
      var s = Array.isArray(raw) ? String.fromCharCode.apply(null, raw) : String(raw)
      var parsed = JSON.parse(s)
      if (Array.isArray(parsed)) return parsed
    } catch (e) { /* formato inesperado → default */ }
  }
  return [1, 2, 3, 4, 5]
}

/** Envía un push a un usuario vía el AI API (respetando INTERNAL_API_KEY). */
function sendPush(userId, title, body, url) {
  try {
    var apiUrl = $os.getenv("AI_API_URL") || "http://localhost:3001"
    var internalKey = $os.getenv("INTERNAL_API_KEY") || ""
    var headers = { "Content-Type": "application/json" }
    if (internalKey) {
      headers["X-Internal-Key"] = internalKey
    }
    $http.send({
      url: apiUrl + "/api/send-push",
      method: "POST",
      headers: headers,
      body: JSON.stringify({ user_id: userId, title: title, body: body, url: url }),
      timeout: 10,
    })
  } catch (e) {
    console.log("Push send error:", e)
  }
}

module.exports = {
  parseDaysOfWeek: parseDaysOfWeek,
  sendPush: sendPush,
}
