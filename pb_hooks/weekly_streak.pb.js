/// <reference path="../pb_data/types.d.ts" />

/**
 * weekly_streak.pb.js — mantiene viva la racha SEMANAL de `user_stats` fuera de
 * los entrenos (#801). El recalculo en cada entreno vive en
 * `utils/workout_stats.js`; aqui van los dos casos en los que la racha cambia
 * sin que nadie entrene:
 *
 *   1. Cambia el objetivo (`settings.weekly_goal_log`, lo escribe el cliente al
 *      cambiar de programa, de fase o de objetivo). El cambio se aplica a la
 *      semana entera, asi que la racha puede subir o bajar en el acto. Sin push:
 *      bajar el objetivo no es un logro que anunciar a los seguidores.
 *   2. Termina una semana sin cumplir. La racha diaria vieja se quedaba
 *      congelada hasta el siguiente entreno y el ranking enseñaba rachas
 *      muertas; el lunes se recalculan todas las que siguen vivas.
 *
 * Cada handler corre en un JSVM aislado: de ahi el `require` dentro de cada
 * uno, y un cron que lanza muere EN SILENCIO, asi que todo va en try/catch.
 */

console.log("[weekly_streak] hook file loaded")

// Handlers EN LINEA: una funcion top-level del fichero no existe dentro del
// runtime aislado del handler (y el guardarrail de `e.next()` solo lee
// callbacks en linea). La logica compartida vive en el util.
onRecordAfterUpdateSuccess(function (e) {
  e.next()
  try {
    require(`${__hooks}/utils/weekly_streak.js`).recomputeOnGoalLogChange(e.record)
  } catch (err) {
    console.log("[weekly_streak] recalculo por cambio de objetivo fallido:", err)
  }
}, "settings")

onRecordAfterCreateSuccess(function (e) {
  e.next()
  try {
    require(`${__hooks}/utils/weekly_streak.js`).recomputeOnGoalLogChange(e.record)
  } catch (err) {
    console.log("[weekly_streak] recalculo por cambio de objetivo fallido:", err)
  }
}, "settings")

// Lunes 00:30 UTC: la semana de calendario del servidor acaba de cerrar. Quien
// entrena el domingo por la noche en America llega despues con su sesion del
// domingo; ese entreno recalcula su racha entera y la recupera.
cronAdd("weekly_streak_rollover", "30 0 * * 1", function () {
  try {
    var weekly = require(`${__hooks}/utils/weekly_streak.js`)
    var stats = require(`${__hooks}/utils/workout_stats.js`)
    var today = stats.serverToday()
    var rows = arrayOf(new DynamicModel({ user: "" }))
    $app.db().newQuery(
      "SELECT \"user\" AS user FROM user_stats WHERE COALESCE(workout_streak_current, 0) > 0"
    ).all(rows)
    var changed = 0
    for (var i = 0; i < rows.length; i++) {
      var userId = String(rows[i].user)
      try {
        $app.runInTransaction(function (txApp) {
          if (weekly.recomputeStreak(txApp, userId, today).current === 0) changed++
        })
      } catch (err) {
        console.log("[weekly_streak] rollover fallido para " + userId + ":", err)
      }
    }
    console.log("[weekly_streak] rollover: " + rows.length + " rachas revisadas, " + changed + " a cero")
  } catch (err) {
    console.log("[weekly_streak] rollover fallido:", err)
  }
})
