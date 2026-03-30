/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    app.findCollectionByNameOrId("follows");
    return; // already exists
  } catch {}

  const collection = new Collection({
    name: "follows",
    type: "base",
    fields: [
      { name: "follower", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "following", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_follows_pair ON follows (follower, following)",
      "CREATE INDEX idx_follows_follower ON follows (follower)",
      "CREATE INDEX idx_follows_following ON follows (following)"
    ],
    listRule: "follower = @request.auth.id || following = @request.auth.id",
    viewRule: "follower = @request.auth.id || following = @request.auth.id",
    createRule: '@request.auth.id != "" && @request.body.follower = @request.auth.id',
    updateRule: null,
    deleteRule: "follower = @request.auth.id",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("follows")
  app.delete(collection)
})
