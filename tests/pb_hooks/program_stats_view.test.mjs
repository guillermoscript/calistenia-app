/**
 * `programs.forked_from` y la view `view_program_stats` (#620).
 *
 * Van contra un PocketBase real con las migraciones del repo. Es la única forma
 * de probar una migración: un test con stub del cliente pasaría en verde sin
 * que el campo ni la view existan, que es justo el fallo que no queremos poder
 * tener.
 *
 * Dos comportamientos del servidor que aquí se fijan y que no se pueden
 * observar desde el cliente:
 *
 * - `forked_from` es una relación SIN cascade y opcional. Las tres colecciones
 *   hijas de `programs` sí cascadean —sin su programa no significan nada—, pero
 *   una copia es un programa entero con su propia gente inscrita: borrar el
 *   original tiene que dejarla VIVA y sin acreditar a nadie. Si alguien le
 *   pusiera `cascadeDelete: true`, borrar un programa popular se llevaría por
 *   delante todas sus copias.
 *
 * - Una regla de lectura que no casa devuelve 0 FILAS SIN ERROR. Por eso cada
 *   caso negativo va emparejado con su positivo: primero se afirma que la fila
 *   existe y que su dueño la ve, y solo entonces que el ajeno no. Un «0 filas» a
 *   secas no distingue «la regla funciona» de «la view está rota».
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  api, create, createAs, createUser, getOne, listAs, remove, uniq,
} from "./helpers/client.mjs"

/** Programa creado POR SU AUTOR: así pasa por el createRule y `created_by` queda real. */
async function makeProgram(owner, visibility, extra = {}) {
  const name = uniq("Programa")
  return createAs(owner, "programs", {
    name: { es: name, en: name },
    description: { es: "desc", en: "desc" },
    duration_weeks: 4,
    is_active: true,
    visibility,
    created_by: owner.id,
    ...extra,
  })
}

/** Inscribe a `user` en `program`. Como superuser: el createRule no es lo que se prueba. */
function enroll(user, program, status) {
  return create("user_programs", {
    user: user.id, program: program.id, status, is_current: status === "active",
  })
}

/** La fila de la view para `program`, leída por `user` (pasa por el listRule). */
async function statsFor(user, program) {
  const rows = await listAs(user, "view_program_stats", `id = '${program.id}'`)
  return rows[0] ?? null
}

test("forked_from guarda el origen y sobrevive al borrado del original", async () => {
  const autor = await createUser("autor-remix")
  const copion = await createUser("copion-remix")

  const original = await makeProgram(autor, "public")
  const copia = await makeProgram(copion, "private", { forked_from: original.id })

  // Positivo primero: el campo existe y aceptó la relación.
  assert.equal(
    (await getOne("programs", copia.id)).forked_from,
    original.id,
    "forked_from no guardó el id del original — ¿falta la migración?",
  )

  await remove("programs", original.id)

  // Y ahora lo que de verdad importa: la copia sigue viva, solo que ya no
  // acredita a nadie. PocketBase vacía la relación al no ser cascade.
  const despues = await getOne("programs", copia.id)
  assert.ok(despues, "borrar el original se llevó la copia por delante (¿cascadeDelete?)")
  assert.ok(
    !despues.forked_from,
    `forked_from debería quedar vacío tras borrar el original, quedó ${JSON.stringify(despues.forked_from)}`,
  )
})

test("view_program_stats cuenta activos, completados y seguidores", async () => {
  const autor = await createUser("autor-stats")
  const programa = await makeProgram(autor, "public")

  const a = await createUser("sigue-a")
  const b = await createUser("sigue-b")
  const c = await createUser("sigue-c")
  const d = await createUser("sigue-d")

  await enroll(a, programa, "active")
  await enroll(b, programa, "active")
  await enroll(c, programa, "completed")
  // Abandonado NO cuenta como seguidor: se apuntó y lo dejó.
  await enroll(d, programa, "abandoned")

  const stats = await statsFor(autor, programa)
  assert.ok(stats, "la view no devolvió la fila del programa — ¿falta la migración?")
  assert.equal(stats.active_count, 2)
  assert.equal(stats.completed_count, 1)
  assert.equal(stats.followers_count, 3, "seguidores = activos + completados, sin los abandonados")
})

test("una inscripción legacy sin status cuenta como activa", async () => {
  // `status` llegó en 1774378016; las filas anteriores lo tienen vacío. Si no se
  // contaran, los programas más antiguos —los que más gente tienen— saldrían con
  // menos seguidores que uno recién creado.
  const autor = await createUser("autor-legacy")
  const programa = await makeProgram(autor, "public")
  const viejo = await createUser("inscrito-legacy")

  await create("user_programs", { user: viejo.id, program: programa.id, is_current: true })

  const stats = await statsFor(autor, programa)
  assert.equal(stats.active_count, 1, "la fila sin status quedó fuera del conteo de activos")
  assert.equal(stats.followers_count, 1)
})

test("la view no publica los conteos de un programa privado ajeno", async () => {
  const autor = await createUser("autor-privado")
  const ajeno = await createUser("ajeno-privado")
  const programa = await makeProgram(autor, "private")
  await enroll(await createUser("sigue-privado"), programa, "active")

  // Positivo: la fila existe y su dueño la ve. Sin esto, el assert de abajo
  // pasaría igual con la view rota y devolviendo siempre vacío.
  const propio = await statsFor(autor, programa)
  assert.ok(propio, "el dueño no ve sus propios conteos")
  assert.equal(propio.followers_count, 1)

  // Negativo: para un tercero no hay fila. No es un 403 — son 0 filas.
  assert.equal(
    await statsFor(ajeno, programa),
    null,
    "un tercero puede leer cuánta gente sigue un programa PRIVADO ajeno",
  )
})

test("los conteos de un programa público sí son de todos", async () => {
  const autor = await createUser("autor-publico")
  const ajeno = await createUser("ajeno-publico")
  const programa = await makeProgram(autor, "public")
  await enroll(await createUser("sigue-publico"), programa, "active")

  const stats = await statsFor(ajeno, programa)
  assert.ok(stats, "un programa público no publica sus conteos: el catálogo no puede ordenar por seguidores")
  assert.equal(stats.followers_count, 1)
})

test("sin token no se ve nada de la view", async () => {
  // La regla arranca con `@request.auth.id != ""`. El catálogo tampoco responde
  // sin sesión, así que aquí no se pierde nada y no se filtran conteos a un
  // scraper anónimo.
  const autor = await createUser("autor-anon")
  const programa = await makeProgram(autor, "public")
  await enroll(await createUser("sigue-anon"), programa, "active")

  assert.ok(await statsFor(autor, programa), "el dueño con sesión debería ver la fila")

  // Sin `token`: la petición sale anónima, como la de un scraper.
  const anon = await api(
    `/api/collections/view_program_stats/records?filter=${encodeURIComponent(`id = '${programa.id}'`)}`,
  )
  assert.equal(anon.items.length, 0, "la view respondió a una petición sin token")
})
