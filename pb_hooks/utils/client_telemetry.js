/// <reference path="../../pb_data/types.d.ts" />

/**
 * Registra en `users` qué build está usando cada quien (ver la migración
 * 1784300000_users_client_telemetry.js para el porqué).
 *
 * Igual que utils/blocks.js: requerir DENTRO de cada handler (los runtimes del
 * JSVM están aislados y no ven el scope del fichero).
 *
 * DOS GOTCHAS DEL JSVM, los dos verificados a mano contra un PB real porque
 * fallan EN SILENCIO:
 *
 *   1. En los hooks de auth (`onRecordAuthRequest` / `onRecordAuthRefreshRequest`)
 *      `e.request` es UNDEFINED. El acceso a la petición es `e.requestInfo()`,
 *      que es una FUNCIÓN (en `onRecordEnrich` es una propiedad — no son la
 *      misma cosa, ver users_field_privacy.pb.js).
 *   2. En `requestInfo().headers` las cabeceras vienen en minúsculas y con
 *      guiones bajos: `X-App-Platform` se lee como `x_app_platform`.
 */

// Cada cuánto se refresca `last_seen_at` si nada más ha cambiado. Autenticar
// pasa en cada arranque en frío de la app; escribir la fila del usuario en cada
// uno dispararía los hooks de update y el realtime de `users` sin ganar nada.
// 6h basta de sobra para una métrica de "activo en los últimos 30 días".
var LAST_SEEN_THROTTLE_MS = 6 * 60 * 60 * 1000

var KNOWN_PLATFORMS = ["android", "ios", "web"]

/**
 * Lee la identidad del cliente del objeto `headers` de requestInfo().
 * Devuelve null si el cliente no se identifica (web, curl, versiones viejas).
 */
function readClientIdentity(headers) {
  if (!headers) return null

  var platform = String(headers.x_app_platform || "").toLowerCase()
  if (KNOWN_PLATFORMS.indexOf(platform) === -1) return null

  var build = parseInt(headers.x_app_build || "0", 10)
  if (!isFinite(build) || build < 0) build = 0

  // Se acota el largo: son cabeceras, o sea entrada del cliente.
  var version = String(headers.x_app_version || "").slice(0, 32)

  return { platform: platform, build: build, version: version }
}

/**
 * Escribe la identidad en el registro del usuario si cambió algo o si
 * `last_seen_at` está rancio. Nunca lanza: esto cuelga del camino de login y un
 * fallo aquí jamás puede impedir entrar en la app.
 *
 * @param e el evento del hook de auth (se le pide `requestInfo()` aquí dentro).
 * @returns true si escribió.
 */
function recordClientIdentity(e) {
  try {
    if (!e || !e.record || typeof e.requestInfo !== "function") return false

    var id = readClientIdentity(e.requestInfo().headers)
    if (!id) return false

    var record = e.record
    var changed =
      record.getInt("app_build") !== id.build ||
      record.getString("app_platform") !== id.platform ||
      record.getString("app_version") !== id.version

    if (!changed && !isLastSeenStale(record)) return false

    record.set("app_build", id.build)
    record.set("app_version", id.version)
    record.set("app_platform", id.platform)
    record.set("last_seen_at", new DateTime())
    e.app.save(record)
    return true
  } catch (err) {
    // El JSVM falla en silencio de todas formas; al menos queda en el log.
    console.log("[client_telemetry] no se pudo registrar la versión: " + err)
    return false
  }
}

/** ¿`last_seen_at` está vacío o es más viejo que el throttle? */
function isLastSeenStale(record) {
  try {
    var seen = record.getDateTime("last_seen_at")
    var seenStr = seen ? String(seen.string()) : ""
    if (!seenStr) return true // nunca visto
    // PocketBase serializa "2026-08-16 15:04:05.000Z" — a ISO para Date.parse.
    var ms = Date.parse(seenStr.replace(" ", "T"))
    if (!isFinite(ms)) return true
    return new Date().getTime() - ms >= LAST_SEEN_THROTTLE_MS
  } catch (err) {
    return true
  }
}

module.exports = {
  readClientIdentity: readClientIdentity,
  recordClientIdentity: recordClientIdentity,
  isLastSeenStale: isLastSeenStale,
  LAST_SEEN_THROTTLE_MS: LAST_SEEN_THROTTLE_MS,
}
