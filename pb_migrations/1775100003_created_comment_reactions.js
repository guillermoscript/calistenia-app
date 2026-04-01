/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    app.findCollectionByNameOrId("comment_reactions");
    return; // already exists
  } catch {}

  const collection = new Collection({
    name: "comment_reactions",
    type: "base",
    fields: [
      { name: "comment_id", type: "text", required: true },
      { name: "reactor", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "emoji", type: "text", required: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_comment_reaction_unique ON comment_reactions (comment_id, reactor, emoji)",
      "CREATE INDEX idx_comment_reaction_comment ON comment_reactions (comment_id)"
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && @request.body.reactor = @request.auth.id',
    updateRule: "reactor = @request.auth.id",
    deleteRule: "reactor = @request.auth.id",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("comment_reactions")
  app.delete(collection)
})
