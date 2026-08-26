/// <reference path="../pb_data/types.d.ts" />
/**
 * #617 — `user_program_overrides`: la progresión aceptada sobre un programa
 * QUE NO ES TUYO.
 *
 * Cuando el programa es del usuario, aceptar una sugerencia escribe en
 * `program_exercises` y se acabó. Cuando es ajeno —los 15 oficiales, o el de
 * otra persona— eso no puede pasar: sería una persona cambiándole el programa a
 * todas las demás. Pero la progresión tiene que funcionar igual, porque los
 * programas ajenos son justo los que más gente sigue.
 *
 * Esta colección es esa capa: una fila por (usuario, programa, ejercicio) con
 * lo que ESE usuario ha aceptado. El cliente la superpone sobre lo prescrito al
 * montar el día.
 *
 * DECISIONES
 * ----------
 * - **`exercise_id` es texto, no relación.** Es la clave de slot con la que el
 *   programa identifica al ejercicio dentro del día, la misma que ya usan
 *   `sets_log` y `exercise-resolver.ts`. No siempre existe como fila del
 *   catálogo, así que una relación dejaría fuera justo los ejercicios de los
 *   programas propios.
 * - **`user` y `program` sí van con `cascadeDelete: true`.** Un override no
 *   significa nada sin su programa ni sin su usuario: al contrario que una
 *   inscripción, no es historial que valga la pena conservar. Al borrarse el
 *   programa se van solos, sin necesidad de hook (compárese con #605, donde la
 *   inscripción sí debía sobrevivir).
 * - **Las reglas de API son la defensa de verdad.** El hook comprueba la
 *   propiedad antes de escribir, pero es el `createRule` con
 *   `@request.body.user = @request.auth.id` el que impide de verdad escribir
 *   overrides a nombre de otro. Y `listRule` filtra por `user`, así que nadie
 *   ve los ajustes de nadie.
 * - **Los dos campos de override son opcionales por separado.** Una aceptación
 *   de dosis rellena `reps_override` y deja el ejercicio como está; una de
 *   variante rellena los dos. Que `reps_override` sea texto y no número es
 *   deliberado: es lo mismo que guarda `program_exercises.reps` (admite rangos)
 *   y en un ejercicio de temporizador son SEGUNDOS, como en toda la app.
 */
migrate((app) => {
  // Idempotente: si ya existe (otra rama, reaplicación al arrancar), no se toca.
  try {
    app.findCollectionByNameOrId("user_program_overrides")
    return
  } catch (e) {
    // No existe: se crea abajo.
  }

  const collection = new Collection({
    "createRule": "@request.auth.id != \"\" && @request.body.user = @request.auth.id",
    "deleteRule": "user = @request.auth.id",
    "listRule": "user = @request.auth.id",
    "updateRule": "user = @request.auth.id",
    "viewRule": "user = @request.auth.id",
    "name": "user_program_overrides",
    "type": "base",
    "system": false,
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "cascadeDelete": true,
        "collectionId": "_pb_users_auth_",
        "hidden": false,
        "id": "relation_upo_user",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "user",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "cascadeDelete": true,
        "collectionId": "pbc_2970041692", // programs
        "hidden": false,
        "id": "relation_upo_program",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "program",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_upo_exercise_id",
        "max": 0,
        "min": 0,
        "name": "exercise_id",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_upo_exercise_override",
        "max": 0,
        "min": 0,
        "name": "exercise_id_override",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_upo_reps_override",
        "max": 0,
        "min": 0,
        "name": "reps_override",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "autodate_upo_created",
        "name": "created",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      },
      {
        "hidden": false,
        "id": "autodate_upo_updated",
        "name": "updated",
        "onCreate": true,
        "onUpdate": true,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    // Un solo override por usuario+programa+ejercicio: la aceptación se
    // sobrescribe, no se acumula. Sin este índice, aceptar dos veces dejaría dos
    // filas y ganaría la que el orden de lectura quisiera.
    "indexes": [
      "CREATE UNIQUE INDEX `idx_upo_user_program_exercise` ON `user_program_overrides` (`user`, `program`, `exercise_id`)"
    ]
  })

  return app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("user_program_overrides")
    return app.delete(collection)
  } catch (e) {
    // Ya no está: nada que deshacer.
  }
})
