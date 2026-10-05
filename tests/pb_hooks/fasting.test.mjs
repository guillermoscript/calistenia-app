import { test } from "node:test"
import assert from "node:assert/strict"
import {
  api, authAs, create, createAs, createUser, getOne, getOneAs,
  list, listAs, remove, update,
} from "./helpers/client.mjs"

const HOUR = 3600000
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString()
const session = (user, overrides = {}) => ({
  user: user.id, started_at: ago(48), ended_at: ago(24), goal_hours: 24,
  notes: "", ...overrides,
})
const settings = (user, overrides = {}) => ({
  user: user.id, goal_hours: 16, weekly_goal: 3, ...overrides,
})
async function patchAs(user, collection, id, body, raw = false) {
  return api(`/api/collections/${collection}/records/${id}`, {
    method: "PATCH", token: await authAs(user), body, raw,
  })
}
async function rejected(user, body, field, code) {
  const response = await api("/api/collections/fasting_sessions/records", {
    method: "POST", token: await authAs(user), body, raw: true,
  })
  assert.equal(response.status, 400)
  const data = await response.json()
  if (code) assert.equal(data.data[field]?.code, code, JSON.stringify(data))
}

test("history preserves actual UTC dates, long duration, notes and decimal goals", async () => {
  const user = await createUser("Fasting History")
  const start = ago(72)
  const end = new Date(Date.parse(start) + 48 * HOUR).toISOString()
  const result = await createAs(user, "fasting_sessions", session(user, {
    started_at: start, ended_at: end, goal_hours: 36.5, notes: "Finished after two days",
  }))
  assert.equal(Date.parse(result.started_at), Date.parse(start))
  assert.equal(Date.parse(result.ended_at) - Date.parse(result.started_at), 48 * HOUR)
  assert.equal(result.goal_hours, 36.5)
  assert.equal(result.notes, "Finished after two days")
})

test("sessions and settings are owner-only for read, create, edit and delete", async () => {
  const owner = await createUser("Fasting Owner")
  const other = await createUser("Fasting Other")
  for (const collection of ["fasting_sessions", "fasting_settings"]) {
    const body = collection === "fasting_sessions" ? session(owner) : settings(owner)
    const record = await createAs(owner, collection, body)
    assert.equal((await listAs(other, collection)).length, 0)
    assert.equal(await getOneAs(other, collection, record.id), null)
    assert.equal((await listAs(owner, collection)).length, 1)
    await assert.rejects(createAs(other, collection, body), { status: 400 })
    const edited = await patchAs(other, collection, record.id, { goal_hours: 36 }, true)
    assert.equal(edited.status, 404)
    const reassigned = await patchAs(owner, collection, record.id, { user: other.id }, true)
    assert.equal(reassigned.status, 404)
    const deleted = await api(`/api/collections/${collection}/records/${record.id}`, {
      method: "DELETE", token: await authAs(other), raw: true,
    })
    assert.equal(deleted.status, 404)
    const ownEdit = await patchAs(owner, collection, record.id, { goal_hours: 36 })
    assert.equal(ownEdit.goal_hours, 36)
  }
})

test("anonymous requests cannot read or create private fasting data", async () => {
  const user = await createUser("Fasting Anonymous")
  for (const collection of ["fasting_sessions", "fasting_settings"]) {
    const body = collection === "fasting_sessions" ? session(user) : settings(user)
    const response = await api(`/api/collections/${collection}/records`, { method: "POST", body, raw: true })
    assert.equal(response.status, 400)
    const listed = await api(`/api/collections/${collection}/records`)
    assert.equal(listed.items.length, 0)
  }
})

test("owner is immutable even for a superuser update", async () => {
  const owner = await createUser("Fasting Fixed Owner")
  const other = await createUser("Fasting Reassigned Owner")
  for (const collection of ["fasting_sessions", "fasting_settings"]) {
    const record = await createAs(owner, collection, collection === "fasting_sessions" ? session(owner) : settings(owner))
    await assert.rejects(update(collection, record.id, { user: other.id }), /fasting_owner/)
    assert.equal((await getOne(collection, record.id)).user, owner.id)
  }
})

test("goals and notes have field-level bounds", async () => {
  const user = await createUser("Fasting Bounds")
  for (const goal_hours of [0, -1, 48.1, 100]) {
    await rejected(user, session(user, { goal_hours }))
  }
  await rejected(user, session(user, { notes: "a".repeat(2001) }))
  await createAs(user, "fasting_sessions", session(user, { goal_hours: 1, notes: "a".repeat(2000) }))
})

test("future and reversed or zero-duration dates are rejected", async () => {
  const user = await createUser("Fasting Dates")
  await rejected(user, session(user, { started_at: "" }), "started_at", "fasting_date")
  await rejected(user, session(user, { started_at: ago(-1), ended_at: "" }), "started_at", "fasting_future")
  await rejected(user, session(user, { ended_at: ago(-1) }), "ended_at", "fasting_future")
  const boundary = ago(24)
  await rejected(user, session(user, { started_at: boundary, ended_at: boundary }), "ended_at", "fasting_order")
  await rejected(user, session(user, { started_at: ago(24), ended_at: ago(48) }), "ended_at", "fasting_order")
  assert.equal((await listAs(user, "fasting_sessions")).length, 0)
})

test("overlap guards also apply to superuser writes", async () => {
  const user = await createUser("Fasting Admin Validation")
  await assert.rejects(create("fasting_sessions", session(user, { started_at: ago(-1), ended_at: "" })), /fasting_future/)
  await create("fasting_sessions", session(user))
  await assert.rejects(create("fasting_sessions", session(user, { started_at: ago(36), ended_at: ago(12) })), /fasting_overlap/)
})

test("overlapping, enclosed and enclosing completed intervals are rejected", async () => {
  const user = await createUser("Fasting Overlap")
  await createAs(user, "fasting_sessions", session(user))
  for (const [start, end] of [[60, 36], [36, 12], [40, 30], [60, 12]]) {
    await rejected(user, session(user, { started_at: ago(start), ended_at: ago(end) }), "started_at", "fasting_overlap")
  }
  assert.equal((await listAs(user, "fasting_sessions")).length, 1)
})

test("touching boundaries are allowed, including starting when an older session ended", async () => {
  const user = await createUser("Fasting Consecutive")
  const boundary = ago(24)
  await createAs(user, "fasting_sessions", session(user, { ended_at: boundary }))
  await createAs(user, "fasting_sessions", session(user, { started_at: boundary, ended_at: "" }))
  assert.equal((await listAs(user, "fasting_sessions")).length, 2)
})

test("active timer stays active beyond the goal and rejects a second active or overlapping history", async () => {
  const user = await createUser("Fasting Active")
  const active = await createAs(user, "fasting_sessions", session(user, { started_at: ago(72), ended_at: "", goal_hours: 48 }))
  assert.equal(active.ended_at, "")
  await rejected(user, session(user, { started_at: ago(1), ended_at: "" }), "started_at", "fasting_overlap")
  await rejected(user, session(user), "started_at", "fasting_overlap")
  await createAs(user, "fasting_sessions", session(user, { started_at: ago(120), ended_at: ago(96) }))
  assert.equal((await listAs(user, "fasting_sessions")).length, 2)
})

test("session edits check other sessions, exclude themselves and support explicit ending", async () => {
  const user = await createUser("Fasting Editing")
  const older = await createAs(user, "fasting_sessions", session(user, { started_at: ago(96), ended_at: ago(72) }))
  const active = await createAs(user, "fasting_sessions", session(user, { started_at: ago(48), ended_at: "" }))
  const updated = await patchAs(user, "fasting_sessions", active.id, { notes: "Keep this note", goal_hours: 36 })
  assert.equal(updated.notes, "Keep this note")
  assert.equal(updated.ended_at, "")
  const invalid = await patchAs(user, "fasting_sessions", active.id, { started_at: ago(80) }, true)
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).data.started_at.code, "fasting_overlap")
  assert.equal(Date.parse((await getOne("fasting_sessions", active.id)).started_at), Date.parse(active.started_at))
  const closed = await patchAs(user, "fasting_sessions", active.id, { ended_at: ago(24) })
  assert.ok(closed.ended_at)
  const newActive = await createAs(user, "fasting_sessions", session(user, { started_at: ago(12), ended_at: "" }))
  assert.notEqual(newActive.id, active.id)
  const reopen = await patchAs(user, "fasting_sessions", older.id, { ended_at: "" }, true)
  assert.equal(reopen.status, 400)
})

test("simultaneous starts and simultaneous overlapping history each persist only one winner", async () => {
  for (const active of [true, false]) {
    const user = await createUser(active ? "Fasting Concurrent Starts" : "Fasting Concurrent History")
    const payload = session(user, active ? { started_at: ago(1), ended_at: "" } : {})
    const results = await Promise.allSettled([
      createAs(user, "fasting_sessions", payload), createAs(user, "fasting_sessions", payload),
    ])
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1)
    assert.equal((await listAs(user, "fasting_sessions")).length, 1)
  }
})

test("client IDs prevent duplicate saves and are scoped to each owner", async () => {
  const user = await createUser("Fasting Idempotent")
  const other = await createUser("Fasting Idempotent Other")
  const client_id = "test-client-session-1"
  await createAs(user, "fasting_sessions", session(user, { client_id }))
  await rejected(user, session(user, { started_at: ago(96), ended_at: ago(72), client_id }))
  await createAs(other, "fasting_sessions", session(other, { client_id }))
  assert.equal((await list("fasting_sessions", `client_id = '${client_id}'`)).length, 2)
})

test("settings are unique per user and require bounded integer weekly goals", async () => {
  const user = await createUser("Fasting Settings")
  for (const weekly_goal of [0, 8, 2.5]) {
    await assert.rejects(createAs(user, "fasting_settings", settings(user, { weekly_goal })), { status: 400 })
  }
  await assert.rejects(createAs(user, "fasting_settings", settings(user, { goal_hours: 49 })), { status: 400 })
  const record = await createAs(user, "fasting_settings", settings(user))
  await assert.rejects(createAs(user, "fasting_settings", settings(user)), { status: 400 })
  const updated = await patchAs(user, "fasting_settings", record.id, { weekly_goal: 7, goal_hours: 48 })
  assert.equal(updated.weekly_goal, 7)
  assert.equal(updated.goal_hours, 48)
})

test("owner can discard a session and account deletion cascades private data", async () => {
  const user = await createUser("Fasting Cleanup")
  const record = await createAs(user, "fasting_sessions", session(user))
  await api(`/api/collections/fasting_sessions/records/${record.id}`, { method: "DELETE", token: await authAs(user) })
  assert.equal((await listAs(user, "fasting_sessions")).length, 0)
  await createAs(user, "fasting_sessions", session(user))
  await createAs(user, "fasting_settings", settings(user))
  await remove("users", user.id)
  for (const collection of ["fasting_sessions", "fasting_settings"]) {
    assert.equal((await list(collection, `user = '${user.id}'`)).length, 0)
  }
})
