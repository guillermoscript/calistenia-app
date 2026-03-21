/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "feed_reactions",
    type: "base",
    fields: [
      { name: "session_id", type: "text", required: true },
      { name: "reactor", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "emoji", type: "text", required: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_reaction_unique ON feed_reactions (session_id, reactor)",
      "CREATE INDEX idx_reaction_session ON feed_reactions (session_id)"
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && @request.body.reactor = @request.auth.id',
    updateRule: "reactor = @request.auth.id",
    deleteRule: "reactor = @request.auth.id",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("feed_reactions")
  app.delete(collection)
})
