/**
 * Visibilidad de programas: private / link / public (#603).
 *
 * Van contra un PocketBase real con las migraciones del repo, así que lo que se
 * comprueba es la regla del SERVIDOR. Un test con stub de `pb` pasaría en verde
 * sin la migración aplicada, que es justo el fallo que no queremos poder tener.
 *
 * Ojo con el modo de fallo: endurecer una regla de lectura en PocketBase NO
 * devuelve 403, devuelve 0 filas sin error. Por eso cada caso negativo va
 * emparejado con su positivo — primero se afirma que el programa EXISTE y que
 * su dueño lo ve, y solo entonces que el ajeno no. Un "0 filas" a secas no
 * distingue entre "la regla funciona" y "la regla está rota y no ve nada".
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  api, authAs, createAs, createUser, getOneAs, listAs, update, uniq,
} from "./helpers/client.mjs"

/** PATCH autenticado como `user` (pasa por las API rules). */
async function updateAs(user, collection, id, data) {
  return api(`/api/collections/${collection}/records/${id}`, {
    method: "PATCH",
    body: data,
    token: await authAs(user),
  })
}

/**
 * Programa creado POR SU AUTOR (no por superuser): así pasa por el createRule
 * de #600 y `created_by` queda como lo dejaría la app real.
 */
async function makeProgram(owner, visibility, { isActive = true } = {}) {
  const name = uniq("Programa")
  return createAs(owner, "programs", {
    name: { es: name, en: name },
    description: { es: "desc", en: "desc" },
    duration_weeks: 4,
    is_active: isActive,
    visibility,
    created_by: owner.id,
  })
}

/** Sube a `role` un usuario ya creado (nadie puede hacerlo por sí mismo). */
async function promote(user, role) {
  await update("users", user.id, { role })
  return user
}

// ─── programs ────────────────────────────────────────────────────────────────

test("el programa privado de otra persona no se lista ni se abre", async () => {
  const owner = await createUser("Duena Privado")
  const stranger = await createUser("Ajena Privado")
  const program = await makeProgram(owner, "private")

  // Positivo primero: el programa existe y su dueña SÍ lo ve. Sin esto, el
  // "0 filas" de abajo no probaría nada.
  const mine = await listAs(owner, "programs", `id = "${program.id}"`)
  assert.equal(mine.length, 1, "la dueña debe seguir viendo su propio borrador")
  assert.ok(await getOneAs(owner, "programs", program.id), "y debe poder abrirlo por id")

  const listed = await listAs(stranger, "programs", `id = "${program.id}"`)
  assert.equal(listed.length, 0, "no debe aparecer en el listado de un tercero")

  // PB responde 404 (no 403) cuando la regla no matchea: no filtra que exista.
  assert.equal(
    await getOneAs(stranger, "programs", program.id), null,
    "tampoco debe poder abrirse por id",
  )
})

test("un programa público sí lo ve cualquier autenticado", async () => {
  const owner = await createUser("Duena Publico")
  const stranger = await createUser("Ajena Publico")
  const program = await makeProgram(owner, "public")

  const listed = await listAs(stranger, "programs", `id = "${program.id}"`)
  assert.equal(listed.length, 1, "la regla no debe romper el caso normal del catálogo")
  assert.ok(await getOneAs(stranger, "programs", program.id))
})

test("`link` se comporta como privado en la API de colección", async () => {
  // Contrato deliberado de #603: `link` está en el enum y en el selector, pero
  // NO en las reglas. Lo hará alcanzable la landing anónima de #604, que sirve
  // el programa desde pb_hooks con `$app` y se salta las rules a propósito.
  // Si algún día este test empieza a fallar en verde-a-rojo por un cambio de
  // reglas, es que se abrió `link` sin pasar por #604.
  const owner = await createUser("Duena Enlace")
  const stranger = await createUser("Ajena Enlace")
  const program = await makeProgram(owner, "link")

  assert.ok(await getOneAs(owner, "programs", program.id), "el dueño sí lo ve")
  assert.equal(
    (await listAs(stranger, "programs", `id = "${program.id}"`)).length, 0,
    "todavía no es visible para terceros por la API de colección",
  )
  assert.equal(await getOneAs(stranger, "programs", program.id), null)
})

test("admin y editor ven los privados ajenos (curación del catálogo)", async () => {
  const owner = await createUser("Duena Curada")
  const admin = await promote(await createUser("Admin Curador"), "admin")
  const editor = await promote(await createUser("Editor Curador"), "editor")
  const program = await makeProgram(owner, "private")

  assert.equal((await listAs(admin, "programs", `id = "${program.id}"`)).length, 1, "admin sí lo ve")
  assert.equal((await listAs(editor, "programs", `id = "${program.id}"`)).length, 1, "editor sí lo ve")
})

test("un anónimo no ve ni siquiera los programas públicos", async () => {
  // Frontera con #604: esta migración NO abre viewRule a anónimos. La landing
  // pública llegará por pb_hooks, no relajando la regla de la colección.
  const owner = await createUser("Duena Anonimos")
  const program = await makeProgram(owner, "public")

  const res = await api(`/api/collections/programs/records/${program.id}`, { raw: true })
  assert.ok(res.status === 404 || res.status === 403, `sin token debe cerrarse, fue ${res.status}`)
})

// ─── colecciones hijas ───────────────────────────────────────────────────────

test("fases, ejercicios y config de día de un privado no se filtran", async () => {
  const owner = await createUser("Duena Hijas")
  const stranger = await createUser("Ajena Hijas")
  const program = await makeProgram(owner, "private")

  const phase = await createAs(owner, "program_phases", {
    program: program.id, phase_number: 1, name: { es: "Fase 1", en: "Phase 1" }, sort_order: 0,
  })
  const dayConfig = await createAs(owner, "program_day_config", {
    program: program.id, phase_number: 1, day_id: "mon",
    day_name: { es: "Lunes", en: "Monday" }, day_type: "strength", sort_order: 0,
  })
  const exercise = await createAs(owner, "program_exercises", {
    program: program.id, phase_number: 1, day_id: "mon",
    exercise_id: "pull_ups",
    name: { es: "Dominadas", en: "Pull-ups" }, sets: 3, reps: "8", sort_order: 0,
  })

  const children = [
    ["program_phases", phase],
    ["program_day_config", dayConfig],
    ["program_exercises", exercise],
  ]

  for (const [collection, record] of children) {
    // Positivo: el dueño ve su fila. Si esto fallara, el 0 de abajo sería un
    // falso verde (la regla estaría rota para todo el mundo).
    assert.equal(
      (await listAs(owner, collection, `id = "${record.id}"`)).length, 1,
      `${collection}: el dueño debe seguir viendo la suya`,
    )
    assert.equal(
      (await listAs(stranger, collection, `id = "${record.id}"`)).length, 0,
      `${collection}: no debe filtrarse la de un programa privado ajeno`,
    )
    assert.equal(
      await getOneAs(stranger, collection, record.id), null,
      `${collection}: tampoco por id`,
    )
  }
})

test("las hijas de un programa público sí se ven", async () => {
  const owner = await createUser("Duena Hijas Publicas")
  const stranger = await createUser("Ajena Hijas Publicas")
  const program = await makeProgram(owner, "public")

  const phase = await createAs(owner, "program_phases", {
    program: program.id, phase_number: 1, name: { es: "Fase 1", en: "Phase 1" }, sort_order: 0,
  })

  assert.equal(
    (await listAs(stranger, "program_phases", `id = "${phase.id}"`)).length, 1,
    "la ficha de un programa público tiene que poder pintar sus fases",
  )
})

// ─── escritura ───────────────────────────────────────────────────────────────

test("un tercero no puede publicar el programa privado de otra persona", async () => {
  const owner = await createUser("Duena Escritura")
  const stranger = await createUser("Ajena Escritura")
  const program = await makeProgram(owner, "private")

  await assert.rejects(
    () => updateAs(stranger, "programs", program.id, { visibility: "public" }),
    (err) => {
      assert.ok([400, 403, 404].includes(err.status), `esperaba 400/403/404, fue ${err.status}`)
      return true
    },
    "el updateRule de #600 ya exige ser el autor",
  )

  const after = await getOneAs(owner, "programs", program.id)
  assert.equal(after.visibility, "private", "la fila no debe haber cambiado")
})

test("el autor sí puede publicar y despublicar lo suyo", async () => {
  const owner = await createUser("Duena Publica")
  const stranger = await createUser("Ajena Observadora")
  const program = await makeProgram(owner, "private")

  await updateAs(owner, "programs", program.id, { visibility: "public" })
  assert.equal(
    (await listAs(stranger, "programs", `id = "${program.id}"`)).length, 1,
    "al publicarlo debe aparecerle al resto",
  )

  await updateAs(owner, "programs", program.id, { visibility: "private" })
  assert.equal(
    (await listAs(stranger, "programs", `id = "${program.id}"`)).length, 0,
    "y al volver a privado debe desaparecer",
  )
})

// ─── esquema ─────────────────────────────────────────────────────────────────

test("`visibility` solo acepta los tres valores del enum", async () => {
  const owner = await createUser("Duena Enum")

  await assert.rejects(
    () => makeProgram(owner, "everyone"),
    "un valor fuera del select debe rechazarse en el servidor",
  )
})

test("una fila creada sin `visibility` se trata como privada", async () => {
  // Es el caso del cliente móvil viejo, que no conoce el campo: la fila nace
  // con el select vacío. El campo es opcional a propósito (exigirlo daría 400
  // en cada escritura de esos clientes), así que la protección tiene que venir
  // de la regla: vacío != "public", luego solo lo ve su autor.
  const owner = await createUser("Duena Legacy")
  const stranger = await createUser("Ajena Legacy")
  const program = await createAs(owner, "programs", {
    name: { es: "Legacy", en: "Legacy" },
    description: { es: "", en: "" },
    duration_weeks: 4,
    is_active: true,
    created_by: owner.id,
  })

  assert.equal(program.visibility, "", "el select opcional nace vacío")
  assert.equal(
    (await listAs(owner, "programs", `id = "${program.id}"`)).length, 1,
    "su autor sí la ve",
  )
  assert.equal(
    (await listAs(stranger, "programs", `id = "${program.id}"`)).length, 0,
    "pero nadie más",
  )
})
