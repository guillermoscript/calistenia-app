/// <reference path="../pb_data/types.d.ts" />

/** Private fasting history shared by web and native clients. */
migrate((app) => {
  const ownerRule = '@request.auth.id != "" && user = @request.auth.id'
  const rules = {
    listRule: ownerRule,
    viewRule: ownerRule,
    createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
    updateRule: ownerRule + ' && (@request.body.user:isset = false || @request.body.user = @request.auth.id)',
    deleteRule: ownerRule,
  }
  const userField = {
    id: "relation_fasting_user", name: "user", type: "relation", required: true,
    collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true,
  }

  function createIfMissing(schema) {
    try {
      app.findCollectionByNameOrId(schema.name)
      return
    } catch (_) { /* Missing collection: create the versioned schema below. */ }
    app.save(new Collection(schema))
  }

  createIfMissing({
    ...rules,
    id: "pbc_fastsess001", name: "fasting_sessions", type: "base",
    fields: [
      userField,
      { id: "date_fasting_started", name: "started_at", type: "date", required: true },
      { id: "date_fasting_ended", name: "ended_at", type: "date" },
      { id: "number_fasting_goal", name: "goal_hours", type: "number", required: true, min: 1, max: 48 },
      { id: "text_fasting_notes", name: "notes", type: "text", max: 2000 },
      { id: "text_fasting_client", name: "client_id", type: "text", max: 100 },
      { id: "autodate_fasting_created", name: "created", type: "autodate", onCreate: true },
      { id: "autodate_fasting_updated", name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_fasting_active_user ON fasting_sessions (user) WHERE ended_at = ''",
      "CREATE INDEX idx_fasting_user_started ON fasting_sessions (user, started_at)",
      "CREATE UNIQUE INDEX idx_fasting_client_id ON fasting_sessions (user, client_id) WHERE client_id != ''",
    ],
  })

  createIfMissing({
    ...rules,
    id: "pbc_fastsett001", name: "fasting_settings", type: "base",
    fields: [
      { ...userField, id: "relation_fastsettings_user" },
      { id: "number_fastsettings_goal", name: "goal_hours", type: "number", required: true, min: 1, max: 48 },
      { id: "number_fastsettings_weekly", name: "weekly_goal", type: "number", required: true, min: 1, max: 7, onlyInt: true },
      { id: "autodate_fastsettings_created", name: "created", type: "autodate", onCreate: true },
      { id: "autodate_fastsettings_updated", name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_fasting_settings_user ON fasting_settings (user)"],
  })
}, (app) => {
  app.delete(app.findCollectionByNameOrId("fasting_settings"))
  app.delete(app.findCollectionByNameOrId("fasting_sessions"))
})
