/// <reference path="../pb_data/types.d.ts" />

/**
 * Clave de deduplicación para la cola offline (#301).
 *
 * Las series y las sesiones pasan a escribirse a través de `persistOrQueue`, que
 * reintenta al reconectar. El problema de reintentar un `create` es que un error
 * de red (`status: 0`) significa «no hubo respuesta», no «no llegó»: la petición
 * pudo procesarse entera en el servidor y perderse solo la respuesta. Sin una
 * clave estable, cada reintento de ese caso crearía una fila duplicada.
 *
 * El cliente genera un `client_id` una sola vez, en el momento de la acción, y
 * lo conserva dentro del payload encolado. El índice único rechaza entonces el
 * segundo intento con `validation_not_unique`, que la cola lee como «ya está»
 * en vez de como fallo (`isAlreadyPersistedError`).
 *
 * El índice es PARCIAL (`WHERE client_id != ''`) y va scopeado por `user`:
 *
 *  - Parcial porque todas las filas existentes quedan con `''`, y sin el WHERE
 *    la segunda de ellas rompería la creación del índice. Así la migración es
 *    puramente aditiva y no toca un solo dato ya escrito.
 *  - Por `user` para que el id generado en un dispositivo no pueda bloquear
 *    la escritura de otra cuenta ante una colisión del generador.
 *
 * Las `createRule` de ambas colecciones son de la forma
 * `@request.auth.id != "" && @request.body.user = @request.auth.id`, sin
 * restricción por campo, así que el cliente puede escribir `client_id` sin
 * cambiar reglas.
 */

const TARGETS = [
  { collection: 'sets_log', index: "CREATE UNIQUE INDEX idx_sets_log_client_id ON sets_log (user, client_id) WHERE client_id != ''" },
  { collection: 'sessions', index: "CREATE UNIQUE INDEX idx_sessions_client_id ON sessions (user, client_id) WHERE client_id != ''" },
]

migrate((app) => {
  for (const target of TARGETS) {
    const collection = app.findCollectionByNameOrId(target.collection)

    collection.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_client_id",
      "max": 64,
      "min": 0,
      "name": "client_id",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))

    collection.indexes = (collection.indexes || []).filter(i => !i.includes(`idx_${target.collection}_client_id`))
    collection.indexes.push(target.index)

    app.save(collection)
  }
}, (app) => {
  for (const target of TARGETS) {
    try {
      const collection = app.findCollectionByNameOrId(target.collection)
      collection.indexes = (collection.indexes || []).filter(i => !i.includes(`idx_${target.collection}_client_id`))
      collection.fields.removeByName("client_id")
      app.save(collection)
    } catch (e) {}
  }
})
