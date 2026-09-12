/// <reference path="../pb_data/types.d.ts" />

/**
 * normalize_activity_datetimes.pb.js — una sola forma de fecha en las columnas
 * `text` de actividad (#673).
 *
 * `cardio_sessions.started_at`/`finished_at` y
 * `circuit_sessions.started_at`/`finished_at` son de tipo `text`, así que
 * PocketBase guarda LITERALMENTE lo que le manden: `2026-04-05T00:05:22.003Z`
 * de un cliente, `2026-08-22 19:57:21.000Z` del panel de admin o de un script,
 * `2026-06-14T09:15:00Z` de una semilla vieja. Los tres son el mismo instante y
 * ordenan distinto como TEXTO, que es como comparan los filtros: por eso los
 * rangos perdían el último día en silencio.
 *
 * La migración 1786400000 dejó las filas existentes en la forma canónica; este
 * hook impide que vuelva a entrar otra. Sin él el arreglo dura hasta el
 * siguiente script que escriba por otra vía.
 *
 * DOS TRAMPAS DEL JSVM, las dos pagadas ya:
 *  - Cada handler corre en un runtime AISLADO y NO ve las funciones top-level
 *    de este fichero: por eso el `require` va DENTRO. Con la versión anterior
 *    el log decía `ReferenceError: normalizeRecord is not defined` y las
 *    escrituras se guardaban sin normalizar, sin fallar.
 *  - `e.next()` encadena los hooks: un handler que no lo llama corta la cadena
 *    y los que otros ficheros registraron para la MISMA colección no corren.
 *    Aquí se normaliza ANTES de `e.next()`, que es quien acaba guardando.
 */

console.log("[normalize_activity_datetimes] hook file loaded")

onRecordCreate(function (e) {
  try {
    var dt = require(`${__hooks}/utils/datetimes.js`)
    dt.normalizeRecordDatetimes(e.record, ["started_at", "finished_at"])
  } catch (err) {
    console.log("[normalize_activity_datetimes] create error:", err)
  }
  e.next()
}, "cardio_sessions", "circuit_sessions")

onRecordUpdate(function (e) {
  try {
    var dt = require(`${__hooks}/utils/datetimes.js`)
    dt.normalizeRecordDatetimes(e.record, ["started_at", "finished_at"])
  } catch (err) {
    console.log("[normalize_activity_datetimes] update error:", err)
  }
  e.next()
}, "cardio_sessions", "circuit_sessions")
