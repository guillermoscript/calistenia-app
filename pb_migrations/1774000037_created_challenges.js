/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "challenges",
    type: "base",
    fields: [
      { name: "creator", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "title", type: "text", required: true },
      { name: "metric", type: "text", required: true },
      { name: "starts_at", type: "text", required: true },
      { name: "ends_at", type: "text", required: true },
      { name: "status", type: "text", required: true },
    ],
    indexes: [
      "CREATE INDEX idx_challenges_creator ON challenges (creator)",
      "CREATE INDEX idx_challenges_status ON challenges (status)"
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && @request.body.creator = @request.auth.id',
    updateRule: "creator = @request.auth.id",
    deleteRule: "creator = @request.auth.id",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("challenges")
  app.delete(collection)
})
