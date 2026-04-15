/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    app.findCollectionByNameOrId("races")
    return // already exists
  } catch {}

  const collection = new Collection({
    name: "races",
    type: "base",
    fields: [
      { name: "creator", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1 },
      { name: "name", type: "text", required: true },
      { name: "status", type: "text", required: true },
      { name: "target_distance_km", type: "number" },
      { name: "started_at", type: "text" },
      { name: "finished_at", type: "text" },
    ],
    indexes: [
      "CREATE INDEX idx_races_creator ON races (creator, status)"
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: "@request.auth.id = creator",
    updateRule: "@request.auth.id = creator",
    deleteRule: "@request.auth.id = creator",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("races")
  app.delete(collection)
})
