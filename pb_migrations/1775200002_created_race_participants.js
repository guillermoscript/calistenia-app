/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    app.findCollectionByNameOrId("race_participants")
    return // already exists
  } catch {}

  const racesCollection = app.findCollectionByNameOrId("races")

  const collection = new Collection({
    name: "race_participants",
    type: "base",
    fields: [
      { name: "race", type: "relation", required: true, collectionId: racesCollection.id, maxSelect: 1, cascadeDelete: true },
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1 },
      { name: "display_name", type: "text", required: true },
      { name: "distance_km", type: "number" },
      { name: "duration_seconds", type: "number" },
      { name: "avg_pace", type: "number" },
      { name: "status", type: "text", required: true },
      { name: "last_update", type: "text" },
      { name: "finished_at", type: "text" },
    ],
    indexes: [
      'CREATE INDEX idx_rp_race ON race_participants (race, "user")'
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: "@request.auth.id = user",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("race_participants")
  app.delete(collection)
})
