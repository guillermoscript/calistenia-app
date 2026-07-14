/// <reference path="../pb_data/types.d.ts" />

/**
 * Campo espejo OCULTO para las reglas de bloqueo. hidden:true → no aparece en
 * respuestas API ni puede escribirse por usuarios; solo los hooks del server
 * lo sincronizan (pb_hooks/user_blocks.pb.js). Las reglas API sí pueden leerlo.
 * Semántica clave: `blocked_users.id != X` = "X no está en la lista"
 * (all-match sobre multi-relación; lista vacía pasa).
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users")
  if (collection.fields.find(f => f.name === "blocked_users")) return

  collection.fields.add(new Field({
    "hidden": true,
    "id": "relation_users_blocked_users",
    "name": "blocked_users",
    "type": "relation",
    "collectionId": "_pb_users_auth_",
    "cascadeDelete": false,
    "minSelect": 0,
    "maxSelect": 9999,
    "presentable": false,
    "required": false,
    "system": false
  }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("users")
  collection.fields = collection.fields.filter(f => f.id !== "relation_users_blocked_users")
  app.save(collection)
})
