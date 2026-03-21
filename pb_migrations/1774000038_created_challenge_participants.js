/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const challengesCollection = app.findCollectionByNameOrId("challenges")

  const collection = new Collection({
    name: "challenge_participants",
    type: "base",
    fields: [
      { name: "challenge", type: "relation", required: true, collectionId: challengesCollection.id, maxSelect: 1, cascadeDelete: true },
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_cp_pair ON challenge_participants (challenge, "user")',
      "CREATE INDEX idx_cp_challenge ON challenge_participants (challenge)",
      'CREATE INDEX idx_cp_user ON challenge_participants ("user")'
    ],
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != "" && (@request.body.user = @request.auth.id || challenge.creator = @request.auth.id)',
    updateRule: null,
    deleteRule: "user = @request.auth.id",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("challenge_participants")
  app.delete(collection)
})
