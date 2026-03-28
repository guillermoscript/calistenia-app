/// <reference path="../pb_data/types.d.ts" />

/**
 * Server-side side effects when a referral record is created:
 * 1. Create mutual follows (referrer ↔ referred)
 * 2. Award 100 points to referrer + 50 points to referred (double-sided reward)
 * 3. Notify referrer
 *
 * Runs with admin-level access ($app), bypassing API rules.
 */
onRecordAfterCreateSuccess((e) => {
  const referrerId = e.record.getString("referrer")
  const referredId = e.record.getString("referred")

  if (!referrerId || !referredId) return

  // 1. Mutual follows
  const followsCollection = $app.findCollectionByNameOrId("follows")

  // referrer → referred
  try {
    const f1 = new Record(followsCollection)
    f1.set("follower", referrerId)
    f1.set("following", referredId)
    $app.save(f1)
  } catch (err) {
    // likely duplicate — already following
    console.log("Referral auto-follow (referrer→referred) skipped:", err)
  }

  // referred → referrer
  try {
    const f2 = new Record(followsCollection)
    f2.set("follower", referredId)
    f2.set("following", referrerId)
    $app.save(f2)
  } catch (err) {
    console.log("Referral auto-follow (referred→referrer) skipped:", err)
  }

  // 2. Award referral points to referrer (100 pts)
  try {
    const pointsCollection = $app.findCollectionByNameOrId("point_transactions")
    const pt = new Record(pointsCollection)
    pt.set("user", referrerId)
    pt.set("amount", 100)
    pt.set("type", "referral_signup")
    pt.set("reference_id", referredId)
    pt.set("description", "Referido se registró")
    $app.save(pt)
  } catch (err) {
    console.log("Referral points creation failed:", err)
  }

  // 2b. Award welcome bonus to the new user (50 pts)
  try {
    const pointsCollection = $app.findCollectionByNameOrId("point_transactions")
    const pt2 = new Record(pointsCollection)
    pt2.set("user", referredId)
    pt2.set("amount", 50)
    pt2.set("type", "referral_bonus")
    pt2.set("reference_id", referrerId)
    pt2.set("description", "Bonus por registrarte con invitación")
    $app.save(pt2)
  } catch (err) {
    console.log("Referred user bonus points creation failed:", err)
  }

  // 3. Notify referrer
  try {
    const notifCollection = $app.findCollectionByNameOrId("notifications")
    const notif = new Record(notifCollection)
    notif.set("user", referrerId)
    notif.set("type", "referral_signup")
    notif.set("actor", referredId)
    notif.set("reference_id", referredId)
    notif.set("reference_type", "user")
    notif.set("read", false)

    // Get referred user's display name for notification data
    let referredName = ""
    try {
      const referred = $app.findRecordById("users", referredId)
      referredName = referred.getString("display_name") || referred.getString("name") || referred.getString("email").split("@")[0] || ""
    } catch (err) { /* non-critical */ }

    notif.set("data", JSON.stringify({ referredName }))
    $app.save(notif)
  } catch (err) {
    console.log("Referral notification creation failed:", err)
  }
}, "referrals")
