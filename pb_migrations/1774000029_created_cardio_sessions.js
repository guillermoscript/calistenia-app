/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "cardio_sessions",
    type: "base",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1 },
      { name: "activity_type", type: "text", required: true },
      { name: "gps_points", type: "json" },
      { name: "distance_km", type: "number" },
      { name: "duration_seconds", type: "number" },
      { name: "avg_pace", type: "number" },
      { name: "elevation_gain", type: "number" },
      { name: "started_at", type: "text" },
      { name: "finished_at", type: "text" },
      { name: "note", type: "text" },
    ],
    indexes: [
      "CREATE INDEX idx_cardio_user_started ON cardio_sessions (user, started_at)"
    ],
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id = user",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("cardio_sessions")
  app.delete(collection)
})
