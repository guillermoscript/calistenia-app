/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Skip if already exists
  try {
    app.findCollectionByNameOrId("exercise_favorites")
    return
  } catch (_) {}

  const collection = new Collection({
    name: "exercise_favorites",
    type: "base",
    system: false,
  })

  // Add fields
  collection.fields.add(new Field({
    name: "user",
    type: "relation",
    required: true,
    collectionId: "_pb_users_auth_",
    cascadeDelete: true,
    maxSelect: 1,
  }))
  collection.fields.add(new Field({
    name: "exercise_id",
    type: "text",
    required: true,
  }))

  // Set rules after fields are defined
  collection.listRule = '@request.auth.id != "" && user = @request.auth.id'
  collection.viewRule = '@request.auth.id != "" && user = @request.auth.id'
  collection.createRule = '@request.auth.id != "" && user = @request.auth.id'
  collection.deleteRule = '@request.auth.id != "" && user = @request.auth.id'

  collection.indexes = [
    "CREATE UNIQUE INDEX idx_fav_user_exercise ON exercise_favorites (user, exercise_id)",
    "CREATE INDEX idx_fav_user ON exercise_favorites (user)",
  ]

  app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("exercise_favorites")
    app.delete(collection)
  } catch (_) {}
})
