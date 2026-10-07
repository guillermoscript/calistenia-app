/// <reference path="../../pb_data/types.d.ts" />

/**
 * Piezas PURAS de la subida a Strava (#914): sin globals de PocketBase, para
 * poder probarlas con `node --test` sin levantar el servidor.
 */

var SPORT_TYPES = { running: "Run", walking: "Walk", cycling: "Ride" }

function sportType(activityType) {
  return SPORT_TYPES[activityType] || "Workout"
}

function xmlEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

function isFiniteNumber(n) {
  return typeof n === "number" && isFinite(n)
}

/**
 * GPX 1.1 con tiempos y altitud. Un punto marcado `gap` (reentrada tras >30 s
 * sin GPS) abre un `<trkseg>` nuevo: unirlo al anterior dibujaría una recta
 * falsa entre los dos y Strava la sumaría a la distancia.
 *
 * Descarta puntos sin lat/lng o sin timestamp: Strava rechaza un GPX con
 * `<trkpt>` sin `<time>` («no time data»).
 */
function buildGpx(points, opts) {
  opts = opts || {}
  var segs = []
  var cur = null
  for (var i = 0; i < points.length; i++) {
    var p = points[i]
    if (!p || !isFiniteNumber(p.lat) || !isFiniteNumber(p.lng) || !isFiniteNumber(p.timestamp)) continue
    if (!cur || p.gap) { cur = []; segs.push(cur) }
    cur.push(p)
  }
  var out = []
  out.push('<?xml version="1.0" encoding="UTF-8"?>')
  out.push('<gpx version="1.1" creator="Calistenia" xmlns="http://www.topografix.com/GPX/1/1">')
  out.push("<metadata><name>" + xmlEscape(opts.name || "Calistenia") + "</name></metadata>")
  out.push("<trk><name>" + xmlEscape(opts.name || "Calistenia") + "</name>")
  for (var s = 0; s < segs.length; s++) {
    out.push("<trkseg>")
    for (var j = 0; j < segs[s].length; j++) {
      var q = segs[s][j]
      var line = '<trkpt lat="' + q.lat.toFixed(6) + '" lon="' + q.lng.toFixed(6) + '">'
      if (isFiniteNumber(q.alt)) line += "<ele>" + q.alt.toFixed(1) + "</ele>"
      line += "<time>" + new Date(q.timestamp).toISOString() + "</time></trkpt>"
      out.push(line)
    }
    out.push("</trkseg>")
  }
  out.push("</trk></gpx>")
  return out.join("\n")
}

/** Cuántos puntos válidos produciría buildGpx (para decidir GPX vs. manual). */
function usablePoints(points) {
  var n = 0
  for (var i = 0; i < (points || []).length; i++) {
    var p = points[i]
    if (p && isFiniteNumber(p.lat) && isFiniteNumber(p.lng) && isFiniteNumber(p.timestamp)) n++
  }
  return n
}

/** Nombre de la actividad: la nota si la hay, si no uno genérico por deporte. */
function activityName(session) {
  var note = (session.note || "").replace(/\s+/g, " ").trim()
  if (note) return note.slice(0, 100)
  var generic = { running: "Carrera", walking: "Caminata", cycling: "Ciclismo" }
  return generic[session.activity_type] || "Cardio"
}

/** Descripción que se añade a la actividad: FC y calorías del reloj, si existen. */
function activityDescription(session) {
  var bits = []
  if (isFiniteNumber(session.hr_avg) && session.hr_avg > 0) bits.push("FC media " + Math.round(session.hr_avg) + " ppm")
  if (isFiniteNumber(session.hr_max) && session.hr_max > 0) bits.push("FC máx " + Math.round(session.hr_max) + " ppm")
  var kcal = session.calories_actual || session.calories_burned
  if (isFiniteNumber(kcal) && kcal > 0) bits.push(Math.round(kcal) + " kcal")
  bits.push("Registrado con Calistenia")
  return bits.join(" · ")
}

/** Un `duplicate of activity 123` de Strava significa «ya estaba subida». */
function parseDuplicateActivityId(message) {
  var m = /duplicate of\s+(?:<a[^>]*>)?\s*activity\s+(\d+)/i.exec(String(message || ""))
  return m ? Number(m[1]) : 0
}

module.exports = {
  sportType: sportType,
  buildGpx: buildGpx,
  usablePoints: usablePoints,
  activityName: activityName,
  activityDescription: activityDescription,
  parseDuplicateActivityId: parseDuplicateActivityId,
}
