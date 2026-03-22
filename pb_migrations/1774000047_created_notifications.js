/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "notifications",
    type: "base",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "type", type: "text", required: true },
      { name: "actor", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "reference_id", type: "text", required: true },
      { name: "reference_type", type: "text", required: true },
      { name: "read", type: "bool", required: false },
      { name: "data", type: "json", required: false },
    ],
    indexes: [
      "CREATE INDEX idx_notif_user ON notifications (user)",
      "CREATE INDEX idx_notif_user_read ON notifications (user, read)"
    ],
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: '@request.auth.id != "" && @request.body.actor = @request.auth.id',
    updateRule: "user = @request.auth.id",
    deleteRule: "user = @request.auth.id",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("notifications")
  app.delete(collection)
})
