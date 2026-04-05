/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    app.findCollectionByNameOrId("circuit_sessions");
    return; // already exists
  } catch {}

  const collection = new Collection({
    name: "circuit_sessions",
    type: "base",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1 },
      { name: "circuit_name", type: "json" },
      { name: "mode", type: "text", required: true },
      { name: "exercises", type: "json" },
      { name: "rounds_completed", type: "number" },
      { name: "rounds_target", type: "number" },
      { name: "duration_seconds", type: "number" },
      { name: "started_at", type: "text" },
      { name: "finished_at", type: "text" },
      { name: "note", type: "text" },
      { name: "program", type: "relation", required: false, collectionId: "pbc_2970041692", maxSelect: 1 },
      { name: "program_day_key", type: "text" },
      { name: "config", type: "json" },
    ],
    indexes: [
      "CREATE INDEX idx_circuit_user_started ON circuit_sessions (user, started_at)"
    ],
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id = user",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("circuit_sessions")
  app.delete(collection)
})
