/// <reference path="../pb_data/types.d.ts" />

/**
 * `GET /api/app-config` — version gate + feature flags remotos.
 *
 * PÚBLICO A PROPÓSITO (sin auth): un cliente bloqueado por el gate no llega a
 * loguearse, así que exigir sesión haría el gate inútil justo en el caso para
 * el que existe. No devuelve nada sensible: números de build, la URL de la
 * tienda y flags de producto.
 *
 * Corre con $app y lee `app_config`, que está bloqueada de par en par (todas
 * las reglas en null). Así la colección puede crecer con campos operativos sin
 * que se expongan por accidente: aquí se sirve una lista blanca explícita.
 *
 * NUNCA devuelve 404. Si no hay fila para la plataforma se responde una config
 * neutra (todo a 0) en vez de un error: el cliente trata cualquier fallo como
 * "no bloquear", y un 404 solo generaría ruido en Sentry.
 */
routerAdd("GET", "/api/app-config", (e) => {
  // La query es la fuente principal (el cliente la manda explícita); las
  // cabeceras X-App-* que pone packages/core/lib/pocketbase.ts son el respaldo.
  var platform = ""
  try {
    platform = e.request.url.query().get("platform") || ""
  } catch (err) { /* binding no disponible: caemos a la cabecera */ }
  if (!platform) platform = e.request.header.get("X-App-Platform") || ""
  platform = String(platform).toLowerCase()

  var KNOWN = ["android", "ios", "web"]
  if (KNOWN.indexOf(platform) === -1) platform = "unknown"

  var neutral = {
    platform: platform,
    min_supported_build: 0,
    latest_build: 0,
    latest_version: "",
    store_url: "",
    message_key: "",
    flags: {},
  }

  if (platform === "unknown") {
    return e.json(200, neutral)
  }

  var rec
  try {
    rec = $app.findFirstRecordByFilter("app_config", "platform = {:p}", { p: platform })
  } catch (err) {
    // Plataforma sin fila todavía (p.ej. iOS antes de publicar): config neutra.
    return e.json(200, neutral)
  }

  // `flags` es json: en el JSVM `get()` devuelve bytes, hay que ir por getString
  // y parsear a mano (mismo gotcha que `name` en public_challenge_preview).
  var flags = {}
  try {
    var raw = rec.getString("flags")
    if (raw) {
      var parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) flags = parsed
    }
  } catch (err) { /* json corrupto: sin flags, el cliente usa sus defaults */ }

  return e.json(200, {
    platform: platform,
    min_supported_build: rec.getInt("min_supported_build") || 0,
    latest_build: rec.getInt("latest_build") || 0,
    latest_version: rec.getString("latest_version") || "",
    store_url: rec.getString("store_url") || "",
    message_key: rec.getString("message_key") || "",
    flags: flags,
  })
})
