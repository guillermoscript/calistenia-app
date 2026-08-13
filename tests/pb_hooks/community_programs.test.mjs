/**
 * Reglas de acceso de los programas de comunidad (#353).
 *
 * Van contra un PocketBase real con las migraciones del repo, así que lo que se
 * comprueba es la regla del SERVIDOR, no la convención del cliente. Es la
 * distinción que importa aquí: la app nunca pedirá la membresía de otra
 * persona, pero eso no es motivo para que el servidor la sirva.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  api, authAs, create, createAs, createUser, getOneAs, list, listAs, remove, uniq,
} from "./helpers/client.mjs"

/** PATCH autenticado como `user` (pasa por las API rules). */
async function updateAs(user, collection, id, data) {
  return api(`/api/collections/${collection}/records/${id}`, {
    method: "PATCH",
    body: data,
    token: await authAs(user),
  })
}

/** Programa creado como superuser (crear es cosa de admin/editor). */
async function makeProgram({ published = true, durationDays = 30 } = {}) {
  const slug = uniq("prog")
  return create("community_programs", {
    slug,
    title_key: `communityProgram.${slug}.title`,
    description_key: `communityProgram.${slug}.description`,
    duration_days: durationDays,
    difficulty: "beginner",
    is_published: published,
    sort_order: 0,
  })
}

// ─── Contenido curado ────────────────────────────────────────────────────────

test("la semilla «30 días de calistenia» existe con sus cuatro hitos semanales", async () => {
  const reader = await createUser("Lector Semilla")

  const [seed] = await listAs(reader, "community_programs", 'slug = "30_dias_calistenia"')
  assert.ok(seed, "la migración debe dejar el programa inicial publicado")
  assert.equal(seed.duration_days, 30)
  assert.equal(seed.title_key, "communityProgram.30dias.title")

  const milestones = await listAs(reader, "community_program_milestones", `program = "${seed.id}"`)
  assert.equal(milestones.length, 4, "cuatro hitos semanales")
  assert.deepEqual(milestones.map(m => m.week).sort(), [1, 2, 3, 4])
  for (const m of milestones) {
    assert.equal(m.target, 3, "3 entrenos por semana = 12 en total")
    assert.equal(m.kind, "workout_count")
  }
})

test("un programa sin publicar no es visible para un usuario normal", async () => {
  const reader = await createUser("Lector Borrador")
  const draft = await makeProgram({ published: false })

  const listed = await listAs(reader, "community_programs", `slug = "${draft.slug}"`)
  assert.equal(listed.length, 0, "no debe aparecer en el listado")

  // `getOneAs` devuelve null cuando la regla oculta el registro (PB responde
  // 404 para no filtrar que existe).
  assert.equal(await getOneAs(reader, "community_programs", draft.id), null, "tampoco debe poder abrirse por id")
})

test("los hitos de un programa sin publicar tampoco se filtran", async () => {
  const reader = await createUser("Lector Hitos")
  const draft = await makeProgram({ published: false })
  await create("community_program_milestones", {
    program: draft.id, week: 1, title_key: "x.title", kind: "workout_count", target: 3,
  })

  const listed = await listAs(reader, "community_program_milestones", `program = "${draft.id}"`)
  assert.equal(listed.length, 0, "los hitos siguen la visibilidad de su programa")
})

test("un usuario normal no puede crear ni modificar contenido de programas", async () => {
  const intruder = await createUser("Intruso Contenido")
  const program = await makeProgram()

  await assert.rejects(
    () => createAs(intruder, "community_programs", {
      slug: uniq("pirata"), title_key: "a", description_key: "b",
      duration_days: 7, difficulty: "beginner", is_published: true,
    }),
    (err) => err.status === 400 || err.status === 403,
    "crear programas es solo de admin/editor",
  )

  await assert.rejects(
    () => updateAs(intruder, "community_programs", program.id, { title_key: "secuestrado" }),
    (err) => err.status === 400 || err.status === 403 || err.status === 404,
    "editar programas es solo de admin/editor",
  )
})

// ─── Pertenencia ─────────────────────────────────────────────────────────────

test("un usuario se apunta a sí mismo y no puede apuntar a otro", async () => {
  const member = await createUser("Miembro Propio")
  const other = await createUser("Miembro Ajeno")
  const program = await makeProgram()

  const row = await createAs(member, "community_program_members", {
    program: program.id, user: member.id, started_at: "2026-08-13", status: "active",
  })
  assert.equal(row.user, member.id)

  await assert.rejects(
    () => createAs(member, "community_program_members", {
      program: program.id, user: other.id, started_at: "2026-08-13", status: "active",
    }),
    (err) => err.status === 400 || err.status === 403,
    "no se puede crear la membresía de otra cuenta",
  )
})

test("el índice único impide dos membresías para el mismo programa (doble toque / dos dispositivos)", async () => {
  const member = await createUser("Miembro Doble")
  const program = await makeProgram()
  const payload = { program: program.id, user: member.id, started_at: "2026-08-13", status: "active" }

  await createAs(member, "community_program_members", payload)
  await assert.rejects(
    () => createAs(member, "community_program_members", payload),
    (err) => err.status === 400,
    "la segunda unión debe rebotar contra el índice único",
  )

  // Y sigue habiendo exactamente una fila: es lo que convierte el error en una
  // unión idempotente del lado del cliente.
  const rows = await list("community_program_members", `program = "${program.id}" && user = "${member.id}"`)
  assert.equal(rows.length, 1)
})

test("la membresía es privada: otra cuenta autenticada no la ve", async () => {
  const member = await createUser("Miembro Privado")
  const snooper = await createUser("Curioso Membresia")
  const program = await makeProgram()

  const row = await createAs(member, "community_program_members", {
    program: program.id, user: member.id, started_at: "2026-08-13", status: "active",
  })

  const listed = await listAs(snooper, "community_program_members", `program = "${program.id}"`)
  assert.equal(listed.length, 0, "sin lectura cruzada entre miembros")

  assert.equal(await getOneAs(snooper, "community_program_members", row.id), null, "ni abriéndola por id")
})

test("abandonar y volver reanuda: solo cambia el estado, nunca el día de inicio", async () => {
  const member = await createUser("Miembro Reanuda")
  const program = await makeProgram()

  const row = await createAs(member, "community_program_members", {
    program: program.id, user: member.id, started_at: "2026-08-01", status: "active",
  })

  // Abandonar.
  const left = await updateAs(member, "community_program_members", row.id, {
    status: "left", left_at: "2026-08-05 10:00:00.000Z",
  })
  assert.equal(left.status, "left")
  assert.ok(left.started_at.startsWith("2026-08-01"), "el día de inicio sobrevive al abandono")

  // Volver: la misma fila se reactiva y `left_at` se limpia — una fila activa
  // con fecha de abandono se contradice a sí misma y engaña a quien la lea.
  const back = await updateAs(member, "community_program_members", row.id, { status: "active", left_at: null })
  assert.equal(back.status, "active")
  assert.ok(!back.left_at, "al reactivar, left_at queda vacío")
  assert.ok(back.started_at.startsWith("2026-08-01"), "al volver se reanuda, no se reinicia")

  // Mover el inicio queda prohibido por la regla: si no, cualquiera podría
  // desplazar su ventana de puntuación y falsear el progreso.
  await assert.rejects(
    () => updateAs(member, "community_program_members", row.id, { started_at: "2026-09-01" }),
    (err) => err.status === 400 || err.status === 403 || err.status === 404,
    "started_at no es editable por el miembro",
  )
})

test("nadie puede modificar la membresía de otra cuenta", async () => {
  const member = await createUser("Miembro Objetivo")
  const intruder = await createUser("Intruso Membresia")
  const program = await makeProgram()

  const row = await createAs(member, "community_program_members", {
    program: program.id, user: member.id, started_at: "2026-08-01", status: "active",
  })

  await assert.rejects(
    () => updateAs(intruder, "community_program_members", row.id, { status: "left" }),
    (err) => err.status === 400 || err.status === 403 || err.status === 404,
  )
})

test("borrar el programa arrastra hitos y membresías (cascadeDelete)", async () => {
  const member = await createUser("Miembro Cascada")
  const program = await makeProgram()
  await create("community_program_milestones", {
    program: program.id, week: 1, title_key: "x.title", kind: "workout_count", target: 3,
  })
  await createAs(member, "community_program_members", {
    program: program.id, user: member.id, started_at: "2026-08-01", status: "active",
  })

  await remove("community_programs", program.id)

  assert.equal((await list("community_program_milestones", `program = "${program.id}"`)).length, 0)
  assert.equal((await list("community_program_members", `program = "${program.id}"`)).length, 0)
})
