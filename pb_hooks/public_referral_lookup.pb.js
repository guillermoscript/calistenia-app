/// <reference path="../pb_data/types.d.ts" />

/**
 * Public referral-code lookup (GHSA-wwj3-9h95-wcpf fix).
 *
 * The invite landing page needs to resolve a referral_code to an inviter's
 * public profile for unauthenticated visitors. Previously this was done by
 * relaxing the users collection's listRule/viewRule to also match any record
 * with a non-empty referral_code — but referral_code is auto-assigned to
 * EVERY user at signup, so that rule effectively made the whole users table
 * public.
 *
 * This endpoint replaces that: it runs with $app (bypasses collection API
 * rules), looks up the single matching user, and returns only the minimal
 * public-safe fields the invite landing page needs. The users collection's
 * listRule/viewRule are locked back to authenticated-only (see migration
 * 1780500001_fix_users_public_pii_leak.js).
 */
routerAdd("GET", "/api/public/referral-lookup/{code}", (e) => {
  const code = e.request.pathValue("code")
  if (!code) {
    return e.json(400, { error: "missing code" })
  }

  let user
  try {
    user = $app.findFirstRecordByFilter("users", "referral_code = {:code}", { code: code })
  } catch (err) {
    return e.json(404, { error: "not found" })
  }

  let avatarUrl = null
  if (user.get("avatar")) {
    try {
      avatarUrl = $app.settings().meta.appURL + "/api/files/" +
        user.baseFilesPath() + "/" + user.get("avatar") + "?thumb=200x200"
    } catch (err) {
      avatarUrl = null
    }
  }

  return e.json(200, {
    id: user.id,
    display_name: user.getString("display_name") || "",
    avatarUrl: avatarUrl,
  })
})
