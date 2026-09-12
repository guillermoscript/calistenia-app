/**
 * pbTextDatetime — cotas y valores para las columnas de fecha que en PocketBase
 * son de tipo `text` y no `date` (#673).
 *
 * EL PROBLEMA. `cardio_sessions.started_at`/`finished_at` y
 * `circuit_sessions.started_at`/`finished_at` se declararon `text`. PocketBase
 * NO normaliza un `text`: guarda literalmente lo que le mandan, y los clientes
 * mandan `toISOString()` → `2026-04-05T00:05:22.003Z`, con **T**. Los filtros,
 * en cambio, construían la cota con el formato de PocketBase
 * `YYYY-MM-DD HH:MM:SS`, con **espacio**.
 *
 * La comparación es de TEXTO. `'T'` (0x54) va después de `' '` (0x20), así que
 * toda fila del mismo día natural que la cota superior quedaba fuera, sin
 * error y sin log:
 *
 *   started_at <= '2026-04-05 23:59:59'   → 0 filas
 *   started_at <= '2026-04-05T23:59:59Z'  → las 4 que existen
 *
 * Se comía los circuitos de HOY en `cal_list_circuit_sessions` (su rango por
 * defecto acaba hoy) y el cardio del último día en los retos `total_distance` y
 * `total_workouts` — un reto de kilómetros marcaba 0 km con dos carreras dentro
 * de la ventana.
 *
 * POR QUÉ NO SE ARREGLA CAMBIANDO EL TIPO A `date`. Sería lo correcto a largo
 * plazo, pero cambia lo que el servidor DEVUELVE a los clientes ya instalados:
 * un campo `date` se serializa con espacio, y ahí fuera hay código que hace
 * `started_at.split('T')[0]` y, sobre todo, `new Date(started_at)` — que en
 * Hermes no parsea de forma fiable una cadena con espacio. La app vive en Play:
 * romper a quien no ha actualizado es justo lo que evita el guardarraíl de
 * `scripts/check-schema-contract.mjs`. El cambio de tipo queda para cuando haya
 * un version gate que lo cubra; mientras tanto se normaliza el DATO al formato
 * que los clientes ya escriben y leen, y las cotas se emiten en ese formato.
 *
 * La normalización del dato la hacen la migración
 * `1786400000_normalize_activity_datetimes.js` y el hook
 * `pb_hooks/normalize_activity_datetimes.pb.js`, que repiten esta misma
 * transformación en JS plano porque el JSVM de PocketBase no puede importar
 * TypeScript. Si cambias el formato canónico, hay que tocar los tres.
 */

/**
 * `YYYY-MM-DD` con hora opcional (separada por `T` o espacio), fracción de
 * segundo opcional y `Z` opcional. Lo que no case se devuelve tal cual: una
 * cota rara es preferible a una excepción en mitad de un filtro.
 */
const PB_DATETIME = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d{1,9}))?)?\s*Z?$/

/**
 * Forma canónica `YYYY-MM-DDTHH:MM:SS.sssZ` de una fecha/hora.
 *
 * Sirve para las dos puntas del problema: normalizar un valor guardado y emitir
 * una cota de filtro. Los milisegundos se rellenan SIEMPRE, porque sin ellos la
 * comparación de texto también miente: `'2026-06-14T09:15:00Z'` ordena DESPUÉS
 * de `'2026-06-14T09:15:00.000Z'` (`'Z'` > `'.'`) aunque sean el mismo instante.
 *
 * Sin hora se asume medianoche, que es lo que ya significaba una cota
 * `YYYY-MM-DD` en los filtros que existían.
 */
export function toIsoTextDatetime(value: string | null | undefined): string {
  if (!value) return ''
  const raw = String(value).trim()
  const match = PB_DATETIME.exec(raw)
  if (!match) return raw

  const day = match[1]
  const time = match[2] ?? '00:00:00'
  const hms = time.length === 5 ? `${time}:00` : time
  const millis = `${match[3] ?? ''}000`.slice(0, 3)
  return `${day}T${hms}.${millis}Z`
}

/** `true` si el valor ya está en la forma canónica. */
export function isIsoTextDatetime(value: string | null | undefined): boolean {
  return !!value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(String(value))
}
