/// <reference path="../pb_data/types.d.ts" />

/**
 * Normaliza a ISO-con-T las columnas de fecha que son `text` (#673).
 *
 * `cardio_sessions.started_at`/`finished_at` y
 * `circuit_sessions.started_at`/`finished_at` se declararon `text`, así que
 * PocketBase guarda literalmente lo que le mandan. Los clientes mandan
 * `toISOString()` (`2026-04-05T00:05:22.003Z`), pero por la base hay filas con
 * el formato de PocketBase (`2026-08-22 19:57:21.000Z`, con ESPACIO) y otras
 * sin milisegundos (`2026-06-14T09:15:00Z`).
 *
 * Con tres formatos mezclados en la MISMA columna, ninguna cota de filtro es
 * correcta: la comparación es de texto y `'T'` (0x54) va después de `' '`
 * (0x20), y `'Z'` (0x5A) después de `'.'` (0x2E). El resultado era que los
 * filtros de rango perdían el último día EN SILENCIO — los circuitos de hoy no
 * salían nunca y un reto de kilómetros marcaba 0 km con carreras dentro de la
 * ventana.
 *
 * Esta migración deja UNA sola forma: `YYYY-MM-DDTHH:MM:SS.sssZ`, que es la que
 * ya escriben todos los clientes. A partir de ahí las cotas se emiten con
 * `toIsoTextDatetime` (packages/core/lib/pbTextDatetime.ts) y el hook
 * `normalize_activity_datetimes.pb.js` impide que vuelva a entrar otra forma.
 *
 * NO cambia el tipo del campo a `date`, que sería el arreglo de fondo: eso
 * cambia lo que el servidor DEVUELVE (un `date` se serializa con espacio) y ahí
 * fuera hay clientes instalados que hacen `split('T')` y `new Date(...)`. Queda
 * para cuando haya un version gate que lo cubra.
 *
 * La normalización se hace en JS y no en SQL a propósito: rellenar
 * milisegundos y mover el separador con funciones de SQLite es ilegible, y
 * parsear con `new Date()` dentro de goja tiene el mismo problema de formatos
 * que estamos arreglando. Solo se tocan las filas que NO están ya en la forma
 * canónica.
 */

const TARGETS = [
  { collection: "cardio_sessions", fields: ["started_at", "finished_at"] },
  { collection: "circuit_sessions", fields: ["started_at", "finished_at"] },
]

/** Igual que `toIsoTextDatetime` de core, en JS plano para el JSVM. */
function toIso(value) {
  if (!value) return ""
  const raw = String(value).trim()
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d{1,9}))?)?\s*Z?$/.exec(raw)
  if (!match) return raw
  const time = match[2] || "00:00:00"
  const hms = time.length === 5 ? time + ":00" : time
  const millis = ((match[3] || "") + "000").substring(0, 3)
  return match[1] + "T" + hms + "." + millis + "Z"
}

migrate((app) => {
  let touched = 0

  for (const target of TARGETS) {
    for (const field of target.fields) {
      // GLOB distingue mayúsculas, que es justo lo que hace falta aquí.
      const pending = arrayOf(new DynamicModel({ id: "", value: "" }))
      app
        .db()
        .newQuery(
          `SELECT id, ${field} AS value FROM ${target.collection} ` +
            `WHERE ${field} IS NOT NULL AND ${field} != '' ` +
            `AND ${field} NOT GLOB '????-??-??T??:??:??.???Z'`,
        )
        .all(pending)

      for (const row of pending) {
        const normalized = toIso(row.value)
        if (!normalized || normalized === row.value) continue
        app
          .db()
          .newQuery(`UPDATE ${target.collection} SET ${field} = {:v} WHERE id = {:id}`)
          .bind({ v: normalized, id: row.id })
          .execute()
        touched++
      }
    }
  }

  console.log("[normalize_activity_datetimes] normalizadas " + touched + " celdas")
}, (app) => {
  // Sin vuelta atrás: el formato viejo no era uno, eran tres, y no queda registro
  // de cuál tenía cada fila. Volver a poner espacios reintroduciría el bug.
  console.log("[normalize_activity_datetimes] down migration is a no-op on purpose")
})
