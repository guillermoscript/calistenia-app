/// <reference path="../../pb_data/types.d.ts" />

/**
 * Helpers compartidos para mantener `user_stats` al dia cuando se completa un
 * entrenamiento, sea del tipo que sea (issue #412).
 *
 * IMPORTANTE (gotcha de PocketBase/goja): cada handler de hook corre en un
 * runtime JSVM AISLADO y NO ve las funciones top-level del .pb.js que lo
 * registra. Por eso esto vive aqui y cada handler hace
 *   var stats = require(`${__hooks}/utils/workout_stats.js`)
 * Los globals de PocketBase ($app, Record, Collection) si estan disponibles
 * dentro del runtime del handler.
 *
 * FECHAS. El dia del entrenamiento sale del propio record, no del reloj del
 * servidor, porque un guardado en diferido (cola de reintentos de cardio) o una
 * sesion retroactiva llegarian con la fecha equivocada. Dos formatos conviven:
 *
 *   - `sessions.completed_at` lo escribe el cliente con hora de pared LOCAL y
 *     sin `Z` (`nowLocalForPB` → "YYYY-MM-DD HH:mm:ss"), asi que sus primeros
 *     10 caracteres son la fecha local del usuario. Exacto.
 *   - `circuit_sessions`/`cardio_sessions.finished_at` es ISO UTC real
 *     (`new Date().toISOString()`), asi que ahi la fecha es la UTC. Coincide con
 *     lo que hacia el hook viejo en produccion (PB corre en UTC) y con como el
 *     calendario agrupa esas dos colecciones. La racha por zona horaria de cada
 *     usuario es otro problema: goja no tiene `Intl` (ver el cron de
 *     recordatorios, #344).
 */

function pad2(n) {
  return n < 10 ? "0" + n : "" + n
}

var DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Fecha de hoy segun el reloj del servidor, como "YYYY-MM-DD". */
function serverToday() {
  var now = new Date()
  return now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate())
}

/** "2026-08-12 10:00:00.000Z" | "2026-08-12T10:00:00Z" → "2026-08-12"; basura → "". */
function dayFromTimestamp(value) {
  if (!value) return ""
  var day = String(value).slice(0, 10)
  return DAY_RE.test(day) ? day : ""
}

/**
 * Dia del entrenamiento de un record: el primer campo de `fields` que traiga
 * una fecha parseable; si ninguno, el dia del servidor.
 */
function workoutDayOf(record, fields) {
  for (var i = 0; i < fields.length; i++) {
    var raw = ""
    try {
      raw = record.getString(fields[i])
    } catch (err) {
      raw = ""
    }
    var day = dayFromTimestamp(raw)
    if (day) return day
  }
  return serverToday()
}

/** Suma `delta` dias a "YYYY-MM-DD". En UTC: sin horas no hay saltos de DST. */
function shiftDay(day, delta) {
  var parts = day.split("-")
  var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
  d.setUTCDate(d.getUTCDate() + delta)
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate())
}

/**
 * Fila de `user_stats` del usuario, creandola si no existe.
 *
 * El hook viejo se rendia aqui ("no user_stats record for user X") y nadie crea
 * la fila al registrarse, asi que para las cuentas que no habian hecho nunca un
 * circuito las stats no existian y jamas iban a existir. Crearla bajo demanda
 * cubre tambien a las cuentas ya registradas, que un hook de alta no alcanzaria.
 *
 * Devuelve null si el usuario no existe (cuenta borrada entre el create y el
 * hook) o si el save falla.
 */
function findOrCreateStats(userId) {
  try {
    var found = $app.findRecordsByFilter("user_stats", "user = {:u}", "", 1, 0, { u: userId })
    if (found && found.length > 0) return found[0]
  } catch (err) {
    console.log("[workout_stats] lookup fallido para " + userId + ":", err)
    return null
  }

  try {
    var collection = $app.findCollectionByNameOrId("user_stats")
    var stats = new Record(collection)
    stats.set("user", userId)
    // `level` arranca en 1 (la UI enseña "NIVEL n" tal cual y el schema tiene
    // min: 1). `xp` no lo mantiene nadie todavia — fuera del alcance de #412.
    stats.set("level", 1)
    $app.save(stats)
    return stats
  } catch (err) {
    // Carrera: si dos sesiones entran a la vez, el indice UNIQUE (user) tumba
    // al segundo create. Releer es la recuperacion correcta.
    console.log("[workout_stats] create fallido para " + userId + ", reintentando lectura:", err)
    try {
      var retry = $app.findRecordsByFilter("user_stats", "user = {:u}", "", 1, 0, { u: userId })
      if (retry && retry.length > 0) return retry[0]
    } catch (err2) {
      console.log("[workout_stats] relectura fallida para " + userId + ":", err2)
    }
    return null
  }
}

/**
 * Racha resultante, en SQL. Se evalua contra los valores ANTERIORES de la fila
 * (SQLite calcula todos los SET sobre la fila original), asi que sirve tanto
 * para `workout_streak_current` como, dentro de un MAX(), para el `best`.
 *
 *   - primera vez (sin last)     → 1
 *   - dia siguiente al ultimo    → racha + 1
 *   - hueco de mas de un dia     → vuelve a 1
 *   - mismo dia                  → se queda igual (varias sesiones al dia no
 *                                  inflan la racha)
 *   - dia anterior (retroactiva) → se queda igual. Recalcularla hacia atras
 *     exigiria releer todo el historial en cada create; el recomputo completo
 *     es trabajo del backfill (migracion 1783600000).
 */
var NEW_STREAK_SQL = `
  CASE
    WHEN last_workout_date IS NULL OR last_workout_date = '' THEN 1
    WHEN {:day} > last_workout_date AND last_workout_date = {:prev}
      THEN COALESCE(workout_streak_current, 0) + 1
    WHEN {:day} > last_workout_date THEN 1
    ELSE COALESCE(workout_streak_current, 0)
  END`

/**
 * Registra un entrenamiento completado el dia `day` ("YYYY-MM-DD"):
 * incrementa `total_sessions` y actualiza la racha. `workout_streak_best` nunca
 * retrocede.
 *
 * TODO EN UN SOLO UPDATE, A PROPOSITO. Leer el record, sumarle 1 y guardarlo
 * (lo que hacia el hook viejo de circuitos) pierde incrementos cuando entran
 * varias sesiones a la vez: la cola de reintentos de cardio vaciandose, o un
 * doble toque. Con 15 creates en paralelo el contador se quedaba corto de
 * verdad — hay un test que lo cubre. Un UPDATE atomico no puede perderlos.
 *
 * El precio es que el SQL no dispara `onRecordAfterUpdateSuccess`, asi que el
 * hito de racha hay que notificarlo aqui a mano (misma funcion que usa el hook,
 * no una copia). `user_stats` no tiene suscripciones realtime, comprobado, asi
 * que saltarse la API de records no deja a nadie sin enterarse.
 */
function recordWorkout(userId, day) {
  if (!userId) return
  if (!DAY_RE.test(day || "")) day = serverToday()

  var stats = findOrCreateStats(userId)
  if (!stats) return

  var statsId = stats.getString("id")
  var oldStreak = stats.getInt("workout_streak_current") || 0

  $app.db().newQuery(`
    UPDATE user_stats SET
      total_sessions = COALESCE(total_sessions, 0) + 1,
      workout_streak_current = ${NEW_STREAK_SQL},
      workout_streak_best = MAX(COALESCE(workout_streak_best, 0), ${NEW_STREAK_SQL}),
      last_workout_date = CASE
        WHEN last_workout_date IS NULL OR last_workout_date = '' OR {:day} > last_workout_date
          THEN {:day}
        ELSE last_workout_date
      END,
      updated_at = {:stamp}
    WHERE id = {:id}
  `).bind({
    day: day,
    prev: shiftDay(day, -1),
    stamp: new Date().toISOString().replace("T", " "),
    id: statsId,
  }).execute()

  try {
    var fresh = $app.findRecordById("user_stats", statsId)
    var notifications = require(`${__hooks}/utils/notifications.js`)
    notifications.checkStreakMilestone(userId, oldStreak, fresh.getInt("workout_streak_current") || 0)
  } catch (err) {
    console.log("[workout_stats] milestone de racha fallido para " + userId + ":", err)
  }
}

module.exports = {
  serverToday: serverToday,
  dayFromTimestamp: dayFromTimestamp,
  workoutDayOf: workoutDayOf,
  shiftDay: shiftDay,
  findOrCreateStats: findOrCreateStats,
  recordWorkout: recordWorkout,
}
