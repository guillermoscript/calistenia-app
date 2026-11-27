/// <reference path="../pb_data/types.d.ts" />
/**
 * #938 — `user_programs.extended_weeks`: semanas añadidas al final del programa.
 *
 * Un programa termina por calendario. Quien llega al final con menos del 70 %
 * de los entrenos hechos ve «finalizado» en vez de «completado» y puede
 * extenderlo UNA vez para ponerse al día (`packages/core/lib/programOutcome.ts`).
 * Las semanas extra se suman a `programs.duration_weeks` en
 * `computeProgramProgress` y repiten la última semana del programa (misma fase y
 * misma carga, sin descarga), así que no hace falta tocar el contenido.
 *
 * Va POR INSCRIPCIÓN y no en `programs` por la misma razón que `current_phase`
 * (#616): es de esta vuelta de este usuario, no del programa.
 *
 * 0 = sin extender, que es lo que significa un `number` ausente en PocketBase,
 * así que no hace falta backfill. `required: false` porque un `number`
 * requerido rechaza el 0 (#376). Id de campo FIJO (feedback_migration_safety).
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4176526388") // user_programs

  // Idempotente: la colección puede venir ya migrada de otra rama.
  if (collection.fields.getByName("extended_weeks")) return

  collection.fields.add(new Field({
    "hidden": false,
    "id": "number_up_extended_weeks",
    "max": 52,
    "min": 0,
    "name": "extended_weeks",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4176526388")

  if (!collection.fields.getByName("extended_weeks")) return

  collection.fields.removeById("number_up_extended_weeks")

  return app.save(collection)
})
