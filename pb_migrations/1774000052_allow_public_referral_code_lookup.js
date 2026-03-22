/// <reference path="../pb_data/types.d.ts" />

/**
 * Allow public lookup of users by referral_code for the invite landing page.
 * Users collection already hides email via emailVisibility=false,
 * so public list access only exposes: id, display_name, avatar, and other non-sensitive fields.
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")
  // Allow public list/view — email is protected by emailVisibility per-user setting
  users.listRule = ''
  users.viewRule = ''
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")
  users.listRule = '@request.auth.id != ""'
  users.viewRule = '@request.auth.id != ""'
  app.save(users)
})
