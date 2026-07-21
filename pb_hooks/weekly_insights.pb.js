/// <reference path="../pb_data/types.d.ts" />

/**
 * Weekly cross-metric insight cron (issue #127).
 *
 * Stays dumb on purpose: the mcp-server endpoint
 * (/api/cron/generate-cross-insight) does the context building, cost gate
 * (MIN_INSIGHT_DAYS), dedup (existing insight for the same period), AI
 * generation, persistence, and push — this hook only enumerates "active"
 * users (anyone with at least one push token registered, since there's no
 * last_active field on the users collection) and fires one request per user.
 */
cronAdd("weekly_cross_insight", "0 8 * * 1", () => { // Mondays 08:00 (server tz)
  const apiUrl = $os.getenv("AI_API_URL") || "http://localhost:3001"
  const internalKey = $os.getenv("INTERNAL_API_KEY") || ""
  if (!internalKey) {
    console.log("[weekly_cross_insight] no INTERNAL_API_KEY, skip")
    return
  }

  // Active users = distinct users with at least one push token (no last_active field exists).
  const seen = {}
  try {
    // Sin sort: estas colecciones no tienen campo `created` y "-created"
    // lanzaba GoError "invalid sort field" → el cron enumeraba 0 usuarios.
    const expo = $app.findRecordsByFilter("expo_push_tokens", "id != ''", "", 5000, 0)
    for (let i = 0; i < expo.length; i++) seen[expo[i].getString("user")] = true
  } catch (e) {
    console.log("[weekly_cross_insight] expo query err", e)
  }
  try {
    const web = $app.findRecordsByFilter("push_subscriptions", "id != ''", "", 5000, 0)
    for (let i = 0; i < web.length; i++) seen[web[i].getString("user")] = true
  } catch (e) {
    console.log("[weekly_cross_insight] web query err", e)
  }

  const ids = Object.keys(seen).filter(Boolean)
  console.log("[weekly_cross_insight] " + ids.length + " active users")

  for (let i = 0; i < ids.length; i++) {
    try {
      $http.send({
        url: apiUrl + "/api/cron/generate-cross-insight",
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Key": internalKey },
        body: JSON.stringify({ user_id: ids[i], period_type: "weekly" }),
        timeout: 120,
      })
    } catch (e) {
      console.log("[weekly_cross_insight] user " + ids[i] + " err", e)
    }
  }
})
