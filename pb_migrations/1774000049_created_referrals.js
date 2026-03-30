/// <reference path="../pb_data/types.d.ts" />

/**
 * Create referrals collection to track user invitations.
 *
 * API rules:
 * - list/view: only the referrer can see their own referrals
 * - create: authenticated users, must set themselves as referrer
 * - update/delete: locked (immutable ledger)
 */
migrate((app) => {
  try {
    app.findCollectionByNameOrId("referrals");
    return; // already exists
  } catch {}

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
    createRule: '@request.auth.id != "" && @request.body.referrer = @request.auth.id',
    updateRule: null,
    deleteRule: null,
  })
  app.save(collection)

  // Add autodate fields (must be done after initial save)
  const saved = app.findCollectionByNameOrId("referrals")
  saved.fields.add(new Field({
    "hidden": false,
    "id": "autodate_referrals_created",
    "name": "created",
    "onCreate": true,
    "onUpdate": false,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))
  saved.fields.add(new Field({
    "hidden": false,
    "id": "autodate_referrals_updated",
    "name": "updated",
    "onCreate": true,
    "onUpdate": true,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))
  app.save(saved)
}, (app) => {
  const collection = app.findCollectionByNameOrId("referrals")
  app.delete(collection)
})
