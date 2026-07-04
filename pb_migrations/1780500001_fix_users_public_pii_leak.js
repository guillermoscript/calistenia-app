/// <reference path="../pb_data/types.d.ts" />
/**
 * Security fix (GHSA-wwj3-9h95-wcpf): users collection publicly exposed PII/health data.
 *
 * Migration 1775100009 set listRule/viewRule to
 * '@request.auth.id != "" || referral_code != ""' so unauthenticated visitors
 * could resolve a single inviter by referral code on the invite landing page.
 *
 * But packages/core/hooks/useAuth.ts auto-generates and saves a referral_code
 * for EVERY new user right after signup (not just users who share invite
 * links), so virtually every row satisfies `referral_code != ""`. Net effect:
 * the entire users table was listable/viewable by anyone unauthenticated,
 * e.g. `GET /api/collections/users/records`, including non-hidden health
 * fields (medical_conditions, injuries, age, sex).
 *
 * Fix:
 * 1. Lock listRule/viewRule back to authenticated-only. The invite landing
 *    page's anonymous referral lookup now goes through a narrow public
 *    endpoint (pb_hooks/public_referral_lookup.pb.js) that returns only
 *    id/display_name/avatar for the single matching code, bypassing the
 *    users collection API rules entirely via $app.
 * 2. Mark health/PII fields hidden so they never serialize in API responses
 *    to non-owners even under future rule changes (defense in depth).
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  users.listRule = '@request.auth.id != ""'
  users.viewRule = '@request.auth.id != ""'

  const hideFields = ["medical_conditions", "injuries", "age", "sex"]
  for (const name of hideFields) {
    const field = users.fields.find(f => f.name === name)
    if (field) field.hidden = true
  }

  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")

  // Restore previous (vulnerable) rules for rollback symmetry only —
  // re-applying this down migration reintroduces GHSA-wwj3-9h95-wcpf.
  users.listRule = '@request.auth.id != "" || referral_code != ""'
  users.viewRule = '@request.auth.id != "" || referral_code != ""'

  const unhideFields = ["medical_conditions", "injuries", "age", "sex"]
  for (const name of unhideFields) {
    const field = users.fields.find(f => f.name === name)
    if (field) field.hidden = false
  }

  app.save(users)
})
