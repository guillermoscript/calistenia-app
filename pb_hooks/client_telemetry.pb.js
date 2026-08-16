/// <reference path="../pb_data/types.d.ts" />

/**
 * Anota en `users` qué versión de la app usa cada persona.
 *
 * PUNTO DE ENGANCHE: autenticar, no cada petición. La app llama a
 * `tryRefreshAuth()` en cada arranque en frío (packages/core/lib/pocketbase.ts),
 * así que auth-refresh cubre a todo usuario activo con una frecuencia perfecta
 * — a diferencia de un hook sobre las lecturas, que escribiría la fila del
 * usuario decenas de veces por sesión.
 *
 * `onRecordAuthRequest` cubre además el primer login (contraseña y OAuth), que
 * es cuando alguien reinstala o estrena móvil.
 *
 * OJO: en estos eventos `e.request` es UNDEFINED — las cabeceras salen de
 * `e.requestInfo()` (una función aquí, una propiedad en onRecordEnrich) y
 * llegan en snake_case: `x_app_platform`. Detalle en utils/client_telemetry.js.
 *
 * Todo el trabajo va envuelto en try/catch dentro del util y SIEMPRE se llama a
 * `e.next()`: los hooks de PocketBase son una cadena y el que no continúa deja
 * sin correr a los de los OTROS ficheros, en silencio (#412). Y este cuelga del
 * camino de login: aquí un fallo no puede costar una sesión.
 */
onRecordAuthRequest((e) => {
  var telemetry = require(`${__hooks}/utils/client_telemetry.js`)
  telemetry.recordClientIdentity(e)
  e.next()
}, "users")

onRecordAuthRefreshRequest((e) => {
  var telemetry = require(`${__hooks}/utils/client_telemetry.js`)
  telemetry.recordClientIdentity(e)
  e.next()
}, "users")
