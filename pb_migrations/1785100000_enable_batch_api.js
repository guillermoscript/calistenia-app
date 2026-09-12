/// <reference path="../pb_data/types.d.ts" />
/**
 * #614 — habilita la API batch de PocketBase (`POST /api/batch`).
 *
 * Duplicar un programa creaba las fases, los day-configs y los ejercicios de uno
 * en uno, con un `await` por fila: el programa más grande de la base (732
 * ejercicios) son ~764 viajes en serie, y si el navegador se cerraba a mitad
 * quedaba una copia incompleta que nadie limpiaba. La API batch manda todas esas
 * altas en una petición y las ejecuta dentro de UNA transacción de servidor: o
 * entran todas o no entra ninguna.
 *
 * Va desactivada de fábrica en PocketBase, así que sin esta migración
 * `/api/batch` responde 404. `duplicateProgram` sabe reconocer ese 404 y cae al
 * camino secuencial de siempre, de modo que un servidor sin migrar duplica lento
 * en vez de romperse — pero el objetivo es que no haga falta.
 *
 * `maxRequests` a 1000 y no al defecto de 50: el lote se trocea en el cliente a
 * este mismo tamaño, y cuanto más grande sea el trozo menos viajes hacen falta.
 * 1000 altas de `program_exercises` son ~300 KB de cuerpo, muy por debajo del
 * `maxBodySize` (que se deja a 0 = el defecto de ~128 MB).
 *
 * `timeout` a 60 s porque el defecto de 3 s se queda corto para un lote de mil
 * inserciones sobre un servidor con la CPU ocupada; es un techo, no una espera.
 */
migrate((app) => {
  const settings = app.settings()

  settings.batch.enabled = true
  settings.batch.maxRequests = 1000
  settings.batch.timeout = 60

  return app.save(settings)
}, (app) => {
  const settings = app.settings()

  // El down deja `maxRequests`/`timeout` como estaban: los valores por defecto
  // de PocketBase para un batch DESACTIVADO son irrelevantes, y restaurarlos a
  // mano solo serviría para pisar una configuración que alguien haya tocado.
  settings.batch.enabled = false

  return app.save(settings)
})
