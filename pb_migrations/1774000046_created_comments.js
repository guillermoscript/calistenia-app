/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    app.findCollectionByNameOrId("comments");
    return; // already exists
  } catch {}

  // Step 1: Create collection without self-referencing field
  const collection = new Collection({
    name: "comments",
    type: "base",
    fields: [
      { name: "session_id", type: "text", required: true },
      { name: "author", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "text", type: "text", required: true, max: 500 },
    ],
    indexes: [
      "CREATE INDEX idx_comments_session ON comments (session_id)",
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && @request.body.author = @request.auth.id',
    updateRule: null,
    deleteRule: "author = @request.auth.id",
  })
  app.save(collection)

  // Step 2: Add self-referencing parent_id field
  const saved = app.findCollectionByNameOrId("comments")
  saved.fields.add(new Field({
    name: "parent_id",
    type: "relation",
    required: false,
    collectionId: saved.id,
    maxSelect: 1,
    cascadeDelete: true,
  }))
  saved.indexes = [
    "CREATE INDEX idx_comments_session ON comments (session_id)",
    "CREATE INDEX idx_comments_parent ON comments (parent_id)",
  ]
  app.save(saved)
}, (app) => {
  const collection = app.findCollectionByNameOrId("comments")
  app.delete(collection)
})
