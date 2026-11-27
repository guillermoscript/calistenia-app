/// <reference path="../pb_data/types.d.ts" />
/**
 * #939 — `user_programs.cycle`: en qué vuelta del programa va el usuario.
 *
 * «Repetir con más carga» reabre la MISMA inscripción (una por usuario y
 * programa: `selectProgram` la busca por esa pareja y una segunda fila la
 * confundiría) con `started_at` de hoy y `cycle + 1`. El motor
 * (`useWeekAwareGetWorkout` → `lib/programCycle.ts`) arranca entonces cada
 * ejercicio desde más arriba: la rampa semanal de #755 sigue por donde acabó, y
 * lo que no tiene rampa sube un escalón fijo.
 *
 * 0 = primera vuelta, que es lo que significa un `number` ausente en PocketBase,
 * así que no hace falta backfill. `required: false` porque un `number`
 * requerido rechaza el 0 (#376). Id de campo FIJO (feedback_migration_safety).
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4176526388") // user_programs

  // Idempotente: la colección puede venir ya migrada de otra rama.
  if (collection.fields.getByName("cycle")) return

  collection.fields.add(new Field({
    "hidden": false,
    "id": "number_up_cycle",
    "max": 99,
    "min": 0,
    "name": "cycle",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4176526388")

  if (!collection.fields.getByName("cycle")) return

  collection.fields.removeById("number_up_cycle")

  return app.save(collection)
})
