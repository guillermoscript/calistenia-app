/// <reference path="../../pb_data/types.d.ts" />

/**
 * Racha SEMANAL en el servidor (#801): la version de `user_stats` de
 * `packages/core/lib/weeklyStreak.ts`.
 *
 * UN SOLO ALGORITMO. `computeWeeklyStreak` y `goalForWeekFromChanges` son una
 * copia linea a linea de las de core, y las dos pasan los mismos casos
 * (`packages/core/lib/__fixtures__/weekly-streak.json`; el test del servidor es
 * `packages/core/lib/weeklyStreak.server.test.ts`, que carga este fichero
 * sin PocketBase).
 * Si cambias una regla aqui, cambiala en core y en el fixture.
 *
 * Reglas (mismas que core):
 * - Semana de calendario, de lunes a domingo.
 * - Cuentan DIAS distintos con entreno de cualquier tipo: `sessions` (fuerza,
 *   yoga, sesion libre), `circuit_sessions` y `cardio_sessions`.
 * - Una semana se cumple si sus dias llegan a su objetivo. La semana en curso
 *   suma si ya se cumplio y no rompe la racha mientras no termine.
 * - El objetivo de una semana es el vigente en su ULTIMO dia, segun el
 *   historial `settings.weekly_goal_log` (`[{from, goal}]`) que escribe el
 *   cliente cada vez que cambia su objetivo efectivo. Antes del primer cambio
 *   vale `FALLBACK_GOAL` (3): el programa activo de semanas pasadas no se puede
 *   reconstruir, y la issue fija 3 como objetivo historico.
 *
 * Es CommonJS sin dependencias para que lo carguen igual el `require` de goja
 * y el de node (el test del fixture).
 */

var DAY_RE = /^\d{4}-\d{2}-\d{2}$/
var MS_PER_DAY = 86400000

/** Objetivo de las semanas anteriores al primer cambio del historial. */
var FALLBACK_GOAL = 3

/** Hitos de racha en semanas. Mismos que `WEEKLY_STREAK_MILESTONES` de core. */
var WEEKLY_STREAK_MILESTONES = [4, 8, 12, 26, 52]

function isDayStr(day) {
  if (typeof day !== "string" || !DAY_RE.test(day)) return false
  var p = day.split("-")
  var y = Number(p[0]), m = Number(p[1]), d = Number(p[2])
  var date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function dayNumber(day) {
  var p = day.split("-")
  return Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / MS_PER_DAY)
}

function dayFromNumber(n) {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10)
}

function shiftDay(day, offset) {
  return dayFromNumber(dayNumber(day) + offset)
}

function mondayOf(day) {
  var n = dayNumber(day)
  // 1970-01-01 fue jueves: (n + 3) % 7 da 0 = lunes ... 6 = domingo.
  var isoIndex = (((n + 3) % 7) + 7) % 7
  return dayFromNumber(n - isoIndex)
}

function clampGoal(goal) {
  if (typeof goal !== "number" || !isFinite(goal)) return 1
  return Math.min(7, Math.max(1, Math.round(goal)))
}

/**
 * @param doneDates  array de "YYYY-MM-DD" (repetidos, invalidos y futuros se ignoran)
 * @param goalForWeek numero fijo o function(weekStart, lastDay) → numero
 * @param today "YYYY-MM-DD"
 * @returns {{current, best, thisWeek: {weekStart, done, goal, met, remaining}}}
 */
function computeWeeklyStreak(doneDates, goalForWeek, today) {
  var goalOf = function (weekStart, lastDay) {
    return clampGoal(typeof goalForWeek === "number" ? goalForWeek : goalForWeek(weekStart, lastDay))
  }

  var currentWeek = mondayOf(today)
  var daysByWeek = {}
  var firstWeek = null
  for (var i = 0; i < doneDates.length; i++) {
    var day = doneDates[i]
    if (!isDayStr(day) || day > today) continue
    var week = mondayOf(day)
    if (!daysByWeek[week]) daysByWeek[week] = {}
    daysByWeek[week][day] = true
    if (!firstWeek || week < firstWeek) firstWeek = week
  }

  var doneIn = function (w) {
    return daysByWeek[w] ? Object.keys(daysByWeek[w]).length : 0
  }
  var metIn = function (w) {
    var lastDay = w === currentWeek ? today : shiftDay(w, 6)
    return doneIn(w) >= goalOf(w, lastDay)
  }

  var thisGoal = goalOf(currentWeek, today)
  var thisDone = doneIn(currentWeek)
  var thisMet = thisDone >= thisGoal

  // Racha actual: hacia atras desde la semana pasada; la en curso solo suma.
  var current = thisMet ? 1 : 0
  if (firstWeek) {
    for (var w = shiftDay(currentWeek, -7); w >= firstWeek && metIn(w); w = shiftDay(w, -7)) {
      current++
    }
  }

  // Mejor racha: de la primera semana con entreno a la en curso. La en curso
  // sin cumplir cierra el recorrido sin romper nada.
  var best = current
  if (firstWeek) {
    var run = 0
    var weeks = (dayNumber(currentWeek) - dayNumber(firstWeek)) / 7
    for (var k = 0; k <= weeks; k++) {
      var wk = shiftDay(firstWeek, k * 7)
      if (wk === currentWeek && !thisMet) break
      run = metIn(wk) ? run + 1 : 0
      if (run > best) best = run
    }
  }

  return {
    current: current,
    best: best,
    thisWeek: {
      weekStart: currentWeek,
      done: thisDone,
      goal: thisGoal,
      met: thisMet,
      remaining: Math.max(0, thisGoal - thisDone),
    },
  }
}

/**
 * Objetivo de cada semana a partir del historial de cambios: el del ultimo
 * cambio con `from <= lastDay`; antes del primero, `fallback`.
 */
function goalForWeekFromChanges(changes, fallback) {
  var ordered = (changes || []).filter(function (c) {
    return c && isDayStr(c.from)
  }).sort(function (a, b) {
    return a.from < b.from ? -1 : a.from > b.from ? 1 : 0
  })
  return function (_weekStart, lastDay) {
    var goal = fallback
    for (var i = 0; i < ordered.length; i++) {
      if (ordered[i].from <= lastDay) goal = ordered[i].goal
      else break
    }
    return goal
  }
}

/** Texto JSON de `settings.weekly_goal_log` → array de cambios validos. */
function parseGoalLog(raw) {
  if (!raw) return []
  var parsed
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw
  } catch (err) {
    return []
  }
  if (!Array.isArray(parsed)) return []
  var out = []
  for (var i = 0; i < parsed.length; i++) {
    var c = parsed[i]
    if (c && isDayStr(c.from) && typeof c.goal === "number" && isFinite(c.goal)) {
      out.push({ from: c.from, goal: c.goal })
    }
  }
  return out
}

/**
 * Dias distintos con entreno de un usuario, de las tres colecciones.
 *
 * Mismas fechas que `workoutDayOf` en el hook: los 10 primeros caracteres de
 * `sessions.completed_at` (hora de pared local del usuario) y de
 * `finished_at`/`started_at` en circuito y cardio (ISO UTC). El cliente saca
 * los dias con la misma regla (`streakDaysFromRows` en core) para que su racha
 * y la de `user_stats` no puedan divergir.
 */
function activityDaysOf(app, userId) {
  var rows = arrayOf(new DynamicModel({ day: "" }))
  app.db().newQuery(`
    SELECT DISTINCT day FROM (
      SELECT substr(COALESCE(completed_at, ''), 1, 10) AS day
        FROM sessions WHERE "user" = {:u}
      UNION ALL
      SELECT substr(COALESCE(NULLIF(finished_at, ''), started_at, ''), 1, 10) AS day
        FROM circuit_sessions WHERE "user" = {:u}
      UNION ALL
      SELECT substr(COALESCE(NULLIF(finished_at, ''), started_at, ''), 1, 10) AS day
        FROM cardio_sessions WHERE "user" = {:u}
    )
  `).bind({ u: userId }).all(rows)
  var out = []
  for (var i = 0; i < rows.length; i++) out.push(String(rows[i].day))
  return out
}

/** Historial de objetivos del usuario (vacio si no hay fila o campo). */
function goalLogOf(app, userId) {
  try {
    var rows = arrayOf(new DynamicModel({ log: "" }))
    app.db().newQuery(`
      SELECT COALESCE(weekly_goal_log, '') AS log FROM settings WHERE "user" = {:u} LIMIT 1
    `).bind({ u: userId }).all(rows)
    return rows.length > 0 ? parseGoalLog(String(rows[0].log)) : []
  } catch (err) {
    console.log("[weekly_streak] historial de objetivos ilegible para " + userId + ":", err)
    return []
  }
}

/**
 * Recalcula la racha de `userId` desde su historial y la escribe en su fila de
 * `user_stats` con SQL crudo (no dispara hooks: los hitos los notifica quien
 * llama). `best` se SOBRESCRIBE con el calculado: un solo algoritmo, sin MAX
 * con valores de otra regla.
 *
 * Llamalo con el `app` de una transaccion (`$app.runInTransaction`) cuando
 * importe la concurrencia: PocketBase serializa las transacciones de escritura
 * en una sola conexion, asi que la lectura de dias ve todo lo ya guardado y
 * ninguna escritura mas vieja puede pisar a esta.
 *
 * @returns {{current, best}} lo que se guardo
 */
function recomputeStreak(app, userId, today) {
  var result = computeWeeklyStreak(
    activityDaysOf(app, userId),
    goalForWeekFromChanges(goalLogOf(app, userId), FALLBACK_GOAL),
    today
  )
  app.db().newQuery(`
    UPDATE user_stats SET
      workout_streak_current = {:current},
      workout_streak_best = {:best},
      updated_at = {:stamp}
    WHERE "user" = {:u}
  `).bind({
    current: result.current,
    best: result.best,
    stamp: new Date().toISOString().replace("T", " "),
    u: userId,
  }).execute()
  return { current: result.current, best: result.best }
}

/**
 * Tras guardar un `settings`: si su `weekly_goal_log` cambio, recalcula la
 * racha de su usuario (sin push; ver `weekly_streak.pb.js`).
 */
function recomputeOnGoalLogChange(record) {
  var userId = record.getString("user")
  if (!userId) return
  var original = record.original ? record.original() : null
  var before = original ? original.getString("weekly_goal_log") : ""
  if (before === record.getString("weekly_goal_log")) return
  var stats = require(`${__hooks}/utils/workout_stats.js`)
  $app.runInTransaction(function (txApp) {
    recomputeStreak(txApp, userId, stats.serverToday())
  })
}

module.exports = {
  FALLBACK_GOAL: FALLBACK_GOAL,
  WEEKLY_STREAK_MILESTONES: WEEKLY_STREAK_MILESTONES,
  isDayStr: isDayStr,
  mondayOf: mondayOf,
  shiftDay: shiftDay,
  computeWeeklyStreak: computeWeeklyStreak,
  goalForWeekFromChanges: goalForWeekFromChanges,
  parseGoalLog: parseGoalLog,
  activityDaysOf: activityDaysOf,
  goalLogOf: goalLogOf,
  recomputeStreak: recomputeStreak,
  recomputeOnGoalLogChange: recomputeOnGoalLogChange,
}
