/// <reference path="../../pb_data/types.d.ts" />

/**
 * Logros tempranos en el servidor (#802): la version de PocketBase de
 * `packages/core/lib/achievements.ts`.
 *
 * `evaluateEarlyAchievements` y la tabla EARLY son copia de las de core; el test
 * `packages/core/lib/achievements.server.test.ts` carga este fichero sin
 * PocketBase y comprueba que dan lo mismo. Si cambias una regla aqui, cambiala
 * en core.
 *
 * Reglas:
 * - first_workout: 1 entreno completado (de cualquier tipo).
 * - three_workouts: 3 entrenos completados.
 * - first_week_complete: alguna semana de calendario llego a su objetivo semanal
 *   (la mejor racha semanal, `workout_streak_best`, es >= 1).
 *
 * Es CommonJS sin dependencias en el nivel superior para que lo carguen igual
 * goja y node.
 */

var EARLY = [
  { key: "first_workout", kind: "workouts", target: 1 },
  { key: "three_workouts", kind: "workouts", target: 3 },
  { key: "first_week_complete", kind: "weeks", target: 1 },
]

/** Solo se avisa a cuentas recien llegadas: a un veterano no se le avisa de lo que ya hizo hace meses. */
var NOTIFY_MAX_WORKOUTS = 10

/**
 * @param stats {{totalWorkouts: number, bestWeeklyStreak: number}}
 * @returns array de keys cumplidas, en orden de catalogo
 */
function evaluateEarlyAchievements(stats) {
  var workouts = Number(stats && stats.totalWorkouts) || 0
  var weeks = Number(stats && stats.bestWeeklyStreak) || 0
  var out = []
  for (var i = 0; i < EARLY.length; i++) {
    var def = EARLY[i]
    var value = def.kind === "workouts" ? workouts : weeks
    if (value >= def.target) out.push(def.key)
  }
  return out
}

function shouldNotify(totalWorkouts) {
  return (Number(totalWorkouts) || 0) <= NOTIFY_MAX_WORKOUTS
}

/**
 * Crea las filas de `user_achievements` que falten para `userId` (una sola vez
 * por logro y usuario) y devuelve las keys recien desbloqueadas. La
 * comprobacion y el create van en UNA transaccion: dos entrenos en paralelo no
 * pueden duplicar la fila.
 *
 * @returns {string[]} keys desbloqueadas ahora
 */
function awardEarlyAchievements(userId, stats) {
  if (!userId) return []
  var reached = evaluateEarlyAchievements(stats)
  if (reached.length === 0) return []

  var unlockedNow = []
  var stamp = new Date().toISOString().replace("T", " ")

  $app.runInTransaction(function (txApp) {
    var userAch = txApp.findCollectionByNameOrId("user_achievements")
    for (var i = 0; i < reached.length; i++) {
      var key = reached[i]
      var def
      try {
        def = txApp.findFirstRecordByFilter("achievements", "key = {:k}", { k: key })
      } catch (err) {
        // La migracion de siembra aun no corrio: nada que enlazar.
        console.log("[achievements] sin fila de catalogo para " + key)
        continue
      }
      var existing = []
      try {
        existing = txApp.findRecordsByFilter(
          "user_achievements", "user = {:u} && achievement = {:a}", "", 1, 0,
          { u: userId, a: def.getString("id") }
        )
      } catch (err) {
        existing = []
      }
      if (existing && existing.length > 0) {
        var row = existing[0]
        if (row.getBool("unlocked")) continue
        row.set("unlocked", true)
        row.set("progress", def.getInt("requirement_value"))
        row.set("unlocked_at", stamp)
        txApp.save(row)
      } else {
        var rec = new Record(userAch)
        rec.set("user", userId)
        rec.set("achievement", def.getString("id"))
        rec.set("progress", def.getInt("requirement_value"))
        rec.set("unlocked", true)
        rec.set("unlocked_at", stamp)
        txApp.save(rec)
      }
      unlockedNow.push(key)
    }
  })

  if (unlockedNow.length > 0 && shouldNotify(stats.totalWorkouts)) {
    try {
      var notifications = require(`${__hooks}/utils/notifications.js`)
      // Una sola notificacion por entreno: la ultima del catalogo (la mas significativa).
      var key = unlockedNow[unlockedNow.length - 1]
      var meta = META[key]
      notifications.createSelfNotification(userId, "achievement", key, "achievement", {
        achievementKey: key,
        achievementName: meta.name.en,
        achievementIcon: meta.icon,
      })
      notifications.sendPush(
        userId,
        { es: meta.icon + " Logro desbloqueado: " + meta.name.es, en: meta.icon + " Achievement unlocked: " + meta.name.en },
        { es: meta.body.es, en: meta.body.en },
        "/achievements",
        "achievement"
      )
    } catch (err) {
      console.log("[achievements] aviso fallido para " + userId + ":", err)
    }
  }
  return unlockedNow
}

// Textos del push (el servidor no lee los locales de las apps; mismo patron
// {es,en} que el resto de pushes, #804).
var META = {
  first_workout: { icon: "🏁", name: { es: "Primer entreno", en: "First workout" }, body: { es: "Ya has dado el primer paso. Ahora, el segundo.", en: "You took the first step. Now the second." } },
  three_workouts: { icon: "💪", name: { es: "Tres entrenos", en: "Three workouts" }, body: { es: "Tres entrenos hechos: ya es un habito.", en: "Three workouts done: it's becoming a habit." } },
  first_week_complete: { icon: "📅", name: { es: "Primera semana completa", en: "First full week" }, body: { es: "Cumpliste tu objetivo semanal.", en: "You hit your weekly goal." } },
}

module.exports = {
  EARLY: EARLY,
  NOTIFY_MAX_WORKOUTS: NOTIFY_MAX_WORKOUTS,
  evaluateEarlyAchievements: evaluateEarlyAchievements,
  shouldNotify: shouldNotify,
  awardEarlyAchievements: awardEarlyAchievements,
}
