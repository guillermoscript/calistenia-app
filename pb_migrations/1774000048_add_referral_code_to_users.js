/// <reference path="../pb_data/types.d.ts" />

/**
 * Add referral_code field to users collection.
 * Unique text field for referral link generation.
 * Also opens list/view rules to allow public lookup by referral_code
 * for the invite landing page (email is protected by emailVisibility).
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  users.fields.add(new Field({
    "hidden": false,
    "id": "text_user_referral_code",
    "autogeneratePattern": "",
    "max": 20,
    "min": 0,
    "name": "referral_code",
    "pattern": "^[A-Z0-9\\-]*$",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  users.indexes = users.indexes || []
  users.indexes.push("CREATE UNIQUE INDEX idx_users_referral_code ON users (referral_code) WHERE referral_code != ''")

  // Public list/view needed for invite landing page lookup by referral_code.
  // Email is protected by PocketBase's emailVisibility per-user setting.
  users.listRule = ''
  users.viewRule = ''

  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")
  users.fields.removeById("text_user_referral_code")
  users.indexes = users.indexes.filter(i => !i.includes("idx_users_referral_code"))
  users.listRule = '@request.auth.id != ""'
  users.viewRule = '@request.auth.id != ""'
  app.save(users)
})
