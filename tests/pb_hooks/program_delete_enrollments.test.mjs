/**
 * Borrado de un programa con gente inscrita (#605).
 *
 * Va contra un PocketBase real con las migraciones y los hooks del repo, que es
 * la única forma de comprobar esto. Los dos fallos que cubre son de servidor y
 * un stub del SDK los habría pasado en verde:
 *
 *   1. `user_programs.program` era una relación `required` sin cascade, así que
 *      PocketBase RECHAZABA el borrado del programa (400) en cuanto había una
 *      inscripción que el autor no podía borrar (el `deleteRule` solo le deja
 *      las suyas). Lo arregla `1784900000_user_programs_program_optional.js`.
 *   2. Las inscripciones supervivientes se quedaban con `is_current = true`
 *      apuntando a un programa que ya no existe. Lo arregla
 *      `pb_hooks/programs_delete_cleanup.pb.js`.
 *
 * El hook falla EN SILENCIO por diseño —no puede costarle al autor el borrado de
 * su programa—, así que lo que se afirma aquí son los VALORES de la tabla
 * después del borrado, no la ausencia de errores.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { api, authAs, createAs, createUser, list, uniq } from "./helpers/client.mjs"

/** DELETE autenticado como `user` (pasa por las API rules, como la app). */
async function removeAs(user, collection, id) {
  return api(`/api/collections/${collection}/records/${id}`, {
    method: "DELETE",
    token: await authAs(user),
  })
}

/** GET de un registro como `user`, con los parámetros de query que se le pasen. */
async function getOneAsWith(user, collection, id, query) {
  return api(`/api/collections/${collection}/records/${id}?${query}`, {
    token: await authAs(user),
  })
}

/** Programa creado por `author` (el `createRule` exige `created_by = auth.id`). */
async function makeProgram(author) {
  return createAs(author, "programs", {
    name: uniq("Programa"),
    description: "programa de prueba de #605",
    duration_weeks: 4,
    is_active: true,
    created_by: author.id,
    // Público a propósito: desde #603 `programs.viewRule` filtra por
    // `visibility`, y en un programa sin él (el editor crea `private`) nadie
    // más que el autor puede inscribirse. Un programa con inscritos ajenos es,
    // por construcción, uno que los demás podían ver.
    visibility: "public",
  })
}

/** Inscripción activa de `user` en `program`, creada por el propio usuario. */
async function enroll(user, programId) {
  return createAs(user, "user_programs", {
    user: user.id,
    program: programId,
    started_at: "2026-08-01 08:00:00",
    is_current: true,
    status: "active",
  })
}

/** Una fila de `user_programs` por id, leída como superuser. */
async function enrollmentById(id) {
  const [row] = await list("user_programs", `id = "${id}"`)
  return row
}

test("un programa con inscripciones de OTROS usuarios se puede borrar", async () => {
  // Antes de #605 esto devolvía 400 «record is not part of a required relation
  // reference» y el autor se quedaba con un programa que ya había perdido sus
  // ejercicios (el cliente los borra primero): el programa fantasma de la app.
  const author = await createUser("Autor Borrable")
  const otro = await createUser("Inscrito Ajeno")

  const program = await makeProgram(author)
  await enroll(otro, program.id)

  await removeAs(author, "programs", program.id)

  const gone = await api(`/api/collections/programs/records/${program.id}`, {
    token: await authAs(author),
    raw: true,
  })
  assert.equal(gone.status, 404, "el programa se borró de verdad")
})

test("borrar un programa cierra las inscripciones de TODOS los inscritos", async () => {
  const author = await createUser("Autor Programa")
  const otro = await createUser("Otro Inscrito")

  const program = await makeProgram(author)
  const enrollAuthor = await enroll(author, program.id)
  const enrollOtro = await enroll(otro, program.id)

  // Control: un tercer usuario inscrito en OTRO programa, que no debe tocarse.
  const tercero = await createUser("Tercero Ajeno")
  const otherProgram = await makeProgram(tercero)
  const enrollTercero = await enroll(tercero, otherProgram.id)

  // El autor borra su programa, exactamente como lo hace la app.
  await removeAs(author, "programs", program.id)

  for (const id of [enrollAuthor.id, enrollOtro.id]) {
    const row = await enrollmentById(id)
    assert.ok(row, `la inscripción ${id} sigue existiendo: es historial del usuario`)
    assert.equal(row.status, "abandoned", "status pasa a abandoned")
    assert.equal(row.is_current, false, "deja de ser el programa activo")
    assert.notEqual(row.ended_at, "", "ended_at queda sellado con la fecha de cierre")
    assert.equal(row.program, "", "PocketBase vacía la relación al borrar el programa")
  }

  // La inscripción del tercero, en otro programa, intacta: el hook solo toca las
  // filas del programa borrado, no barre la tabla entera.
  const rowTercero = await enrollmentById(enrollTercero.id)
  assert.equal(rowTercero.status, "active")
  assert.equal(rowTercero.is_current, true)
  assert.equal(rowTercero.program, otherProgram.id)
})

test("una inscripción viva expande su programa para quien no es el autor", async () => {
  // Es la suposición sobre la que se apoya la guarda del cliente
  // (`fetchActiveEnrollment`, y ya antes `useRoutineView`/`usePublicProfile`):
  // un expand vacío significa «programa borrado», no «no tengo permiso».
  // Desde #603 esa equivalencia solo se sostiene mientras el programa siga
  // siendo `visibility = "public"` (1785000000_programs_visibility.js:82): si
  // el autor lo pasa a `private`, el inscrito recibe el mismo expand vacío y el
  // cliente le dirá «programa borrado». Queda anotado en la familia de #604.
  const author = await createUser("Autor Expand")
  const inscrito = await createUser("Inscrito Expand")

  const program = await makeProgram(author)
  const enrollment = await enroll(inscrito, program.id)

  const alive = await getOneAsWith(inscrito, "user_programs", enrollment.id, "expand=program")
  assert.equal(alive.expand?.program?.id, program.id, "el expand funciona para un no-autor")

  await removeAs(author, "programs", program.id)

  const closed = await getOneAsWith(inscrito, "user_programs", enrollment.id, "expand=program")
  assert.equal(closed.expand?.program, undefined, "sin programa no hay nada que expandir")
  assert.equal(closed.is_current, false, "y el cliente ya no la ve como activa")
})

test("borrar un programa sin inscritos sigue funcionando", async () => {
  const author = await createUser("Autor Sin Inscritos")
  const program = await makeProgram(author)

  await removeAs(author, "programs", program.id)

  const gone = await api(`/api/collections/programs/records/${program.id}`, {
    token: await authAs(author),
    raw: true,
  })
  assert.equal(gone.status, 404)
})
