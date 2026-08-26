/// <reference path="../pb_data/types.d.ts" />
/**
 * #617 — `user_programs.auto_progress`: opt-in de la progresión automática.
 *
 * La sugerencia («hiciste 3×10 dos veces, hoy 3×11») no puede aparecer sola:
 * cambiarle a alguien la prescripción de su programa sin avisar es exactamente
 * la clase de sorpresa que hace desconfiar de la app. El interruptor vive por
 * INSCRIPCIÓN y no en `settings` por la misma razón que `current_phase` (#616):
 * apuntarse a otro programa tiene que empezar de cero, y un flag global se
 * arrastraría de uno a otro.
 *
 * Apagado por defecto — que es lo que significa un `bool` ausente en
 * PocketBase, así que no hace falta backfill.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4176526388") // user_programs

  // Idempotente: la colección puede venir ya migrada de otra rama.
  if (collection.fields.getByName("auto_progress")) return

  collection.fields.add(new Field({
    "hidden": false,
    "id": "bool_up_auto_progress",
    "name": "auto_progress",
    "presentable": false,
    // Un `bool` requerido en PocketBase rechaza el `false`, que es justo el
    // valor por defecto de este campo (mismo motivo que el `number` del #376).
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4176526388")

  if (!collection.fields.getByName("auto_progress")) return

  collection.fields.removeById("bool_up_auto_progress")

  return app.save(collection)
})
