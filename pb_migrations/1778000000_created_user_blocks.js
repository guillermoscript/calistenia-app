/// <reference path="../pb_data/types.d.ts" />

/**
 * Bloqueo de usuarios (spec 2026-07-14-block-users-design.md).
 * Fuente de verdad de bloqueos. El bloqueado NO puede consultar quién lo
 * bloqueó (list/view solo para el blocker). Los efectos (unfollow mutuo,
 * campo espejo, borrado de notifs) viven en pb_hooks/user_blocks.pb.js.
 */
migrate((app) => {
  try { app.findCollectionByNameOrId("user_blocks"); return } catch {}

  const collection = new Collection({
    name: "user_blocks",
    type: "base",
    fields: [
      { name: "blocker", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "blocked", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_user_blocks_pair ON user_blocks (blocker, blocked)",
      "CREATE INDEX idx_user_blocks_blocker ON user_blocks (blocker)",
      "CREATE INDEX idx_user_blocks_blocked ON user_blocks (blocked)"
    ],
    listRule: "blocker = @request.auth.id",
    viewRule: "blocker = @request.auth.id",
    createRule: '@request.auth.id != "" && @request.body.blocker = @request.auth.id && @request.body.blocked != @request.auth.id',
    updateRule: null,
    deleteRule: "blocker = @request.auth.id",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("user_blocks")
  app.delete(collection)
})
