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
 * Registra un entrenamiento completado el dia `day` ("YYYY-MM-DD"):
 * incrementa `total_sessions`, mueve `last_workout_date` y recalcula la racha
 * SEMANAL desde el historial (`utils/weekly_streak.js`, #801).
 *
 * `total_sessions` sigue siendo un `+ 1` en SQL, nunca "leer, sumar, guardar":
 * eso perdia incrementos con varias sesiones a la vez (la cola de reintentos de
 * cardio vaciandose, un doble toque). Hay un test con 15 creates en paralelo.
 *
 * La racha ya no se puede llevar en un UPDATE incremental: una sesion metida
 * con fecha pasada puede completar una semana vieja y un cambio de objetivo se
 * aplica a la semana entera. Se recalcula entera en cada entreno, y el
 * incremento y el recalculo van en UNA transaccion. PocketBase serializa las
 * transacciones de escritura en una sola conexion, asi que la lectura de dias
 * ve todas las sesiones ya guardadas y ninguna escritura con datos mas viejos
 * puede pisar a esta. El historial de un usuario son unos cientos de filas.
 *
 * El SQL no dispara `onRecordAfterUpdateSuccess`, asi que el hito de racha se
 * notifica aqui a mano (misma funcion que usa el hook, no una copia).
 * `user_stats` no tiene suscripciones realtime, comprobado, asi que saltarse la
 * API de records no deja a nadie sin enterarse.
 */
function recordWorkout(userId, day) {
  if (!userId) return
  if (!DAY_RE.test(day || "")) day = serverToday()

  var stats = findOrCreateStats(userId)
  if (!stats) return

  var statsId = stats.getString("id")
  var weekly = require(`${__hooks}/utils/weekly_streak.js`)
  var oldStreak = 0
  var newStreak = 0
  var bestStreak = 0
  var totalWorkouts = 0

  $app.runInTransaction(function (txApp) {
    // Se lee dentro de la transaccion: fuera, otra sesion en paralelo podria
    // cambiarla entre la lectura y el recalculo y el hito saldria dos veces.
    var rows = arrayOf(new DynamicModel({ current: 0 }))
    txApp.db().newQuery(
      "SELECT COALESCE(workout_streak_current, 0) AS current FROM user_stats WHERE id = {:id}"
    ).bind({ id: statsId }).all(rows)
    oldStreak = rows.length > 0 ? Number(rows[0].current) || 0 : 0

    txApp.db().newQuery(`
      UPDATE user_stats SET
        total_sessions = COALESCE(total_sessions, 0) + 1,
        last_workout_date = CASE
          WHEN last_workout_date IS NULL OR last_workout_date = '' OR {:day} > last_workout_date
            THEN {:day}
          ELSE last_workout_date
        END,
        updated_at = {:stamp}
      WHERE id = {:id}
    `).bind({
      day: day,
      stamp: new Date().toISOString().replace("T", " "),
      id: statsId,
    }).execute()

    var recomputed = weekly.recomputeStreak(txApp, userId, serverToday())
    newStreak = recomputed.current
    bestStreak = recomputed.best

    var totals = arrayOf(new DynamicModel({ total: 0 }))
    txApp.db().newQuery(
      "SELECT COALESCE(total_sessions, 0) AS total FROM user_stats WHERE id = {:id}"
    ).bind({ id: statsId }).all(totals)
    totalWorkouts = totals.length > 0 ? Number(totals[0].total) || 0 : 0
  })

  try {
    var notifications = require(`${__hooks}/utils/notifications.js`)
    notifications.checkStreakMilestone(userId, oldStreak, newStreak)
  } catch (err) {
    console.log("[workout_stats] milestone de racha fallido para " + userId + ":", err)
  }

  // Logros tempranos (#802). Fuera de la transaccion y con su propio try: un
  // fallo aqui no debe tumbar ni la racha ni el guardado de la sesion.
  try {
    var achievements = require(`${__hooks}/utils/achievements.js`)
    achievements.awardEarlyAchievements(userId, {
      totalWorkouts: totalWorkouts,
      bestWeeklyStreak: bestStreak,
    })
  } catch (err) {
    console.log("[workout_stats] logros tempranos fallidos para " + userId + ":", err)
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
