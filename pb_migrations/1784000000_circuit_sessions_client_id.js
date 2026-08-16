/// <reference path="../pb_data/types.d.ts" />

/**
 * Clave de deduplicación de la cola offline para los circuitos (#464).
 *
 * Extiende a `circuit_sessions` lo que 1783900000 hizo con `sets_log` y
 * `sessions` (#301). Hasta ahora los circuitos llevaban su propia cola casera
 * que reintentaba el `create` ante CUALQUIER error, y ahí está el fallo: un
 * `status: 0` significa «no hubo respuesta», no «no llegó». La petición pudo
 * procesarse entera en el servidor y perderse solo la respuesta, así que el
 * reintento creaba una sesión duplicada.
 *
 * El cliente genera el `client_id` una sola vez, al completar el circuito, y lo
 * conserva dentro del payload encolado. El índice único rechaza entonces el
 * segundo intento con `validation_not_unique`, que la cola lee como «ya está»
 * en vez de como fallo (`isAlreadyPersistedError`).
 *
 * El índice es PARCIAL (`WHERE client_id != ''`) y va scopeado por `user`, por
 * los mismos motivos que en 1783900000: las filas ya escritas quedan con `''` y
 * sin el WHERE la segunda de ellas rompería la creación del índice (así la
 * migración es puramente aditiva), y el scope por `user` evita que una colisión
 * del generador en un dispositivo bloquee la escritura de otra cuenta.
 *
 * La `createRule` de `circuit_sessions` es `@request.auth.id = user`, sin
 * restricción por campo, así que el cliente puede escribir `client_id` sin
 * cambiar reglas.
 */

const INDEX = "CREATE UNIQUE INDEX idx_circuit_sessions_client_id ON circuit_sessions (user, client_id) WHERE client_id != ''"

migrate((app) => {
  const collection = app.findCollectionByNameOrId('circuit_sessions')

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

  collection.indexes = (collection.indexes || []).filter(i => !i.includes('idx_circuit_sessions_client_id'))
  collection.indexes.push(INDEX)

  app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId('circuit_sessions')
    collection.indexes = (collection.indexes || []).filter(i => !i.includes('idx_circuit_sessions_client_id'))
    collection.fields.removeByName("client_id")
    app.save(collection)
  } catch (e) {}
})
