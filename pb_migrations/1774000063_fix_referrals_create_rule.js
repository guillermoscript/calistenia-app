/// <reference path="../pb_data/types.d.ts" />

/**
 * Fix referrals createRule: the newly registered user (referred) creates the
 * referral record, so the rule must validate that `referred = @request.auth.id`
 * (not `referrer`). The previous rule prevented any referral from being created
 * because the authenticated user is never the referrer.
 */
migrate((app) => {
  const referrals = app.findCollectionByNameOrId("referrals")
  referrals.createRule = '@request.auth.id != "" && @request.body.referred = @request.auth.id'
  app.save(referrals)
}, (app) => {
  const referrals = app.findCollectionByNameOrId("referrals")
  referrals.createRule = '@request.auth.id != "" && @request.body.referrer = @request.auth.id'
  app.save(referrals)
})
