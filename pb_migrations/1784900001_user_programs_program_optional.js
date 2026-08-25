/// <reference path="../pb_data/types.d.ts" />

/**
 * `user_programs.program` deja de ser `required` (#605).
 *
 * La relación se creó con `required: true` y `cascadeDelete: false`
 * (`1773251039_created_user_programs.js`), y esa combinación hace que
 * PocketBase RECHACE el borrado del programa mientras exista una sola
 * inscripción: «Failed to delete record. Make sure that the record is not part
 * of a required relation reference» (400).
 *
 * El autor solo puede borrar sus PROPIAS inscripciones (`deleteRule` =
 * `user = @request.auth.id`), así que en cuanto otra persona se apuntaba a su
 * programa el borrado era imposible — y como el cliente ya había borrado
 * ejercicios, fases y day configs antes de llegar ahí, el programa se quedaba
 * vacío y vivo: los inscritos seguían con `is_current = true` sobre un programa
 * sin un solo día. Ese es el «programa fantasma» que se ve en la app.
 *
 * Con `required: false` PocketBase hace lo mismo que ya hacía con `sessions`,
 * `cardio_sessions` y `circuit_sessions` (todas `required: false`,
 * `cascadeDelete: false`): borra el programa y deja la fila con la relación
 * vacía. `pb_hooks/programs_delete_cleanup.pb.js` la marca además como
 * `abandoned` para que el usuario no se quede con un activo que no existe.
 *
 * No se usa `cascadeDelete: true` a propósito: la inscripción es historial del
 * usuario (cuándo empezó, cuándo acabó), no un detalle del programa del autor.
 *
 * Se conserva el `field.id` (`relation2465036164`): recrear el campo perdería
 * los datos de la columna.
 *
 * CONTRACT-OK: esta migración RELAJA el contrato, no lo endurece — un cliente
 * viejo que siga mandando `program` en cada escritura sigue funcionando igual.
 * `scripts/check-schema-contract.mjs` la marca porque su patrón es una regex
 * literal (`required:\s*true`) y ese texto aparece aquí arriba, en la
 * explicación de cómo se creó el campo, no en el código de la migración.
 */
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('pbc_4176526388')
    const field = collection.fields.getByName('program')
    if (!field) return
    field.required = false
    app.save(collection)
  },
  (app) => {
    // Down: volver a `required: true` reventaría con las filas cuya relación ya
    // quedó vacía al borrarse su programa, que es justo lo que esta migración
    // permite que existan.
  },
)
