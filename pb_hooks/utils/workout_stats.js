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
 * RACHA SEMANAL (#801). `workout_streak_current` cuenta semanas naturales
 * (lunes a domingo) seguidas en las que el usuario entreno al menos
 * `STREAK_WEEKLY_GOAL` dias distintos. La diaria mandaba la racha a 1 con un
 * solo dia de descanso, y los programas oficiales tienen descansos fijos.
 * Misma regla que `packages/core/lib/streak.ts`; si cambia una, cambia la otra.
 *
 * Estado en la fila, ademas de la racha:
 *   - `streak_week_start`: lunes ("YYYY-MM-DD") de la ultima semana con entreno.
 *   - `streak_week_mask`:  dias de esa semana con entreno, como bits
 *                          (lunes = 1, martes = 2 ... domingo = 64).
 *
 * La mascara es lo que deja hacer todo en el UPDATE atomico sin releer el
 * historial: una sesion retroactiva dentro de la misma semana hace OR de un bit
 * que quiza ya estaba puesto, asi que el mismo dia nunca cuenta dos veces.
 */
var STREAK_WEEKLY_GOAL = 2

/** Dias distintos (bits a 1) de una mascara semanal, en SQL. */
function popcountSql(expr) {
  var terms = []
  for (var i = 0; i < 7; i++) terms.push("((" + expr + " >> " + i + ") & 1)")
  return "(" + terms.join(" + ") + ")"
}

var OLD_MASK = "COALESCE(streak_week_mask, 0)"
var NO_WEEK = "(streak_week_start IS NULL OR streak_week_start = '')"

/**
 * Racha resultante, en SQL. Se evalua contra los valores ANTERIORES de la fila
 * (SQLite calcula todos los SET sobre la fila original), asi que sirve tanto
 * para `workout_streak_current` como, dentro de un MAX(), para el `best`.
 *
 *   - primera vez (sin semana)     → 0 (un dia no cumple la semana)
 *   - misma semana                 → +1 solo si este dia la hace llegar al
 *                                    objetivo; si ya lo tenia, igual
 *   - semana nueva                 → la racha sigue si la semana guardada
 *                                    cumplio Y es justo la anterior; si no, 0.
 *                                    El dia nuevo abre la semana (no la cumple)
 *   - semana anterior (retroactiva) → se queda igual. Recalcularla hacia atras
 *     exigiria releer todo el historial en cada create; el recomputo completo
 *     es trabajo del backfill (migracion 1790440000).
 */
var NEW_STREAK_SQL = `
  CASE
    WHEN ${NO_WEEK} THEN {:opens}
    WHEN {:week} = streak_week_start THEN
      COALESCE(workout_streak_current, 0) +
      CASE
        WHEN ${popcountSql(OLD_MASK)} < ${STREAK_WEEKLY_GOAL}
         AND ${popcountSql("(" + OLD_MASK + " | {:bit})")} >= ${STREAK_WEEKLY_GOAL}
          THEN 1
        ELSE 0
      END
    WHEN {:week} > streak_week_start THEN
      CASE
        WHEN streak_week_start = {:prevWeek}
         AND ${popcountSql(OLD_MASK)} >= ${STREAK_WEEKLY_GOAL}
          THEN COALESCE(workout_streak_current, 0)
        ELSE 0
      END + {:opens}
    ELSE COALESCE(workout_streak_current, 0)
  END`

/** "YYYY-MM-DD" → lunes de su semana, "YYYY-MM-DD". */
function weekStartOf(day) {
  var parts = day.split("-")
  var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
  // getUTCDay: domingo = 0. Lunes → 0 dias atras, domingo → 6.
  return shiftDay(day, -((d.getUTCDay() + 6) % 7))
}

/** "YYYY-MM-DD" → bit de su dia en la mascara semanal (lunes = 1 ... domingo = 64). */
function weekdayBit(day) {
  var parts = day.split("-")
  var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
  return 1 << ((d.getUTCDay() + 6) % 7)
}

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
  var week = weekStartOf(day)
  var bit = weekdayBit(day)

  $app.db().newQuery(`
    UPDATE user_stats SET
      total_sessions = COALESCE(total_sessions, 0) + 1,
      workout_streak_current = ${NEW_STREAK_SQL},
      workout_streak_best = MAX(COALESCE(workout_streak_best, 0), ${NEW_STREAK_SQL}),
      streak_week_mask = CASE
        WHEN ${NO_WEEK} OR {:week} > streak_week_start THEN {:bit}
        WHEN {:week} = streak_week_start THEN ${OLD_MASK} | {:bit}
        ELSE ${OLD_MASK}
      END,
      streak_week_start = CASE
        WHEN ${NO_WEEK} OR {:week} > streak_week_start THEN {:week}
        ELSE streak_week_start
      END,
      last_workout_date = CASE
        WHEN last_workout_date IS NULL OR last_workout_date = '' OR {:day} > last_workout_date
          THEN {:day}
        ELSE last_workout_date
      END,
      updated_at = {:stamp}
    WHERE id = {:id}
  `).bind({
    day: day,
    week: week,
    prevWeek: shiftDay(week, -7),
    bit: bit,
    // Una semana recien abierta con un solo dia cumple el objetivo solo si
    // el objetivo fuera 1. Hoy siempre 0, pero la regla no depende de ello.
    opens: STREAK_WEEKLY_GOAL <= 1 ? 1 : 0,
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
  weekStartOf: weekStartOf,
  weekdayBit: weekdayBit,
  STREAK_WEEKLY_GOAL: STREAK_WEEKLY_GOAL,
  findOrCreateStats: findOrCreateStats,
  recordWorkout: recordWorkout,
}
