/**
 * Aviso al inscrito cuando su programa es eliminado (#633).
 *
 * Continúa #605: aquel hook cerraba las inscripciones de todos los apuntados,
 * pero en silencio. Al inscrito le desaparecía el «hoy toca» sin explicación.
 *
 * Va contra un PocketBase real porque es el único sitio donde se ve si el `save`
 * de la notificación pasa de verdad — y porque el hook falla EN SILENCIO por
 * diseño (no puede costarle al autor el borrado de su programa), así que un stub
 * del SDK habría pasado en verde con cero notificaciones creadas.
 *
 * Lo que se afirma aquí son FILAS de `notifications` después del borrado, no la
 * ausencia de errores en el log.
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

/**
 * Programa creado por `author` con el nombre como campo i18n de verdad.
 *
 * `programs.name` es `json {es, en}` desde `1774378015_i18n_program_fields.js`.
 * El nombre va como OBJETO justo para que el test note si el hook lo aplasta a
 * string por el camino.
 */
async function makeProgram(author, name) {
  return createAs(author, "programs", {
    name,
    description: { es: "programa de prueba de #633", en: "test program for #633" },
    duration_weeks: 4,
    is_active: true,
    created_by: author.id,
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

/** Notificaciones `program_deleted` de un usuario, leídas como superuser. */
async function deletionNotifs(userId) {
  return list("notifications", `user = "${userId}" && type = "program_deleted"`)
}

test("cada inscrito recibe un aviso cuando el autor borra el programa", async () => {
  const author = await createUser("Autor Avisa")
  const uno = await createUser("Inscrito Uno")
  const dos = await createUser("Inscrito Dos")

  const nombre = { es: uniq("Fuerza"), en: uniq("Strength") }
  const program = await makeProgram(author, nombre)
  await enroll(uno, program.id)
  await enroll(dos, program.id)

  await removeAs(author, "programs", program.id)

  for (const inscrito of [uno, dos]) {
    const notifs = await deletionNotifs(inscrito.id)
    assert.equal(notifs.length, 1, `${inscrito.id} recibe exactamente un aviso`)

    const n = notifs[0]
    assert.equal(n.type, "program_deleted")
    assert.equal(n.user, inscrito.id, "el destinatario es el inscrito")
    assert.equal(n.read, false, "llega sin leer")
    assert.equal(n.reference_id, program.id, "deja el rastro del programa borrado")
    assert.equal(n.reference_type, "program")
    // actor = el propio destinatario: es un aviso del sistema sobre sus datos, no
    // contenido social del autor. Además evita enseñarle quién es el autor a
    // quien lo tenga bloqueado, y no depende de `created_by` (que es opcional).
    assert.equal(n.actor, inscrito.id, "el aviso es del sistema, no del autor")
  }
})

test("el nombre del programa llega como el objeto i18n, no como «[object Object]»", async () => {
  // El fallo que este test existe para atrapar: concatenar un campo `json {es,en}`
  // en una plantilla de string (#602) mete literalmente «[object Object]» y
  // encima escribe un string plano donde tocaba un objeto, así que `localize()`
  // del cliente tampoco lo recupera. El nombre tiene que viajar entero: el
  // servidor no sabe en qué idioma tiene la app el destinatario.
  const author = await createUser("Autor i18n")
  const inscrito = await createUser("Inscrito i18n")

  const nombre = { es: uniq("Rutina"), en: uniq("Routine") }
  const program = await makeProgram(author, nombre)
  await enroll(inscrito, program.id)

  await removeAs(author, "programs", program.id)

  const [n] = await deletionNotifs(inscrito.id)
  assert.ok(n, "hay aviso")

  const data = typeof n.data === "string" ? JSON.parse(n.data) : n.data
  assert.equal(
    typeof data.programName,
    "object",
    `programName debe seguir siendo el mapa i18n, llegó: ${JSON.stringify(data.programName)}`,
  )
  assert.equal(data.programName.es, nombre.es, "conserva el español")
  assert.equal(data.programName.en, nombre.en, "conserva el inglés")
  assert.ok(
    !JSON.stringify(data).includes("[object Object]"),
    "en ninguna parte del payload aparece [object Object]",
  )
})

test("un nombre de programa anterior a la migración i18n sobrevive como string", async () => {
  // Las filas creadas antes de `1774378015_i18n_program_fields.js` tienen el
  // nombre como string pelado en la columna json, y siguen ahí en producción.
  // `localize()` trata las dos formas, así que el hook debe pasarlo tal cual en
  // vez de tragarse la notificación entera.
  const author = await createUser("Autor Legado")
  const inscrito = await createUser("Inscrito Legado")

  const nombre = uniq("Programa Viejo")
  const program = await makeProgram(author, nombre)
  await enroll(inscrito, program.id)

  await removeAs(author, "programs", program.id)

  const [n] = await deletionNotifs(inscrito.id)
  assert.ok(n, "un nombre legado no impide el aviso")

  const data = typeof n.data === "string" ? JSON.parse(n.data) : n.data
  assert.equal(data.programName, nombre, "el string llega intacto")
})

test("el autor no se avisa a sí mismo, y los ajenos no se enteran", async () => {
  const author = await createUser("Autor Inscrito")
  const inscrito = await createUser("Inscrito Ajeno")

  const program = await makeProgram(author, { es: uniq("Propio"), en: uniq("Own") })
  // El autor también sigue su propio programa: el caso que produciría el aviso
  // absurdo («han borrado tu programa» a quien acaba de borrarlo).
  await enroll(author, program.id)
  await enroll(inscrito, program.id)

  // Control: un tercero con su propia inscripción en OTRO programa, que no debe
  // recibir nada — el hook solo toca las filas del programa borrado.
  const tercero = await createUser("Tercero Intacto")
  const otro = await makeProgram(tercero, { es: uniq("Otro"), en: uniq("Other") })
  await enroll(tercero, otro.id)

  await removeAs(author, "programs", program.id)

  assert.equal((await deletionNotifs(inscrito.id)).length, 1, "el inscrito sí recibe aviso")
  assert.equal((await deletionNotifs(author.id)).length, 0, "el autor no se avisa a sí mismo")
  assert.equal((await deletionNotifs(tercero.id)).length, 0, "el tercero sigue sin enterarse")
})

test("borrar un programa sin inscritos no genera avisos", async () => {
  const author = await createUser("Autor Vacío")
  const program = await makeProgram(author, { es: uniq("Vacío"), en: uniq("Empty") })

  await removeAs(author, "programs", program.id)

  const all = await list("notifications", `type = "program_deleted" && reference_id = "${program.id}"`)
  assert.equal(all.length, 0, "sin inscripciones no hay a quién avisar")
})
