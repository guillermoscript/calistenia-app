/// <reference path="../../pb_data/types.d.ts" />

/**
 * Forma canónica de las columnas de fecha que en PocketBase son `text` (#673).
 *
 * IMPORTANTE (gotcha de PocketBase/goja): cada handler de hook corre en un
 * runtime JSVM AISLADO y NO ve las funciones top-level del `.pb.js` que lo
 * registra — falla con `ReferenceError` y solo se ve en el log del servidor.
 * Por eso esto vive aquí y cada handler hace
 *   var dt = require(`${__hooks}/utils/datetimes.js`)
 *
 * Es la misma transformación que `toIsoTextDatetime` en
 * `packages/core/lib/pbTextDatetime.ts` y que la migración
 * `1786400000_normalize_activity_datetimes.js`. Si cambia el formato canónico,
 * hay que tocar los tres.
 */

/** `YYYY-MM-DDTHH:MM:SS.sssZ`, con milisegundos SIEMPRE. */
function toIsoTextDatetime(value) {
  if (!value) return ""
  var raw = String(value).trim()
  var match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d{1,9}))?)?\s*Z?$/.exec(raw)
  if (!match) return raw
  var time = match[2] || "00:00:00"
  var hms = time.length === 5 ? time + ":00" : time
  var millis = ((match[3] || "") + "000").substring(0, 3)
  return match[1] + "T" + hms + "." + millis + "Z"
}

/**
 * Normaliza en sitio los campos de fecha de un record. Un valor que el regex no
 * reconoce se deja tal cual: este helper unifica formatos, no valida entradas.
 */
function normalizeRecordDatetimes(record, fields) {
  for (var i = 0; i < fields.length; i++) {
    var current = record.getString(fields[i])
    if (!current) continue
    var normalized = toIsoTextDatetime(current)
    if (normalized && normalized !== current) record.set(fields[i], normalized)
  }
}

module.exports = {
  toIsoTextDatetime: toIsoTextDatetime,
  normalizeRecordDatetimes: normalizeRecordDatetimes,
}
