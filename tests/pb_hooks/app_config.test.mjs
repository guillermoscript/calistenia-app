/**
 * Version gate: `GET /api/app-config` (app_config.pb.js) y el registro de la
 * versión del cliente en `users` (client_telemetry.pb.js).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { api, createUser, getOne, list, update, USER_PASS } from "./helpers/client.mjs"

/** Login pasando las cabeceras X-App-* que pone el cliente real. */
async function authWithClient(user, { platform, build, version }) {
  return api("/api/collections/users/auth-with-password", {
    method: "POST",
    body: { identity: user.email, password: USER_PASS },
    headers: {
      "X-App-Platform": platform,
      "X-App-Build": String(build),
      "X-App-Version": version,
    },
  })
}

async function androidConfigId() {
  const rows = await list("app_config", 'platform = "android"')
  assert.equal(rows.length, 1, "la migración siembra una fila por plataforma")
  return rows[0].id
}

test("la migración siembra el gate DESACTIVADO en las tres plataformas", async () => {
  for (const platform of ["android", "ios", "web"]) {
    const body = await api(`/api/app-config?platform=${platform}`)
    assert.equal(body.platform, platform)
    assert.equal(
      body.min_supported_build,
      0,
      "un min > 0 recién desplegado bloquearía a usuarios reales sin que nadie lo pida"
    )
  }
})

test("app-config es público (sin token) — un cliente bloqueado no puede loguearse", async () => {
  const res = await api("/api/app-config?platform=android", { raw: true })
  assert.equal(res.status, 200)
})

test("app-config devuelve lo que se ponga en la colección", async () => {
  const id = await androidConfigId()
  await update("app_config", id, {
    min_supported_build: 28,
    latest_build: 31,
    latest_version: "1.10.0",
    store_url: "https://play.google.com/store/apps/details?id=tech.guille.calistenia",
    message_key: "update.reasonSecurity",
    flags: { battles: false },
  })

  const body = await api("/api/app-config?platform=android")
  assert.equal(body.min_supported_build, 28)
  assert.equal(body.latest_build, 31)
  assert.equal(body.latest_version, "1.10.0")
  assert.equal(body.message_key, "update.reasonSecurity")
  assert.deepEqual(body.flags, { battles: false }, "flags es json: getString + JSON.parse en el JSVM")

  // Dejarlo como estaba para no contaminar los tests que corren después.
  await update("app_config", id, {
    min_supported_build: 0,
    latest_build: 30,
    message_key: "",
    flags: {},
  })
})

test("app-config no expone campos que no estén en la lista blanca", async () => {
  const body = await api("/api/app-config?platform=android")
  assert.deepEqual(
    Object.keys(body).sort(),
    ["flags", "latest_build", "latest_version", "message_key", "min_supported_build", "platform", "store_url"],
    "ni id, ni created/updated, ni nada que se añada a la colección en el futuro"
  )
})

test("la colección app_config está cerrada a los clientes", async () => {
  const user = await createUser("Curioso Config")
  const token = (await authWithClient(user, { platform: "android", build: 30, version: "1.9.0" })).token
  const res = await api("/api/collections/app_config/records", { token, raw: true })
  assert.equal(res.status, 403, "listRule = null → solo superusuarios")
})

test("una plataforma desconocida devuelve config neutra, nunca 404", async () => {
  for (const q of ["?platform=symbian", "", "?platform="]) {
    const res = await api(`/api/app-config${q}`, { raw: true })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.min_supported_build, 0, "sin plataforma reconocida NUNCA se bloquea")
    assert.equal(body.latest_build, 0)
  }
})

test("la plataforma sale de la cabecera si no viene en la query", async () => {
  const body = await api("/api/app-config", { headers: { "X-App-Platform": "android" } })
  assert.equal(body.platform, "android")
})

test("el login registra la versión del cliente en users", async () => {
  const user = await createUser("Telemetria Login")
  await authWithClient(user, { platform: "android", build: 30, version: "1.9.0" })

  const rec = await getOne("users", user.id)
  assert.equal(rec.app_build, 30)
  assert.equal(rec.app_version, "1.9.0")
  assert.equal(rec.app_platform, "android")
  assert.ok(rec.last_seen_at, "last_seen_at es lo que acota la distribución a usuarios activos")
})

test("auth-refresh actualiza el build cuando el usuario actualiza la app", async () => {
  const user = await createUser("Telemetria Refresh")
  const { token } = await authWithClient(user, { platform: "android", build: 30, version: "1.9.0" })

  await api("/api/collections/users/auth-refresh", {
    method: "POST",
    token,
    headers: { "X-App-Platform": "android", "X-App-Build": "31", "X-App-Version": "1.10.0" },
  })

  const rec = await getOne("users", user.id)
  assert.equal(rec.app_build, 31)
  assert.equal(rec.app_version, "1.10.0")
})

test("un cliente sin cabeceras no pisa la versión ya conocida", async () => {
  const user = await createUser("Telemetria Sin Cabeceras")
  const { token } = await authWithClient(user, { platform: "android", build: 30, version: "1.9.0" })

  // La web y curl no mandan X-App-*; borrar el dato haría inútil la distribución.
  await api("/api/collections/users/auth-refresh", { method: "POST", token })

  const rec = await getOne("users", user.id)
  assert.equal(rec.app_build, 30)
  assert.equal(rec.app_version, "1.9.0")
})

test("la telemetría no rompe el login aunque las cabeceras sean basura", async () => {
  const user = await createUser("Telemetria Basura")
  const auth = await api("/api/collections/users/auth-with-password", {
    method: "POST",
    body: { identity: user.email, password: USER_PASS },
    headers: {
      "X-App-Platform": "android",
      "X-App-Build": "no-soy-un-numero",
      "X-App-Version": "x".repeat(500),
    },
  })
  assert.ok(auth.token, "un fallo en la telemetría jamás puede costar una sesión")

  const rec = await getOne("users", user.id)
  assert.equal(rec.app_build, 0)
  assert.equal(rec.app_version.length, 32, "la versión se acota: es entrada del cliente")
})

test("las columnas de telemetría no se filtran a otros usuarios", async () => {
  const owner = await createUser("Duenio Telemetria")
  const nosy = await createUser("Fisgon Telemetria")
  await authWithClient(owner, { platform: "android", build: 30, version: "1.9.0" })
  const nosyToken = (await authWithClient(nosy, { platform: "android", build: 30, version: "1.9.0" })).token

  const seen = await api(`/api/collections/users/records/${owner.id}`, { token: nosyToken })
  // users_field_privacy.pb.js va por lista blanca: un campo nuevo nace privado.
  for (const field of ["app_build", "app_version", "app_platform", "last_seen_at"]) {
    assert.equal(seen[field], undefined, `${field} no debería verse desde otra cuenta`)
  }
})
