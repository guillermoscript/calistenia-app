/// <reference path="../pb_data/types.d.ts" />
/**
 * Endurece las reglas de `nutrition_goals` (#243).
 *
 * A raíz del fix GHSA-wwj3-9h95-wcpf, edad/sexo (PII) dejaron de vivir en
 * `users` (legible por cualquier usuario autenticado + campos ocultos que no se
 * pueden escribir con token de usuario) y pasaron a `nutrition_goals`, que ya
 * snapshotea el cuerpo y es la fuente del cálculo de calorías. Al alojar PII
 * aquí, las reglas deben garantizar que un usuario SOLO pueda crear/escribir su
 * propia fila:
 *
 *  - createRule antes era `@request.auth.id != ""`: cualquier usuario
 *    autenticado podía crear una fila con `user` apuntando a OTRA persona
 *    (sembrar/pisar su cuerpo, edad y sexo). Ahora exige que el `user` del
 *    body sea el propio (`@request.body.user = @request.auth.id`).
 *  - updateRule ya era `user = @request.auth.id` (solo el dueño), pero no
 *    impedía reasignar la fila a otro usuario. Se añade guardia para que el
 *    campo `user` no se pueda cambiar a un tercero.
 *
 * list/view/delete ya estaban correctamente acotados a `user = @request.auth.id`.
 * No se tocan campos (se preservan sus ids); solo reglas.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000005")

  collection.createRule = '@request.auth.id != "" && @request.body.user = @request.auth.id'
  collection.updateRule = 'user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)'

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000005")

  // Restaura las reglas previas (más débiles) solo por simetría de rollback.
  collection.createRule = '@request.auth.id != ""'
  collection.updateRule = 'user = @request.auth.id'

  return app.save(collection)
})
