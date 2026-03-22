/// <reference path="../pb_data/types.d.ts" />

/**
 * Create referrals collection to track user invitations.
 */
migrate((app) => {
  const challengesCollection = app.findCollectionByNameOrId("challenges")

  const collection = new Collection({
    name: "referrals",
    type: "base",
    fields: [
      { name: "referrer", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: false },
      { name: "referred", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: false },
      { name: "source", type: "select", required: true, values: ["quick_invite", "challenge"] },
      { name: "challenge_id", type: "relation", required: false, collectionId: challengesCollection.id, maxSelect: 1, cascadeDelete: false },
    ],
    indexes: [
      "CREATE INDEX idx_referrals_referrer ON referrals (referrer)",
      "CREATE INDEX idx_referrals_referred ON referrals (referred)",
      "CREATE UNIQUE INDEX idx_referrals_unique_pair ON referrals (referrer, referred)"
    ],
    listRule: 'referrer = @request.auth.id',
    viewRule: 'referrer = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: null,
    deleteRule: null,
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("referrals")
  app.delete(collection)
})
