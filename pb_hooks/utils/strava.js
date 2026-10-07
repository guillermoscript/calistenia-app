/// <reference path="../../pb_data/types.d.ts" />

/**
 * Handlers de la integración con Strava (#914). Registrados en
 * `pb_hooks/strava.pb.js`; cada callback hace `require` de este módulo (JSVM
 * aislado: no hay closures entre ficheros).
 *
 * El `client_secret` y los tokens viven SOLO aquí y en `strava_connections`
 * (sin reglas de acceso). Ninguna respuesta de este módulo devuelve un token.
 *
 * Errores previstos → JSON `{ code, message }` con el HTTP que toque, nunca
 * `ApiError` con 401: los clientes tratan un 401 como «sesión caducada» y
 * cerrarían la sesión por un problema que es solo de Strava.
 */

var gpx = require(`${__hooks}/utils/strava_gpx.js`)

// Configurable solo para que los tests apunten a un stub local de Strava.
var HOST = $os.getenv("STRAVA_API_BASE") || "https://www.strava.com"
var API = HOST + "/api/v3"
var STATE_TTL_SECONDS = 600
// Margen para no mandar un token que caduca en mitad de la petición.
var REFRESH_MARGIN_SECONDS = 120

function cfg() {
  return {
    clientId: $os.getenv("STRAVA_CLIENT_ID") || "",
    clientSecret: $os.getenv("STRAVA_CLIENT_SECRET") || "",
    stateSecret: $os.getenv("STRAVA_STATE_SECRET") || "",
    redirectUri: $os.getenv("STRAVA_REDIRECT_URI") || "",
    webUrl: ($os.getenv("STRAVA_WEB_URL") || "").replace(/\/+$/, ""),
  }
}

function isConfigured(c) {
  return !!(c.clientId && c.clientSecret && c.stateSecret && c.redirectUri)
}

function fail(e, status, code, message) {
  return e.json(status, { code: code, message: message })
}

function nowSeconds() { return Math.floor(Date.now() / 1000) }

function form(obj) {
  var parts = []
  for (var k in obj) {
    if (obj[k] === undefined || obj[k] === null) continue
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(obj[k])))
  }
  return parts.join("&")
}

function userId(e) { return e.auth.getString("id") }

// ── state firmado: ata el callback (sin sesión) a la cuenta que lo pidió ──────

function signState(c, uid, ret) {
  var payload = uid + "." + (nowSeconds() + STATE_TTL_SECONDS) + "." + ret
  return payload + "." + $security.hs256(payload, c.stateSecret)
}

function verifyState(c, state) {
  var parts = String(state || "").split(".")
  if (parts.length !== 4) return null
  var payload = parts[0] + "." + parts[1] + "." + parts[2]
  if (!$security.equal(parts[3], $security.hs256(payload, c.stateSecret))) return null
  if (Number(parts[1]) < nowSeconds()) return null
  return { uid: parts[0], ret: parts[2] === "mobile" ? "mobile" : "web" }
}

// ── conexión ─────────────────────────────────────────────────────────────────

function findConnection(app, uid) {
  try {
    return app.findFirstRecordByFilter("strava_connections", "user = {:u}", { u: uid })
  } catch (_) { return null }
}

function saveConnection(app, uid, tok) {
  var rec = findConnection(app, uid)
  if (!rec) {
    rec = new Record(app.findCollectionByNameOrId("strava_connections"))
    rec.set("user", uid)
  }
  rec.set("access_token", tok.access_token)
  rec.set("refresh_token", tok.refresh_token)
  rec.set("expires_at", tok.expires_at)
  if (tok.athlete && tok.athlete.id) rec.set("athlete_id", tok.athlete.id)
  if (tok.scope) rec.set("scope", tok.scope)
  app.save(rec)
  return rec
}

/** Devuelve un access_token vigente (renovándolo si hace falta) o null si Strava revocó el acceso. */
function freshAccessToken(app, c, conn) {
  if (conn.getInt("expires_at") > nowSeconds() + REFRESH_MARGIN_SECONDS) {
    return conn.getString("access_token")
  }
  var res = $http.send({
    url: HOST + "/oauth/token", method: "POST", timeout: 20,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form({
      client_id: c.clientId, client_secret: c.clientSecret,
      grant_type: "refresh_token", refresh_token: conn.getString("refresh_token"),
    }),
  })
  if (res.statusCode >= 400 && res.statusCode < 500) {
    // El usuario revocó el acceso desde Strava: la conexión ya no sirve.
    app.delete(conn)
    return null
  }
  if (res.statusCode !== 200 || !res.json || !res.json.access_token) {
    throw new Error("strava refresh falló: HTTP " + res.statusCode)
  }
  conn.set("access_token", res.json.access_token)
  conn.set("refresh_token", res.json.refresh_token)
  conn.set("expires_at", res.json.expires_at)
  app.save(conn)
  return res.json.access_token
}

// ── handlers ─────────────────────────────────────────────────────────────────

function status(e) {
  var c = cfg()
  if (!isConfigured(c)) return e.json(200, { configured: false, connected: false })
  var conn = findConnection(e.app, userId(e))
  return e.json(200, {
    configured: true,
    connected: !!conn,
    athlete_id: conn ? conn.getInt("athlete_id") || null : null,
  })
}

function connect(e) {
  var c = cfg()
  if (!isConfigured(c)) return fail(e, 503, "strava_not_configured", "Strava no está configurado en el servidor")
  var body = e.requestInfo().body || {}
  var ret = body.return === "mobile" ? "mobile" : "web"
  var url = "https://www.strava.com/oauth/mobile/authorize"
  // `mobile/authorize` abre la app de Strava si está instalada; en web usa la normal.
  if (ret === "web") url = "https://www.strava.com/oauth/authorize"
  url += "?" + form({
    client_id: c.clientId, redirect_uri: c.redirectUri, response_type: "code",
    approval_prompt: "auto", scope: "activity:write",
    state: signState(c, userId(e), ret),
  })
  return e.json(200, { url: url })
}

function callback(e) {
  var c = cfg()
  var q = e.request.url.query()
  var state = verifyState(c, q.get("state"))
  // Sin state válido no se sabe ni a qué plataforma devolver: página sencilla.
  if (!isConfigured(c) || !state) return e.string(400, "Enlace de Strava no válido o caducado")

  var back = function (result) {
    if (state.ret === "mobile") return e.redirect(302, "calistenia://strava?status=" + result)
    return e.redirect(302, c.webUrl + "/profile?strava=" + result)
  }

  var code = q.get("code")
  var scope = q.get("scope") || ""
  // El usuario pulsó «Cancelar» o desmarcó el permiso de subir actividades.
  if (q.get("error") || !code || scope.indexOf("activity:write") === -1) return back("denied")

  var res = $http.send({
    url: HOST + "/oauth/token", method: "POST", timeout: 20,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form({
      client_id: c.clientId, client_secret: c.clientSecret,
      code: code, grant_type: "authorization_code",
    }),
  })
  if (res.statusCode !== 200 || !res.json || !res.json.access_token) {
    console.log("[strava] intercambio de código falló: HTTP " + res.statusCode)
    return back("error")
  }
  saveConnection(e.app, state.uid, {
    access_token: res.json.access_token, refresh_token: res.json.refresh_token,
    expires_at: res.json.expires_at, athlete: res.json.athlete, scope: scope,
  })
  return back("connected")
}

function disconnect(e) {
  var c = cfg()
  var conn = findConnection(e.app, userId(e))
  if (!conn) return e.json(200, { connected: false })
  // Revocar en Strava es de mejor esfuerzo: si falla (token ya caducado o red),
  // igualmente se borran los tokens locales, que es lo que pide el usuario.
  try {
    $http.send({
      url: HOST + "/oauth/deauthorize", method: "POST", timeout: 15,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ access_token: freshAccessToken(e.app, c, conn) || conn.getString("access_token") }),
    })
  } catch (_) { /* ver comentario */ }
  try { e.app.delete(conn) } catch (_) { /* ya borrada por freshAccessToken */ }
  return e.json(200, { connected: false })
}

function readPoints(app, sessionId) {
  try {
    var rec = app.findFirstRecordByFilter("cardio_routes", "session = {:s}", { s: sessionId })
    var pts = JSON.parse(rec.getString("points") || "[]")
    return Array.isArray(pts) ? pts : []
  } catch (_) { return [] }
}

function isoOf(raw) {
  var d = new Date(String(raw || "").replace(" ", "T"))
  return isNaN(d.getTime()) ? null : d
}

function activityUrl(id) { return "https://www.strava.com/activities/" + id }

function describe(row) {
  var id = row.getInt("activity_id")
  return {
    status: row.getString("status"),
    activity_id: id || null,
    url: id ? activityUrl(id) : null,
    error: row.getString("error") || null,
  }
}

/** Consulta una subida en proceso. Devuelve true si quedó resuelta (done/failed). */
function pollUpload(app, row, token) {
  for (var i = 0; i < 4; i++) {
    var res = $http.send({
      url: API + "/uploads/" + row.getInt("upload_id"), method: "GET", timeout: 15,
      headers: { Authorization: "Bearer " + token },
    })
    if (res.statusCode === 200 && res.json) {
      var j = res.json
      if (j.activity_id) {
        row.set("activity_id", j.activity_id); row.set("status", "done"); row.set("error", "")
        app.save(row); return true
      }
      if (j.error) {
        var dup = gpx.parseDuplicateActivityId(j.error)
        if (dup) { row.set("activity_id", dup); row.set("status", "done"); row.set("error", "") }
        else { row.set("status", "failed"); row.set("error", String(j.error).slice(0, 500)) }
        app.save(row); return true
      }
    }
    sleep(1500)
  }
  return false
}

function upload(e) {
  var c = cfg()
  if (!isConfigured(c)) return fail(e, 503, "strava_not_configured", "Strava no está configurado en el servidor")
  var app = e.app
  var uid = userId(e)
  var sessionId = String((e.requestInfo().body || {}).session || "")
  if (!sessionId) return fail(e, 400, "bad_request", "Falta la sesión")

  var session
  try { session = app.findRecordById("cardio_sessions", sessionId) } catch (_) { session = null }
  // Ajena e inexistente responden igual: no confirmar qué ids existen.
  if (!session || session.getString("user") !== uid) return fail(e, 404, "not_found", "Sesión no encontrada")

  var conn = findConnection(app, uid)
  if (!conn) return fail(e, 409, "strava_not_connected", "Conecta tu cuenta de Strava primero")
  var token = freshAccessToken(app, c, conn)
  if (!token) return fail(e, 409, "strava_reauth_required", "Strava revocó el acceso: vuelve a conectar")

  var row = null
  try { row = app.findFirstRecordByFilter("strava_uploads", "session = {:s}", { s: sessionId }) } catch (_) { /* primera vez */ }
  if (row && row.getString("status") === "done") return e.json(200, describe(row))
  if (row && row.getString("status") === "processing" && row.getInt("upload_id")) {
    pollUpload(app, row, token)
    return e.json(200, describe(row))
  }
  if (!row) {
    // La fila nace ANTES de llamar a Strava: el índice único por sesión hace
    // que un doble toque concurrente falle aquí en vez de subir dos veces.
    row = new Record(app.findCollectionByNameOrId("strava_uploads"))
    row.set("user", uid); row.set("session", sessionId)
  }
  row.set("status", "processing"); row.set("error", ""); row.set("upload_id", 0); row.set("activity_id", 0)
  try { app.save(row) } catch (_) { return fail(e, 409, "upload_in_progress", "Ya se está subiendo") }

  var start = isoOf(session.getString("started_at")) || isoOf(session.getString("finished_at")) || new Date()
  var sessionObj = {
    activity_type: session.getString("activity_type"), note: session.getString("note"),
    hr_avg: session.getFloat("hr_avg"), hr_max: session.getFloat("hr_max"),
    calories_actual: session.getFloat("calories_actual"), calories_burned: session.getFloat("calories_burned"),
  }
  var name = gpx.activityName(sessionObj)
  var description = gpx.activityDescription(sessionObj)
  var sport = gpx.sportType(sessionObj.activity_type)
  var points = readPoints(app, sessionId)

  var res
  var viaUpload = gpx.usablePoints(points) >= 2
  try {
    if (viaUpload) {
      var fd = new FormData()
      fd.append("file", $filesystem.fileFromBytes(toBytes(gpx.buildGpx(points, { name: name })), "calistenia.gpx"))
      fd.append("data_type", "gpx")
      fd.append("name", name)
      fd.append("description", description)
      fd.append("sport_type", sport)
      fd.append("external_id", "calistenia-" + sessionId)
      res = $http.send({
        url: API + "/uploads", method: "POST", timeout: 60, body: fd,
        headers: { Authorization: "Bearer " + token },
      })
    } else {
      // Sin ruta (cinta, sin permiso de ubicación): actividad manual.
      res = $http.send({
        url: API + "/activities", method: "POST", timeout: 30,
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/x-www-form-urlencoded" },
        body: form({
          name: name, description: description, sport_type: sport,
          start_date_local: start.toISOString().replace(/\.\d+Z$/, "Z"),
          elapsed_time: Math.max(1, Math.round(session.getFloat("duration_seconds"))),
          distance: Math.round(session.getFloat("distance_km") * 1000),
        }),
      })
    }
  } catch (err) {
    row.set("status", "failed"); row.set("error", "network"); app.save(row)
    return fail(e, 502, "strava_unreachable", "No se pudo hablar con Strava")
  }

  if (res.statusCode === 401) {
    app.delete(conn); row.set("status", "failed"); row.set("error", "unauthorized"); app.save(row)
    return fail(e, 409, "strava_reauth_required", "Strava revocó el acceso: vuelve a conectar")
  }
  if (res.statusCode === 429) {
    row.set("status", "failed"); row.set("error", "rate_limited"); app.save(row)
    return fail(e, 429, "strava_rate_limited", "Strava pide esperar un poco")
  }
  if (res.statusCode >= 400 || !res.json) {
    var msg = (res.json && (res.json.message || res.json.error)) || ("HTTP " + res.statusCode)
    row.set("status", "failed"); row.set("error", String(msg).slice(0, 500)); app.save(row)
    console.log("[strava] subida falló sesión " + sessionId + ": " + msg)
    return fail(e, 502, "strava_error", "Strava rechazó la actividad")
  }

  if (!viaUpload) {
    // /activities devuelve la actividad ya creada.
    row.set("activity_id", res.json.id); row.set("status", "done")
    app.save(row)
  } else if (res.json.activity_id) {
    row.set("activity_id", res.json.activity_id); row.set("status", "done")
    app.save(row)
  } else if (res.json.error) {
    var dup = gpx.parseDuplicateActivityId(res.json.error)
    if (dup) { row.set("activity_id", dup); row.set("status", "done") }
    else { row.set("status", "failed"); row.set("error", String(res.json.error).slice(0, 500)) }
    app.save(row)
  } else {
    // /uploads es asíncrono: Strava aún está procesando el GPX.
    row.set("upload_id", res.json.id)
    app.save(row)
    pollUpload(app, row, token)
  }
  return e.json(200, describe(row))
}

module.exports = {
  handlers: { status: status, connect: connect, callback: callback, disconnect: disconnect, upload: upload },
}
