/// <reference path="../pb_data/types.d.ts" />
/**
 * Fix users list/view rules to allow public lookup by referral_code.
 *
 * Migration 1774000056 locked list/view to authenticated-only, which broke
 * the invite landing page (unauthenticated visitors need to resolve a
 * referral link to display the inviter's profile).
 *
 * This allows unauthenticated requests to see users who have a referral_code set.
 * Email is protected by PocketBase's per-user emailVisibility setting.
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  users.listRule = '@request.auth.id != "" || referral_code != ""'
  users.viewRule = '@request.auth.id != "" || referral_code != ""'

  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")

  users.listRule = '@request.auth.id != ""'
  users.viewRule = '@request.auth.id != ""'

  app.save(users)
})
