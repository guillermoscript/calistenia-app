/**
 * Landing pública de un programa compartido: `GET /api/programs/{id}/public` (#604).
 *
 * Van contra un PocketBase real con las migraciones y los hooks del repo, que es
 * la única forma de probar esta ruta: corre con `$app` y por tanto se salta las
 * API rules a propósito. Un test con stub de `pb` diría que sí a cualquier cosa.
 *
 * Lo que se afirma, y por qué cada cosa:
 *
 *  1. Que `link` y `public` se leen SIN sesión. Es la funcionalidad; sin esto la
 *     página sigue muerta, que es el bug.
 *  2. Que `private` da 404 — y el MISMO 404 que un id inventado. Si se
 *     distinguieran, la ruta filtraría qué ids existen en la base.
 *  3. Que la respuesta no trae el email del autor ni ningún campo fuera de la
 *     lista. Ese es el riesgo entero de una ruta que corre con `$app`.
 *  4. Que la API de colección SIGUE cerrada para ese mismo programa `link`. Sin
 *     este assert, la ruta podría estar funcionando porque alguien relajó el
 *     `viewRule` por el camino, que es justo lo que #603 vino a cerrar.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  PB_URL, api, authAs, create, createAs, createUser, getOneAs, update, uniq,
} from "./helpers/client.mjs"

/** GET anónimo a la ruta. Devuelve { status, body }. */
async function fetchPublicPreview(programId) {
  const res = await fetch(`${PB_URL}/api/programs/${programId}/public`)
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

/**
 * Programa creado POR SU AUTOR (no por superuser), igual que en
 * programs_visibility.test.mjs: así pasa por el createRule de #600 y
 * `created_by` queda como lo dejaría la app real.
 */
async function makeProgram(owner, visibility) {
  const name = uniq("Programa")
  return createAs(owner, "programs", {
    name: { es: `${name} ES`, en: `${name} EN` },
    description: { es: "Descripción en español", en: "Description in English" },
    duration_weeks: 8,
    is_active: true,
    visibility,
    created_by: owner.id,
  })
}

/** Siembra una fase y dos ejercicios colgando del programa. */
async function seedContent(programId) {
  await create("program_phases", {
    program: programId,
    phase_number: 1,
    name: { es: "Base", en: "Base" },
    weeks: 4,
    sort_order: 0,
  })
  await create("program_exercises", {
    program: programId,
    phase_number: 1,
    day_id: "mon",
    exercise_id: "pull_ups",
    exercise_name: { es: "Dominadas", en: "Pull-ups" },
    sets: 4,
    reps: "6-8",
    muscles: { es: "dorsal,bíceps", en: "lats,biceps" },
    sort_order: 0,
  })
  await create("program_exercises", {
    program: programId,
    phase_number: 1,
    day_id: "mon",
    exercise_id: "dips",
    exercise_name: { es: "Fondos", en: "Dips" },
    sets: 3,
    reps: "10",
    muscles: { es: "pecho,tríceps", en: "chest,triceps" },
    sort_order: 1,
  })
}

// ─── Lo que la ruta tiene que dejar pasar ────────────────────────────────────

test("un programa público se lee sin sesión, con sus contenidos", async () => {
  const owner = await createUser("Duena Publico Hook")
  await update("users", owner.id, { display_name: "Ana Pública" })
  const program = await makeProgram(owner, "public")
  await seedContent(program.id)

  const { status, body } = await fetchPublicPreview(program.id)

  assert.equal(status, 200, "un programa público debe abrirse sin sesión")
  assert.equal(body.id, program.id)
  assert.equal(body.duration_weeks, 8)
  assert.equal(body.visibility, "public")
  assert.equal(body.phase_count, 1, "debe contar las fases")
  assert.equal(body.exercise_count, 2, "debe contar TODOS los ejercicios")
  assert.equal(body.exercises.length, 2, "y mandar la vista previa")
  assert.equal(body.author_name, "Ana Pública", "el autor sale por display_name")
})

test("un programa `link` también, que es lo único que lo hace alcanzable", async () => {
  const owner = await createUser("Dueno Link Hook")
  const program = await makeProgram(owner, "link")

  const { status, body } = await fetchPublicPreview(program.id)

  assert.equal(status, 200, "`link` existe justamente para esta ruta")
  assert.equal(body.visibility, "link")
})

test("los campos i18n viajan como objeto {es,en}, no interpolados", async () => {
  const owner = await createUser("Duena I18n Hook")
  const program = await makeProgram(owner, "public")
  await seedContent(program.id)

  const { body } = await fetchPublicPreview(program.id)

  // En el JSVM, `record.get()` de un json devuelve bytes y `getString()` el JSON
  // en crudo: si el hook los tratara como texto, aquí llegaría "[object Object]"
  // o una cadena con comillas, y el `localize()` del cliente pintaría basura.
  assert.equal(typeof body.name, "object", "`name` debe llegar como objeto")
  assert.deepEqual(
    body.name, program.name,
    "el nombre debe llegar con las dos traducciones, tal como se guardó",
  )
  assert.equal(body.description.es, "Descripción en español")
  assert.equal(body.description.en, "Description in English")

  const pullups = body.exercises.find(ex => ex.name && ex.name.es === "Dominadas")
  assert.ok(pullups, "el ejercicio debe llegar con su nombre traducible")
  assert.equal(pullups.muscles.es, "dorsal,bíceps")
  assert.equal(pullups.reps, "6-8")
  assert.equal(pullups.sets, 4)

  assert.ok(
    !JSON.stringify(body).includes("[object Object]"),
    "nada puede haberse interpolado como texto",
  )
})

test("sin autor legible la ruta sigue respondiendo", async () => {
  // `created_by` vacío: programas sembrados por script, o cuyo autor se borró.
  const program = await create("programs", {
    name: { es: "Sin autor", en: "No author" },
    duration_weeks: 4,
    is_active: true,
    visibility: "public",
  })

  const { status, body } = await fetchPublicPreview(program.id)

  assert.equal(status, 200, "un programa sin autor sigue siendo compartible")
  assert.equal(body.author_name, "", "y el autor sale vacío, no revienta")
})

// ─── Lo que la ruta tiene que cerrar ─────────────────────────────────────────

test("un programa privado da 404, igual que uno inexistente", async () => {
  const owner = await createUser("Duena Privada Hook")
  const program = await makeProgram(owner, "private")

  // Positivo primero: el programa EXISTE y su dueña lo ve por la vía normal. Sin
  // esto, el 404 de abajo no distinguiría "la puerta funciona" de "la siembra
  // falló y no hay programa que buscar".
  assert.ok(
    await getOneAs(owner, "programs", program.id),
    "la dueña debe seguir viendo su programa privado por la API de colección",
  )

  const priv = await fetchPublicPreview(program.id)
  const ghost = await fetchPublicPreview("noexisteestepr")

  assert.equal(priv.status, 404, "un programa privado no se comparte")
  assert.equal(
    priv.status, ghost.status,
    "y responde IGUAL que un id inventado: distinguirlos filtraría qué ids existen",
  )
})

test("un programa sin `visibility` se trata como privado", async () => {
  // Es la fila que crea un cliente móvil viejo, que no manda el campo. La
  // dirección segura es la única aceptable: en la duda, no se publica.
  const program = await create("programs", {
    name: { es: "Cliente viejo", en: "Old client" },
    duration_weeks: 4,
    is_active: true,
  })

  const { status } = await fetchPublicPreview(program.id)
  assert.equal(status, 404, "el campo vacío no puede significar 'público'")
})

test("la respuesta no filtra el email del autor ni campos de más", async () => {
  const owner = await createUser("Duena Fuga Hook")
  const program = await makeProgram(owner, "public")

  const { body } = await fetchPublicPreview(program.id)

  const serialized = JSON.stringify(body)
  assert.ok(
    !serialized.includes(owner.email),
    "el email del autor está oculto por campo desde #411: no puede salir por aquí",
  )
  assert.ok(!serialized.includes("@hooks.test"), "ni ningún otro email")

  // Lista blanca literal: si mañana se añade un campo a `programs`, este test
  // falla en vez de dejar que se publique solo.
  const ALLOWED = [
    "id", "name", "description", "duration_weeks", "days_per_week",
    "goal_type", "intensity", "visibility", "author_name",
    "phase_count", "exercise_count", "exercises",
  ]
  assert.deepEqual(
    Object.keys(body).filter(k => !ALLOWED.includes(k)), [],
    "la ruta enumera sus campos a mano; nada nuevo se publica sin decidirlo",
  )
  assert.ok(!("created_by" in body), "el id del autor tampoco viaja")
})

test("la ruta NO ha relajado el viewRule: `link` sigue cerrado por la colección", async () => {
  const owner = await createUser("Dueno Regla Hook")
  const stranger = await createUser("Ajeno Regla Hook")
  const program = await makeProgram(owner, "link")

  // La ruta lo sirve...
  assert.equal((await fetchPublicPreview(program.id)).status, 200)

  // ...y la API de colección sigue sin servirlo a un tercero autenticado. #603
  // dejó `link` fuera de las reglas a propósito y eso no ha cambiado.
  assert.equal(
    await getOneAs(stranger, "programs", program.id), null,
    "un tercero no puede leer el registro completo de un programa `link`",
  )
})

test("la ruta anónima no acepta métodos de escritura", async () => {
  const owner = await createUser("Duena Metodo Hook")
  const program = await makeProgram(owner, "public")

  const res = await api(`/api/programs/${program.id}/public`, {
    method: "POST",
    body: { name: "hackeado" },
    raw: true,
    token: await authAs(owner),
  })

  assert.ok(res.status >= 400, "solo está registrado el GET")
})
