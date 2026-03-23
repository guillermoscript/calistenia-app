/// <reference path="../pb_data/types.d.ts" />
/**
 * Security hardening for users collection.
 *
 * Fixes:
 * - C1: Users can self-escalate role/tier via PATCH. Fixed by adding
 *   @request.body.role:isset = false && @request.body.tier:isset = false
 *   to the updateRule.
 * - C6: list/view rules are '' (public). Fixed by requiring authentication.
 *
 * The referral_code lookup (migration 1774000048) opened rules to ''.
 * A dedicated public endpoint or filtered rule should handle that instead.
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  // C6: require authentication for list/view
  users.listRule = '@request.auth.id != ""'
  users.viewRule = '@request.auth.id != ""'

  // C1: prevent users from changing their own role or tier
  users.updateRule = 'id = @request.auth.id && @request.body.role:isset = false && @request.body.tier:isset = false'

  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")

  // Restore previous (insecure) rules
  users.listRule = ''
  users.viewRule = ''
  users.updateRule = 'id = @request.auth.id'

  app.save(users)
})
