/**
 * Cliente REST compartido por los tests de pb_hooks. Habla con el PocketBase
 * efímero y el push-mock que levanta run.mjs (URLs vía env).
 */
import assert from "node:assert/strict"

export const PB_URL = process.env.PB_HOOKS_URL
export const MOCK_URL = process.env.PB_HOOKS_MOCK_URL
const SU_EMAIL = process.env.PB_HOOKS_SU_EMAIL
const SU_PASS = process.env.PB_HOOKS_SU_PASS

if (!PB_URL || !MOCK_URL) {
  throw new Error("Estos tests se corren vía `node tests/pb_hooks/run.mjs` (faltan PB_HOOKS_URL / PB_HOOKS_MOCK_URL)")
}

export const USER_PASS = "TestUser123!"

export async function api(path, { method = "GET", body, token, raw = false, headers = {} } = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (raw) return res
  if (!res.ok) {
    const text = await res.text()
    const err = new Error(`${res.status} ${method} ${path}: ${text}`)
    err.status = res.status
    throw err
  }
  if (res.status === 204) return null
  return res.json()
}

let cachedSuperToken = null
export async function superToken() {
  if (cachedSuperToken) return cachedSuperToken
  const auth = await api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: { identity: SU_EMAIL, password: SU_PASS },
  })
  cachedSuperToken = auth.token
  return cachedSuperToken
}

export function uniq(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

/** Crea un usuario (como superuser) y devuelve { id, email, name }. */
export async function createUser(name) {
  const email = `${uniq(name.toLowerCase().replace(/[^a-z0-9]+/g, "."))}@hooks.test`
  const rec = await create("users", {
    email,
    password: USER_PASS,
    passwordConfirm: USER_PASS,
    display_name: name,
    name,
  })
  return { id: rec.id, email, name }
}

const userTokens = new Map()
export async function authAs(user) {
  if (userTokens.has(user.id)) return userTokens.get(user.id)
  const auth = await api("/api/collections/users/auth-with-password", {
    method: "POST",
    body: { identity: user.email, password: USER_PASS },
  })
  userTokens.set(user.id, auth.token)
  return auth.token
}

/** Create como superuser (bypassa API rules). */
export async function create(collection, data) {
  return api(`/api/collections/${collection}/records`, {
    method: "POST",
    body: data,
    token: await superToken(),
  })
}

/** Create autenticado como `user` (pasa por las API rules + requestInfo real). */
export async function createAs(user, collection, data) {
  return api(`/api/collections/${collection}/records`, {
    method: "POST",
    body: data,
    token: await authAs(user),
  })
}

export async function update(collection, id, data) {
  return api(`/api/collections/${collection}/records/${id}`, {
    method: "PATCH",
    body: data,
    token: await superToken(),
  })
}

export async function remove(collection, id) {
  return api(`/api/collections/${collection}/records/${id}`, {
    method: "DELETE",
    token: await superToken(),
  })
}

export async function getOne(collection, id) {
  return api(`/api/collections/${collection}/records/${id}`, { token: await superToken() })
}

/** Lista como superuser. `filter` en sintaxis de PB. */
export async function list(collection, filter) {
  const qs = filter ? `?perPage=200&filter=${encodeURIComponent(filter)}` : "?perPage=200"
  const res = await api(`/api/collections/${collection}/records${qs}`, { token: await superToken() })
  return res.items
}

export function notificationsFor(userId, type) {
  return list("notifications", `user = '${userId}' && type = '${type}'`)
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Poll hasta que `fn` devuelva algo truthy (los hooks After*Success pueden ser async). */
export async function waitFor(fn, msg, { timeout = 5000, every = 100 } = {}) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    last = await fn()
    if (last) return last
    await sleep(every)
  }
  assert.fail(`waitFor timeout (${timeout}ms): ${msg} — último valor: ${JSON.stringify(last)}`)
}

/** Espera a que exista exactamente `count` notificaciones y asserta que no hay más. */
export async function expectNotifications(userId, type, count, msg) {
  if (count > 0) {
    await waitFor(async () => (await notificationsFor(userId, type)).length >= count, `${msg} (esperando ${count} ${type})`)
  } else {
    await sleep(500) // dar tiempo a que un hook (incorrecto) la cree
  }
  const items = await notificationsFor(userId, type)
  assert.equal(items.length, count, `${msg}: esperaba ${count} notifs '${type}', hay ${items.length}`)
  return items
}

// ── Push mock ────────────────────────────────────────────────────────────────

export async function pushes() {
  const res = await fetch(`${MOCK_URL}/_captured`)
  return res.json()
}

export async function resetPushes() {
  await fetch(`${MOCK_URL}/_reset`, { method: "POST" })
}

/** Pushes a /api/send-push para un user concreto. */
export async function pushesFor(userId) {
  const all = await pushes()
  return all.filter((p) => p.path === "/api/send-push" && p.body && p.body.user_id === userId)
}

export async function waitForPush(pred, msg) {
  return waitFor(async () => {
    const all = await pushes()
    const hit = all.find(pred)
    return hit || null
  }, msg)
}

// ── Crons ────────────────────────────────────────────────────────────────────

export async function triggerCron(jobId) {
  return api(`/api/crons/${jobId}`, { method: "POST", token: await superToken() })
}

// ── Fechas locales (mismo formato que los hooks: YYYY-MM-DD en tz del server) ─

export function localDateString(daysOffset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + daysOffset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
