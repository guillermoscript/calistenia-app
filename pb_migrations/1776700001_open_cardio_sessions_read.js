/// <reference path="../pb_data/types.d.ts" />
/**
 * Open cardio_sessions read rules so any authenticated user can list/view
 * cardio sessions — required for the activity feed to show cardio items
 * from followed users.
 * Write rules remain owner-only (unchanged).
 *
 * CORRECCIÓN (#299): este comentario afirmaba que la ruta GPS «nunca se expone
 * porque las consultas excluyen gps_points». Era falso — eso es convención del
 * cliente, no regla de servidor, y una regla de PocketBase filtra registros, no
 * campos. La ruta se sacó a la colección owner-only `cardio_routes` en
 * 1782500000; a partir de ahí, abrir esta lectura ya no la arrastra.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("cardio_sessions")
  collection.listRule = '@request.auth.id != ""'
  collection.viewRule = '@request.auth.id != ""'
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("cardio_sessions")
  collection.listRule = '@request.auth.id = user'
  collection.viewRule = '@request.auth.id = user'
  app.save(collection)
})
