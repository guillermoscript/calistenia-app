/**
 * Integración con Strava (#914): reglas de las colecciones y rutas que NO
 * necesitan hablar con Strava. La subida real exige credenciales y red, así que
 * se prueba a mano; lo que sí se puede fijar aquí es que los tokens no salen
 * jamás del servidor y que sin configurar nada se rompe de forma limpia.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { createUser, create, authAs, PB_URL, MOCK_URL } from "./helpers/client.mjs"

async function rawAs(user, path, opts = {}) {
  const token = await authAs(user)
  const res = await fetch(`${PB_URL}${path}`, {
    method: opts.method || "GET",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

test("strava_connections no es legible ni escribible por ningún cliente (tokens)", async () => {
  const owner = await createUser("Strava Dueña")
  await create("strava_connections", {
    user: owner.id, athlete_id: 1, access_token: "secreto-a", refresh_token: "secreto-r", expires_at: 9999999999,
  })
  const list = await rawAs(owner, "/api/collections/strava_connections/records")
  assert.equal(list.status, 403, "ni el dueño puede listar su fila: llevaría los tokens")
  const create_ = await rawAs(owner, "/api/collections/strava_connections/records", {
    method: "POST",
    body: { user: owner.id, access_token: "x", refresh_token: "y", expires_at: 1 },
  })
  assert.equal(create_.status, 403)
})

test("strava_uploads: el dueño lee la suya, otra cuenta no, y nadie la escribe desde el cliente", async () => {
  const owner = await createUser("Strava Sube")
  const other = await createUser("Strava Curiosa")
  const session = await create("cardio_sessions", {
    user: owner.id, activity_type: "running", distance_km: 5, duration_seconds: 1800,
    started_at: "2026-07-25 08:00:00.000Z", finished_at: "2026-07-25 08:30:00.000Z",
  })
  const row = await create("strava_uploads", { user: owner.id, session: session.id, status: "done", activity_id: 42 })

  const mine = await rawAs(owner, `/api/collections/strava_uploads/records/${row.id}`)
  assert.equal(mine.status, 200)
  assert.equal(mine.json.activity_id, 42)
  const theirs = await rawAs(other, `/api/collections/strava_uploads/records/${row.id}`)
  assert.equal(theirs.status, 404)

  const forged = await rawAs(owner, "/api/collections/strava_uploads/records", {
    method: "POST", body: { user: owner.id, session: session.id, status: "done", activity_id: 1 },
  })
  assert.equal(forged.status, 403, "un cliente no puede afirmar que subió algo")
})

const stravaCalls = async () => (await (await fetch(`${MOCK_URL}/_captured`)).json()).filter((c) => c.path.startsWith("/strava/"))
const resetMock = () => fetch(`${MOCK_URL}/_reset`, { method: "POST" })
const hs256 = (payload) => createHmac("sha256", "state-secret-de-tests").update(payload).digest("hex")

async function connectedUser(name, expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  const user = await createUser(name)
  await create("strava_connections", {
    user: user.id, athlete_id: 777, access_token: "tok-viejo", refresh_token: "ref-viejo", expires_at: expiresAt,
  })
  return user
}

async function runSession(user, extra = {}) {
  return create("cardio_sessions", {
    user: user.id, activity_type: "running", distance_km: 5, duration_seconds: 1800, note: "Series",
    started_at: "2026-07-25 08:00:00.000Z", finished_at: "2026-07-25 08:30:00.000Z", ...extra,
  })
}

test("status y connect: sin conexión previa, y la URL lleva el state firmado y el scope", async () => {
  const user = await createUser("Strava Conecta")
  const st = await rawAs(user, "/api/strava/status")
  assert.deepEqual(st.json, { configured: true, connected: false, athlete_id: null })
  const co = await rawAs(user, "/api/strava/connect", { method: "POST", body: { return: "mobile" } })
  const url = new URL(co.json.url)
  assert.equal(url.pathname, "/oauth/mobile/authorize")
  assert.equal(url.searchParams.get("scope"), "activity:write")
  assert.equal(url.searchParams.get("state").split(".")[2], "mobile")
})

test("callback: state válido guarda los tokens y vuelve a la app; state manipulado no", async () => {
  const user = await createUser("Strava Callback")
  const payload = `${user.id}.${Math.floor(Date.now() / 1000) + 300}.mobile`
  const ok = await fetch(`${PB_URL}/api/strava/callback?code=abc&scope=read,activity:write&state=${payload}.${hs256(payload)}`, { redirect: "manual" })
  assert.equal(ok.status, 302)
  assert.equal(ok.headers.get("location"), "calistenia://strava?status=connected")
  const st = await rawAs(user, "/api/strava/status")
  assert.equal(st.json.connected, true)
  assert.equal(st.json.athlete_id, 777)

  const forged = await fetch(`${PB_URL}/api/strava/callback?code=abc&scope=activity:write&state=${payload}.${hs256(payload).replace(/.$/, "0")}`, { redirect: "manual" })
  assert.equal(forged.status, 400)

  const denied = `${user.id}.${Math.floor(Date.now() / 1000) + 300}.web`
  const noScope = await fetch(`${PB_URL}/api/strava/callback?code=abc&scope=read&state=${denied}.${hs256(denied)}`, { redirect: "manual" })
  assert.equal(noScope.headers.get("location"), "/profile?strava=denied", "sin permiso de subir no se guarda nada útil")
})

test("subir sin conexión: 409 strava_not_connected", async () => {
  const user = await createUser("Strava Sin Conexion")
  const s = await runSession(user)
  const res = await rawAs(user, "/api/strava/upload", { method: "POST", body: { session: s.id } })
  assert.equal(res.status, 409)
  assert.equal(res.json.code, "strava_not_connected")
})

test("subir una sesión con ruta: GPX a /uploads, sondea hasta tener actividad y es idempotente", async () => {
  const user = await connectedUser("Strava Sube Ruta")
  const s = await runSession(user)
  await create("cardio_routes", {
    session: s.id, user: user.id,
    points: [
      { lat: 40.4168, lng: -3.7038, alt: 660, timestamp: Date.UTC(2026, 6, 25, 8, 0, 0) },
      { lat: 40.4170, lng: -3.7040, alt: 662, timestamp: Date.UTC(2026, 6, 25, 8, 0, 30) },
    ],
  })
  await resetMock()
  const res = await rawAs(user, "/api/strava/upload", { method: "POST", body: { session: s.id } })
  assert.equal(res.status, 200)
  assert.equal(res.json.status, "done")
  assert.equal(res.json.activity_id, 9001)
  assert.equal(res.json.url, "https://www.strava.com/activities/9001")

  const calls = await stravaCalls()
  const up = calls.find((c) => c.method === "POST" && c.path === "/strava/api/v3/uploads")
  assert.equal(up.auth, "Bearer tok-viejo")
  assert.match(up.raw, /name="external_id"\r\n\r\ncalistenia-/)
  assert.match(up.raw, /name="sport_type"\r\n\r\nRun/)
  assert.match(up.raw, /<trkpt lat="40.416800" lon="-3.703800">/)

  await resetMock()
  const again = await rawAs(user, "/api/strava/upload", { method: "POST", body: { session: s.id } })
  assert.equal(again.json.activity_id, 9001)
  assert.equal((await stravaCalls()).length, 0, "segunda subida: ni una llamada a Strava")
})

test("subir una sesión sin ruta: actividad manual con distancia en metros y duración", async () => {
  const user = await connectedUser("Strava Manual")
  const s = await runSession(user)
  await resetMock()
  const res = await rawAs(user, "/api/strava/upload", { method: "POST", body: { session: s.id } })
  assert.equal(res.json.activity_id, 9002)
  const act = (await stravaCalls()).find((c) => c.path === "/strava/api/v3/activities")
  const body = new URLSearchParams(act.raw)
  assert.equal(body.get("distance"), "5000")
  assert.equal(body.get("elapsed_time"), "1800")
  assert.equal(body.get("sport_type"), "Run")
})

test("token caducado: se renueva antes de subir y se guarda el nuevo", async () => {
  const user = await connectedUser("Strava Refresca", 1)
  const s = await runSession(user)
  await resetMock()
  await rawAs(user, "/api/strava/upload", { method: "POST", body: { session: s.id } })
  const calls = await stravaCalls()
  assert.ok(calls.some((c) => c.path === "/strava/oauth/token"))
  assert.equal(calls.find((c) => c.path === "/strava/api/v3/activities").auth, "Bearer tok-nuevo")
})

test("no se puede subir la sesión de otra cuenta (404, sin llamar a Strava)", async () => {
  const owner = await createUser("Strava Duena Sesion")
  const intruder = await connectedUser("Strava Intruso")
  const s = await runSession(owner)
  await resetMock()
  const res = await rawAs(intruder, "/api/strava/upload", { method: "POST", body: { session: s.id } })
  assert.equal(res.status, 404)
  assert.equal((await stravaCalls()).length, 0)
})

test("disconnect: revoca en Strava y borra los tokens", async () => {
  const user = await connectedUser("Strava Desconecta")
  await resetMock()
  const res = await rawAs(user, "/api/strava/disconnect", { method: "POST", body: {} })
  assert.equal(res.json.connected, false)
  assert.ok((await stravaCalls()).some((c) => c.path === "/strava/oauth/deauthorize"))
  assert.equal((await rawAs(user, "/api/strava/status")).json.connected, false)
})

test("las rutas de Strava exigen sesión, salvo el callback que valida su state", async () => {
  const res = await fetch(`${PB_URL}/api/strava/status`)
  assert.equal(res.status, 401)
  const cb = await fetch(`${PB_URL}/api/strava/callback?code=x&state=falso`, { redirect: "manual" })
  assert.equal(cb.status, 400, "state inválido no redirige a ningún sitio")
})
