/// <reference path="../pb_data/types.d.ts" />

/**
 * Add referral_code field to users collection.
 * Unique text field for referral link generation.
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  users.fields.push(new Field({
    "hidden": false,
    "id": "text_user_referral_code",
    "autogeneratePattern": "",
    "max": 20,
    "min": 0,
    "name": "referral_code",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  users.indexes = users.indexes || []
  users.indexes.push("CREATE UNIQUE INDEX idx_users_referral_code ON users (referral_code) WHERE referral_code != ''")

  app.save(users)
}, (app) => {
  try {
    const users = app.findCollectionByNameOrId("_pb_users_auth_")
    users.fields = users.fields.filter(f => f.id !== "text_user_referral_code")
    users.indexes = users.indexes.filter(i => !i.includes("idx_users_referral_code"))
    app.save(users)
  } catch (e) {}
})
