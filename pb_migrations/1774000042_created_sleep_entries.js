/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    app.findCollectionByNameOrId("sleep_entries");
    return; // already exists
  } catch {}

  const collection = new Collection({
    name: "sleep_entries",
    type: "base",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "date", type: "date", required: true },
      { name: "bedtime", type: "text", required: true },
      { name: "wake_time", type: "text", required: true },
      { name: "awakenings", type: "number", required: true, min: 0, onlyInt: true },
      { name: "quality", type: "number", required: true, min: 1, max: 5, onlyInt: true },
      { name: "duration_minutes", type: "number", required: true, min: 0 },
      { name: "caffeine", type: "bool" },
      { name: "screen_before_bed", type: "bool" },
      { name: "stress_level", type: "number", min: 1, max: 5, onlyInt: true },
      { name: "note", type: "text" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_sleep_user_date ON sleep_entries (user, date)",
      "CREATE INDEX idx_sleep_user ON sleep_entries (user)"
    ],
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: "@request.auth.id != \"\" && @request.body.user = @request.auth.id",
    updateRule: "user = @request.auth.id",
    deleteRule: "user = @request.auth.id",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("sleep_entries")
  app.delete(collection)
})
