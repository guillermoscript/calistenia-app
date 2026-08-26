/**
 * Esquema y alcance de la progresión automática (#617).
 *
 * Va contra un PocketBase real con las migraciones del repo. Un test con stub
 * del SDK no probaría NADA de esto: lo que se comprueba aquí es que las
 * migraciones aplican de verdad y que las reglas de API sostienen el reparto
 * propio/ajeno, y las dos cosas son de servidor.
 *
 * Ojo con el modo de fallo de las reglas mal escritas en PocketBase: no
 * devuelven 403, devuelven **0 filas**. Por eso hay casos POSITIVOS (el dueño ve
 * y escribe lo suyo) y no solo negativos.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { api, authAs, createAs, createUser, list, uniq } from "./helpers/client.mjs"

const OVERRIDES = "user_program_overrides"

/** Programa creado por `author` (el `createRule` exige `created_by = auth.id`). */
async function makeProgram(author) {
  return createAs(author, "programs", {
    name: uniq("Programa"),
    description: "programa de prueba de #617",
    duration_weeks: 4,
    is_active: true,
    created_by: author.id,
    visibility: "public",
  })
}

/** POST autenticado que devuelve la respuesta cruda (para afirmar el status). */
async function createRaw(user, collection, data) {
  return api(`/api/collections/${collection}/records`, {
    method: "POST",
    token: await authAs(user),
    body: data,
    raw: true,
  })
}

async function listAsRaw(user, collection, filter) {
  const qs = filter ? `?filter=${encodeURIComponent(filter)}` : ""
  return api(`/api/collections/${collection}/records${qs}`, { token: await authAs(user) })
}

test("user_programs acepta el opt-in auto_progress", async () => {
  const user = await createUser("Opt In")
  const program = await makeProgram(user)

  const enrollment = await createAs(user, "user_programs", {
    user: user.id,
    program: program.id,
    started_at: "2026-08-01 08:00:00",
    is_current: true,
    status: "active",
    auto_progress: true,
  })

  assert.equal(enrollment.auto_progress, true, "el campo existe y guarda el valor")

  const [row] = await list("user_programs", `id = "${enrollment.id}"`)
  assert.equal(row.auto_progress, true, "y persiste en la tabla, no solo en la respuesta")
})

test("una inscripción sin tocar el opt-in nace apagada", async () => {
  // Un `bool` ausente en PocketBase es `false`, que es exactamente el defecto
  // que queremos: nadie estrena la progresión automática sin pedirla.
  const user = await createUser("Opt In Defecto")
  const program = await makeProgram(user)

  const enrollment = await createAs(user, "user_programs", {
    user: user.id,
    program: program.id,
    started_at: "2026-08-01 08:00:00",
    is_current: true,
    status: "active",
  })

  assert.equal(enrollment.auto_progress, false, "apagado por defecto, sin backfill")
})

test("el dueño de la fila crea, lee y sobrescribe su override", async () => {
  const autor = await createUser("Autor Programa")
  const inscrito = await createUser("Inscrito Override")
  const program = await makeProgram(autor)

  const override = await createAs(inscrito, OVERRIDES, {
    user: inscrito.id,
    program: program.id,
    exercise_id: "lun_1_2",
    exercise_id_override: "pushup_std",
    reps_override: "8",
  })

  assert.equal(override.exercise_id_override, "pushup_std")
  assert.equal(override.reps_override, "8")

  const mine = await listAsRaw(inscrito, OVERRIDES, `program = "${program.id}"`)
  assert.equal(mine.items.length, 1, "el inscrito ve su propio override")
  assert.equal(mine.items[0].id, override.id)

  const patched = await api(`/api/collections/${OVERRIDES}/records/${override.id}`, {
    method: "PATCH",
    token: await authAs(inscrito),
    body: { reps_override: "10" },
  })
  assert.equal(patched.reps_override, "10", "la aceptación se sobrescribe")
})

test("el override de uno NO lo ve ni lo escribe otro", async () => {
  const autor = await createUser("Autor Ajeno")
  const inscrito = await createUser("Inscrito Ajeno")
  const fisgon = await createUser("Fisgón")
  const program = await makeProgram(autor)

  await createAs(inscrito, OVERRIDES, {
    user: inscrito.id,
    program: program.id,
    exercise_id: "lun_1_2",
    reps_override: "11",
  })

  // Lectura: la regla filtra por `user`, así que el fisgón ve CERO filas —no un
  // 403—, incluso preguntando explícitamente por las del otro.
  const ajenas = await listAsRaw(fisgon, OVERRIDES, `user = "${inscrito.id}"`)
  assert.equal(ajenas.items.length, 0, "los ajustes de otro no se leen")

  // Escritura a nombre de otro: la bloquea el `createRule`, no el cliente.
  const res = await createRaw(fisgon, OVERRIDES, {
    user: inscrito.id,
    program: program.id,
    exercise_id: "lun_1_3",
    reps_override: "99",
  })
  assert.equal(res.status, 400, "no se pueden escribir overrides a nombre de otro")

  const delRes = await api(`/api/collections/${OVERRIDES}/records/${(await list(OVERRIDES, `user = "${inscrito.id}"`))[0].id}`, {
    method: "DELETE",
    token: await authAs(fisgon),
    raw: true,
  })
  assert.equal(delRes.status, 404, "ni borrarlos: la fila ni siquiera es visible")
})

test("un usuario NO puede tener dos overrides del mismo ejercicio", async () => {
  // Sin el índice único, aceptar dos veces dejaría dos filas y ganaría la que
  // el orden de lectura quisiera.
  const autor = await createUser("Autor Único")
  const inscrito = await createUser("Inscrito Único")
  const program = await makeProgram(autor)

  const payload = {
    user: inscrito.id,
    program: program.id,
    exercise_id: "lun_1_2",
    reps_override: "11",
  }

  await createAs(inscrito, OVERRIDES, payload)
  const dup = await createRaw(inscrito, OVERRIDES, { ...payload, reps_override: "12" })

  assert.equal(dup.status, 400, "el índice único rechaza el duplicado")
})

test("el mismo ejercicio en DOS programas distintos sí son dos overrides", async () => {
  // El índice es por (user, program, exercise_id): la clave de slot `lun_1_2`
  // se repite en todos los programas, y no puede colisionar entre ellos.
  const autor = await createUser("Autor Dos")
  const inscrito = await createUser("Inscrito Dos")
  const uno = await makeProgram(autor)
  const otro = await makeProgram(autor)

  await createAs(inscrito, OVERRIDES, {
    user: inscrito.id, program: uno.id, exercise_id: "lun_1_2", reps_override: "11",
  })
  const segundo = await createRaw(inscrito, OVERRIDES, {
    user: inscrito.id, program: otro.id, exercise_id: "lun_1_2", reps_override: "11",
  })

  assert.equal(segundo.status, 200, "dos programas, dos overrides")
})

test("borrar el programa se lleva los overrides por delante", async () => {
  // Van con `cascadeDelete: true` a propósito: al revés que una inscripción
  // (#605), un override sin su programa no es historial de nadie.
  const autor = await createUser("Autor Cascade")
  const inscrito = await createUser("Inscrito Cascade")
  const program = await makeProgram(autor)

  const override = await createAs(inscrito, OVERRIDES, {
    user: inscrito.id,
    program: program.id,
    exercise_id: "lun_1_2",
    reps_override: "11",
  })

  assert.equal((await list(OVERRIDES, `id = "${override.id}"`)).length, 1, "existe antes")

  await api(`/api/collections/programs/records/${program.id}`, {
    method: "DELETE",
    token: await authAs(autor),
  })

  assert.equal(
    (await list(OVERRIDES, `id = "${override.id}"`)).length,
    0,
    "y desaparece con el programa, sin necesidad de hook",
  )
})
