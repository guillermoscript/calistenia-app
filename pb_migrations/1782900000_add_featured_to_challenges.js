/// <reference path="../pb_data/types.d.ts" />

/**
 * #351 — Reto destacado en Home.
 *
 * Añade `is_featured` (bool) a `challenges`, siguiendo el precedente de
 * `programs.is_featured` (1774000013). La curación es remota: se marca el flag
 * desde el panel de PB (o vía API con rol admin/editor) y las apps lo leen sin
 * necesidad de release.
 *
 * La updateRule pasa a bloquear que un creador sin rol se auto-destaque:
 * el creador puede seguir editando su reto mientras el body no toque
 * `is_featured`; admin/editor pueden todo.
 */
migrate((app) => {
  const challenges = app.findCollectionByNameOrId("challenges")

  challenges.fields.push(new Field({
    "hidden": false,
    "id": "bool_chal_featured",
    "name": "is_featured",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  challenges.updateRule = '(creator = @request.auth.id && @request.body.is_featured:isset = false) || @request.auth.role = "admin" || @request.auth.role = "editor"'

  app.save(challenges)
}, (app) => {
  try {
    const challenges = app.findCollectionByNameOrId("challenges")
    challenges.fields = challenges.fields.filter(f => f.id !== "bool_chal_featured")
    challenges.updateRule = 'creator = @request.auth.id'
    app.save(challenges)
  } catch (e) {}
})
