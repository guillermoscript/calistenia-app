/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    id: "pbc_4000000010",
    name: "exercise_favorites",
    type: "base",
    system: false,
    fields: [
      { name: "user", type: "relation", required: true, options: { collectionId: "_pb_users_auth_", cascadeDelete: true, maxSelect: 1 } },
      { name: "exercise_id", type: "text", required: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_fav_user_exercise ON exercise_favorites (user, exercise_id)",
      "CREATE INDEX idx_fav_user ON exercise_favorites (user)",
    ],
    listRule: '@request.auth.id != "" && user = @request.auth.id',
    viewRule: '@request.auth.id != "" && user = @request.auth.id',
    createRule: '@request.auth.id != "" && user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && user = @request.auth.id',
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("exercise_favorites")
  app.delete(collection)
})
