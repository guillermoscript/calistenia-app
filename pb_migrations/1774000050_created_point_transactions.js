/// <reference path="../pb_data/types.d.ts" />

/**
 * Create point_transactions collection for referral points ledger.
 * Balance is computed on-read by summing amount (no separate balance table).
 */
migrate((app) => {
  const collection = new Collection({
    name: "point_transactions",
    type: "base",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "amount", type: "number", required: true, min: null, max: null },
      { name: "type", type: "select", required: true, values: ["referral_signup", "referral_bonus", "challenge_complete", "ai_usage"] },
      { name: "reference_id", type: "text", required: false },
      { name: "description", type: "text", required: false },
    ],
    indexes: [
      "CREATE INDEX idx_point_transactions_user ON point_transactions (user)",
      "CREATE INDEX idx_point_transactions_type ON point_transactions (type)"
    ],
    listRule: 'user = @request.auth.id',
    viewRule: 'user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: null,
    deleteRule: null,
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("point_transactions")
  app.delete(collection)
})
