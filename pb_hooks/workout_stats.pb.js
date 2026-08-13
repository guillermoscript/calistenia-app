/// <reference path="../pb_data/types.d.ts" />

/**
 * workout_stats.pb.js — mantiene `user_stats` al dia con TODOS los tipos de
 * entrenamiento (issue #412).
 *
 * Antes solo `circuit_sessions` escribia aqui, y ademas se rendia si la fila no
 * existia. Como nadie crea la fila al registrarse, quien entrenaba con sesiones
 * de fuerza no acumulaba nada: los perfiles ajenos y tres pestañas de la
 * Clasificacion enseñaban 0 sesiones y 0 racha aunque el calendario y las
 * "Sesiones recientes" de esa misma pantalla si tuvieran datos.
 *
 * Las tres colecciones se crean SOLO al completar el entrenamiento, nunca al
 * empezarlo (`useProgress.ts` para fuerza, los dos `*SessionContext` para
 * circuito y cardio), asi que `onRecordAfterCreateSuccess` no cuenta sesiones
 * abandonadas.
 *
 * La logica vive en utils/workout_stats.js: cada handler corre en un JSVM
 * aislado, de ahi el `require` dentro de cada uno.
 *
 * OJO CON `e.next()`. Los hooks de PocketBase son una cadena tipo middleware:
 * un handler que no lo llama corta la cadena y los handlers que otros ficheros
 * registraron para la misma coleccion NO corren. `notification_service.pb.js`
 * se carga antes que este (por orden alfabetico) y registra handlers para las
 * tres colecciones, asi que hasta que se le añadio `e.next()` estos de aqui no
 * se ejecutaban nunca — sin un solo error en el log.
 */

console.log("[workout_stats] hook file loaded")

// Fuerza / yoga / sesiones libres. `completed_at` trae hora de pared local, asi
// que su fecha es la del usuario — y puede ser retroactiva si registro la
// sesion a mano para un dia pasado.
onRecordAfterCreateSuccess(function (e) {
  e.next()
  try {
    var stats = require(`${__hooks}/utils/workout_stats.js`)
    var userId = e.record.getString("user")
    if (!userId) return
    stats.recordWorkout(userId, stats.workoutDayOf(e.record, ["completed_at"]))
  } catch (err) {
    console.log("[workout_stats] hook sessions error:", err)
  }
}, "sessions")

// Circuitos. Sin campo `created`: la fecha sale de finished_at/started_at (ISO
// UTC) y, si vinieran vacios, del dia del servidor — que es lo que hacia el
// hook original que vivia en notification_service.pb.js.
onRecordAfterCreateSuccess(function (e) {
  e.next()
  try {
    var stats = require(`${__hooks}/utils/workout_stats.js`)
    var userId = e.record.getString("user")
    if (!userId) return
    stats.recordWorkout(userId, stats.workoutDayOf(e.record, ["finished_at", "started_at"]))
  } catch (err) {
    console.log("[workout_stats] hook circuit_sessions error:", err)
  }
}, "circuit_sessions")

// Cardio. Mismo caso que circuitos, y ademas tiene cola de reintentos en el
// cliente: por eso importa usar la fecha del record y no la de llegada.
onRecordAfterCreateSuccess(function (e) {
  e.next()
  try {
    var stats = require(`${__hooks}/utils/workout_stats.js`)
    var userId = e.record.getString("user")
    if (!userId) return
    stats.recordWorkout(userId, stats.workoutDayOf(e.record, ["finished_at", "started_at"]))
  } catch (err) {
    console.log("[workout_stats] hook cardio_sessions error:", err)
  }
}, "cardio_sessions")
