/**
 * Privacidad por campo de `users` (#411).
 *
 * `users` sigue siendo legible entre usuarios —el muro y el buscador de amigos
 * lo necesitan— así que lo que hay que probar no es que la fila desaparezca,
 * sino que llegue RECORTADA. Eso lo hace `pb_hooks/users_field_privacy.pb.js`
 * con `onRecordEnrich`, y todo en el JSVM de PocketBase falla en silencio, así
 * que el criterio de aceptación es este fichero y no la lectura del hook.
 *
 * Los seis asserts que importan, y por qué:
 *   1. un tercero NO ve los campos privados por `view` (el fallo del issue);
 *   2. tampoco por `list` (la vía del buscador de amigos, que pide sin `fields`);
 *   3. tampoco a través de `expand=user` — es la afirmación que sostiene todo el
 *      diseño: si `onRecordEnrich` no cubriera los expand, el muro seguiría
 *      publicando la fila entera y haría falta mover los campos de colección;
 *   4. el DUEÑO sigue viéndolo todo (si no, le hemos roto onboarding y perfil,
 *      que es el fallo caro y silencioso);
 *   5. el superusuario sigue viéndolo todo (si no, el cron de recordatorios
 *      manda los push en UTC sin dar error);
 *   6. un `role = "admin"` sigue viendo `role`/`tier` (si no, AdminPage se queda
 *      sin la lista de usuarios).
 *
 * En cada caso se comprueba además un campo de control que SÍ debe salir: sin
 * eso, un fallo de siembra dejaría pasar el test por la vía equivocada.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createUser, create, update, api, authAs, superToken, uniq, USER_PASS } from "./helpers/client.mjs"

/** Todo lo que un tercero no tiene por qué ver de otra persona. */
const PRIVATE_FIELDS = [
  // Composición corporal y objetivos — el núcleo del issue.
  "weight", "height", "waist", "goal_weight", "activity_level", "primary_goal", "goal",
  // Plan de entrenamiento.
  "pace", "intensity", "focus_areas", "training_days",
  // Metadatos de cuenta y preferencias.
  "timezone", "tier", "role", "default_currency", "currency_rates", "shopping_cadence_days",
  // Código de referido: hoy se podía recolectar fila a fila.
  "referral_code",
  // Espejo servidor del bloqueo. Ya era `hidden` en el esquema; va aquí para que
  // la guarda de deriva de abajo cuadre con el esquema real.
  "blocked_users",
  // Version gate: qué build usa cada quien y cuándo se le vio por última vez.
  // Es telemetría de operación (¿puedo retirar ya este campo del esquema?), no
  // algo que ninguna pantalla enseñe de otra persona.
  "app_build", "app_version", "app_platform", "last_seen_at",
]

/**
 * Lo que las pantallas cross-user sí consumen. `name` es el fallback de
 * `display_name` en el buscador de amigos, y `created`/`updated` no son campos
 * `system` en PocketBase, así que hay que nombrarlos explícitamente.
 */
// `is_private` (#422) es público a propósito: el perfil ajeno necesita saber si
// ofrecer "Seguir" o "Solicitar". Lo privado es el contenido, no el estado.
const PUBLIC_FIELDS = ["display_name", "avatar", "level", "name", "created", "updated", "is_private"]

/** Valores de siembra: todos los campos privados rellenos y distinguibles de vacío. */
const PROFILE = {
  display_name: "Dueño de la fila",
  level: "intermedio",
  // OJO: `is_private` NO se siembra aquí, y a propósito. Este fichero comprueba
  // el recorte por campo (#411), y para eso el dueño tiene que seguir siendo
  // legible por un tercero; ponerlo a `true` activa el alcance de filas de #422
  // y el test de `expand=user` se queda sin sesión que leer. Como control de
  // "el campo viaja" basta el `false` que sirve PocketBase: si el hook lo
  // recortara llegaría `undefined`, que es lo que el assert distingue.
  weight: 78.5,
  height: 176,
  waist: 84,
  goal_weight: 72,
  activity_level: "moderate",
  primary_goal: "perder_grasa",
  goal: "bajar barriga",
  pace: "balanced",
  intensity: "media",
  focus_areas: ["core", "espalda"],
  training_days: ["mon", "wed", "fri"],
  timezone: "America/Caracas",
  tier: "premium",
  role: "user",
  default_currency: "VES",
  currency_rates: { VES: 143.5 },
  shopping_cadence_days: 7,
}

/** `referral_code` tiene índice único, así que cada siembra necesita el suyo. */
function newReferralCode() {
  return uniq("R411").toUpperCase().replace(/[^A-Z0-9-]/g, "")
}

function assertHidden(rec, label) {
  for (const f of PRIVATE_FIELDS) {
    assert.equal(rec[f], undefined, `${label}: '${f}' no debería viajar (valor: ${JSON.stringify(rec[f])})`)
  }
  // Control: si la siembra fallara, el bloque de arriba pasaría en vacío.
  for (const f of PUBLIC_FIELDS) {
    assert.notEqual(rec[f], undefined, `${label}: '${f}' es público y debería viajar`)
  }
  assert.equal(rec.display_name, PROFILE.display_name, `${label}: display_name recortado de más`)
}

function assertComplete(rec, label) {
  for (const f of PRIVATE_FIELDS) {
    // `blocked_users` es `hidden` en el esquema desde 1778000001: PocketBase se lo
    // esconde también al dueño, y eso es lo pretendido (lo sincroniza el servidor).
    if (f === "blocked_users") continue
    assert.notEqual(rec[f], undefined, `${label}: '${f}' debería viajar y no está`)
  }
  assert.equal(rec.weight, PROFILE.weight, `${label}: weight`)
  assert.equal(rec.timezone, PROFILE.timezone, `${label}: timezone`)
  assert.deepEqual(rec.focus_areas, PROFILE.focus_areas, `${label}: focus_areas (json)`)
}

/** Dueño con el perfil completo, un tercero cualquiera y un admin de la app. */
async function seed() {
  const owner = await createUser("Owner411")
  const profile = { ...PROFILE, referral_code: newReferralCode() }
  await update("users", owner.id, profile)

  const stranger = await createUser("Stranger411")

  const admin = await createUser("Admin411")
  // Por superuser: `users.updateRule` lleva `@request.body.role:isset = false`
  // desde 1774000056, así que un usuario no puede darse el rol a sí mismo.
  await update("users", admin.id, { role: "admin" })

  return { owner, stranger, admin, profile }
}

test("#411 un tercero no ve los campos privados por `view`", async () => {
  const { owner, stranger } = await seed()
  const rec = await api(`/api/collections/users/records/${owner.id}`, { token: await authAs(stranger) })
  assertHidden(rec, "view de un tercero")
})

test("#411 un tercero no ve los campos privados por `list`", async () => {
  const { owner, stranger } = await seed()
  const res = await api(
    `/api/collections/users/records?perPage=200&filter=${encodeURIComponent(`id = '${owner.id}'`)}`,
    { token: await authAs(stranger) },
  )
  assert.equal(res.items.length, 1, "el tercero debería seguir viendo la fila (recortada), no perderla")
  assertHidden(res.items[0], "list de un tercero")
})

test("#411 `expand=user` tampoco publica los campos privados", async () => {
  const { owner, stranger } = await seed()
  // El muro real: `public_sessions` (#386) con el autor expandido.
  await create("sessions", {
    user: owner.id,
    workout_key: "wk411",
    phase: 1,
    day: "day1",
    completed_at: "2026-08-13 10:00:00.000Z",
  })

  const res = await api(
    `/api/collections/public_sessions/records?perPage=200&expand=user&filter=${encodeURIComponent(`user = '${owner.id}'`)}`,
    { token: await authAs(stranger) },
  )
  assert.equal(res.items.length, 1, "el tercero debería ver la sesión pública del dueño")

  const expanded = res.items[0].expand?.user
  assert.ok(expanded, "el expand=user debería resolver (lo necesitan muro y comentarios)")
  assertHidden(expanded, "expand=user de un tercero")
})

test("#411 el dueño sigue viendo su fila entera", async () => {
  const { owner } = await seed()
  const rec = await api(`/api/collections/users/records/${owner.id}`, { token: await authAs(owner) })
  assertComplete(rec, "el propio dueño")
})

/**
 * La respuesta de login/refresh es la que acaba en `pb.authStore.record`, y de
 * ahí saca `useAuth` el `role`, el `tier` y la `timezone` del propio usuario. Si
 * en ese momento `requestInfo.auth` no estuviera puesto, el hook recortaría al
 * dueño su propia fila y se caerían `isAdmin`/`userTier` y la zona horaria — sin
 * un solo error por consola.
 */
test("#411 el login y el refresh devuelven la fila entera del propio usuario", async () => {
  const { owner, profile } = await seed()

  const login = await api("/api/collections/users/auth-with-password", {
    method: "POST",
    body: { identity: owner.email, password: USER_PASS },
  })
  assertComplete(login.record, "respuesta de auth-with-password")
  assert.equal(login.record.referral_code, profile.referral_code, "auth-with-password: referral_code")

  const refreshed = await api("/api/collections/users/auth-refresh", {
    method: "POST",
    token: login.token,
  })
  assertComplete(refreshed.record, "respuesta de auth-refresh")
})

test("#411 el superusuario sigue viendo la fila entera (cron de recordatorios)", async () => {
  const { owner } = await seed()
  const rec = await api(`/api/collections/users/records/${owner.id}`, { token: await superToken() })
  assertComplete(rec, "superusuario")
})

/**
 * Guarda de deriva: el hook deriva el recorte del esquema, así que un campo
 * nuevo en `users` nace privado — bien— pero en silencio. Esto obliga a
 * decidirlo: si alguien añade un campo, este test falla y hay que declararlo
 * público (lista PUBLIC del hook) o privado (lista de aquí arriba). Es la
 * pareja del fallo de #386, donde `hr_avg`/`hr_max` acabaron expuestos porque
 * nadie tuvo que decidir nada.
 */
test("#411 el recorte cubre todos los campos no públicos del esquema", async () => {
  const col = await api("/api/collections/users", { token: await superToken() })
  const derived = col.fields
    .filter((f) => !f.system && !PUBLIC_FIELDS.includes(f.name))
    .map((f) => f.name)
    .sort()

  assert.deepEqual(
    derived,
    [...PRIVATE_FIELDS].sort(),
    "El esquema de `users` cambió. Decide si el campo nuevo es público (añádelo a " +
      "PUBLIC en pb_hooks/users_field_privacy.pb.js y a PUBLIC_FIELDS aquí) o " +
      "privado (añádelo a PRIVATE_FIELDS aquí).",
  )
})

test("#411 un admin de la app sigue viendo `role` y `tier` (AdminPage)", async () => {
  const { owner, admin } = await seed()
  const rec = await api(`/api/collections/users/records/${owner.id}`, { token: await authAs(admin) })
  assert.equal(rec.role, PROFILE.role, "AdminPage lista el rol de otros usuarios")
  assert.equal(rec.tier, PROFILE.tier, "AdminPage lista el tier de otros usuarios")
})
