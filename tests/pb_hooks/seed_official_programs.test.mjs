/**
 * La migración que siembra los 15 programas oficiales (#615).
 *
 * Va contra un PocketBase real, levantado por `run.mjs` con las migraciones del
 * repo aplicadas de verdad. Es la única forma honesta de probar esto: un test
 * con `pb` stubbeado comprueba lo que el test cree que hace la migración, no lo
 * que PocketBase acepta. La migración se genera desde `programs/*.json` con
 * `scripts/generate-program-seed-migration.mjs`, y hasta ahora este contenido
 * solo entraba corriendo scripts a mano con credenciales de superusuario.
 *
 * Lo que se afirma aquí es la cadena completa: que los 15 programas existen, que
 * traen los metadatos que alimentan el «PARA TI» del onboarding, que cada fase
 * tiene la semana entera (incluidos los descansos), que los ejercicios hablan el
 * vocabulario de la app —y no el del JSON— y que un usuario cualquiera los ve.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { api, createUser, listAs, superToken } from "./helpers/client.mjs"

/** Los 15 nombres del catálogo curado, en `name.es`. */
const CATALOG = [
  "Principiante · Quema Grasa",
  "Principiante · Ganar Músculo",
  "Principiante · Fundamentos",
  "Intermedio · Definición",
  "Intermedio · Hipertrofia",
  "Avanzado · Cutting Élite",
  "Avanzado · Volumen Máximo",
  "Avanzado · Fuerza Total",
  "Pull-up Roadmap",
  "Handstand Roadmap",
  "Muscle-up Roadmap",
  "Planche Roadmap",
  "Mujer · Glúteo + Tonificación",
  "Mujer · Full Body Toning",
  "Mujer · Fuerza Funcional",
]

const DAY_IDS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"]

/** Vocabulario que la app sabe pintar (`PRIORITY_COLORS`, #607). */
const PRIORITIES = ["high", "med", "low"]
const SECTIONS = ["warmup", "main", "cooldown"]

/**
 * Página completa como superusuario. El `list()` del helper tiene `perPage=200`
 * fijo y aquí se cuentan miles de ejercicios: truncar en silencio haría que un
 * seed a medias pasara el test.
 */
async function listAll(collection, filter) {
  const token = await superToken()
  let page = 1
  let items = []
  for (;;) {
    const qs = new URLSearchParams({ perPage: "500", page: String(page) })
    if (filter) qs.set("filter", filter)
    const res = await api(`/api/collections/${collection}/records?${qs}`, { token })
    items = items.concat(res.items)
    if (items.length >= res.totalItems || res.items.length === 0) return items
    page++
  }
}

const esName = (rec) => (typeof rec.name === "object" ? rec.name?.es : rec.name) || ""

async function programByName(name) {
  const [found] = await listAll("programs", `name.es = ${JSON.stringify(name)}`)
  return found
}

// ─── Catálogo ────────────────────────────────────────────────────────────────

test("la migración siembra los 15 programas del catálogo, uno por nombre", async () => {
  const programs = await listAll("programs")
  const names = programs.map(esName)

  for (const expected of CATALOG) {
    const matches = names.filter(n => n === expected)
    assert.equal(matches.length, 1, `«${expected}» debe existir exactamente una vez, hay ${matches.length}`)
  }
})

test("cada programa sembrado trae los metadatos que usa el matching del onboarding", async () => {
  // Sin `goal_type` ni `days_per_week` un programa nunca entra en el «PARA TI»
  // (`packages/core/lib/matchPrograms.ts`), que es justo el agujero que dejaba
  // sembrar solo el contenido y no el catálogo.
  for (const name of CATALOG) {
    const program = await programByName(name)
    assert.ok(program, `falta «${name}»`)

    assert.ok(["beginner", "intermediate", "advanced"].includes(program.difficulty), `difficulty de «${name}»`)
    assert.ok(program.goal_type, `goal_type de «${name}» está vacío`)
    assert.ok(program.intensity, `intensity de «${name}» está vacío`)
    assert.ok(program.days_per_week >= 1, `days_per_week de «${name}» es ${program.days_per_week}`)
    assert.ok(program.duration_weeks >= 1, `duration_weeks de «${name}»`)
    assert.equal(program.is_official, true, `«${name}» debe ser oficial`)
    assert.equal(program.visibility, "public", `«${name}» debe ser público (#603)`)
    assert.equal(program.is_active, true, `«${name}» debe estar activo`)

    // `skill` solo significa algo en las rutas de habilidad.
    if (program.goal_type === "skill") {
      assert.ok(program.skill, `«${name}» es de tipo skill y no dice cuál`)
    } else {
      assert.ok(!program.skill, `«${name}» no es de tipo skill pero trae skill="${program.skill}"`)
    }
  }
})

test("los nombres y descripciones van en los dos idiomas", async () => {
  for (const name of CATALOG) {
    const program = await programByName(name)
    assert.equal(typeof program.name, "object", `name de «${name}» debe ser json i18n`)
    assert.ok(program.name.es, `name.es de «${name}»`)
    assert.ok(program.name.en, `name.en de «${name}»`)
    assert.ok(program.description.es, `description.es de «${name}»`)
    assert.ok(program.description.en, `description.en de «${name}»`)
  }
})

// ─── Estructura ──────────────────────────────────────────────────────────────

test("cada fase sembrada tiene la semana COMPLETA, con los descansos explícitos", async () => {
  // Un día que falta no se pinta como descanso: se pinta como un hueco. Por eso
  // el generador rellena los siete días aunque el JSON solo defina los que se
  // entrenan.
  for (const name of CATALOG) {
    const program = await programByName(name)
    const phases = await listAll("program_phases", `program = "${program.id}"`)
    assert.ok(phases.length >= 1, `«${name}» sin fases`)

    const configs = await listAll("program_day_config", `program = "${program.id}"`)
    assert.equal(
      configs.length,
      phases.length * 7,
      `«${name}»: ${phases.length} fases deberían dar ${phases.length * 7} días, hay ${configs.length}`,
    )

    for (const phase of phases) {
      const ofPhase = configs.filter(c => c.phase_number === phase.phase_number)
      assert.deepEqual(
        ofPhase.sort((a, b) => a.sort_order - b.sort_order).map(c => c.day_id),
        DAY_IDS,
        `«${name}» fase ${phase.phase_number}: los siete días en orden`,
      )
      for (const cfg of ofPhase) {
        assert.ok(cfg.day_name?.es, `día ${cfg.day_id} de «${name}» sin nombre`)
        assert.ok(cfg.day_focus?.es, `día ${cfg.day_id} de «${name}» sin foco`)
        assert.ok(cfg.day_type, `día ${cfg.day_id} de «${name}» sin tipo`)
      }
    }
  }
})

test("un programa concreto llega entero: Principiante · Fundamentos", async () => {
  const program = await programByName("Principiante · Fundamentos")
  assert.equal(program.duration_weeks, 8)
  assert.equal(program.days_per_week, 3)

  const phases = await listAll("program_phases", `program = "${program.id}"`)
  assert.equal(phases.length, 2)
  assert.deepEqual(phases.map(p => p.phase_number).sort(), [1, 2])
  assert.deepEqual(phases.sort((a, b) => a.phase_number - b.phase_number).map(p => p.weeks), ["1-4", "5-8"])

  const exercises = await listAll("program_exercises", `program = "${program.id}"`)
  assert.ok(exercises.length > 0, "sin ejercicios")

  // 3 días/semana: los entrenables son lun/mie/vie y el resto son descanso.
  const trainedDays = [...new Set(exercises.map(e => e.day_id))].sort()
  assert.deepEqual(trainedDays, ["lun", "mie", "vie"])

  const configs = await listAll("program_day_config", `program = "${program.id}"`)
  const rest = configs.filter(c => !trainedDays.includes(c.day_id))
  assert.equal(rest.length, 8, "dos fases × cuatro días de descanso")
  for (const cfg of rest) {
    assert.equal(cfg.day_type, "rest", `${cfg.day_id} debería ser descanso`)
  }
})

// ─── Vocabulario ─────────────────────────────────────────────────────────────

test("los ejercicios sembrados hablan el vocabulario de la app, no el del JSON", async () => {
  // El JSON usa `primary|secondary|accessory` y mete `warmup`/`cooldown` en el
  // mismo campo. Copiarlo crudo es lo que dejó el 99 % de las filas fuera de
  // `PRIORITY_COLORS` (#607); el generador lo traduce antes de emitir.
  const programs = await listAll("programs")
  const seeded = new Set(programs.filter(p => CATALOG.includes(esName(p))).map(p => p.id))

  const exercises = (await listAll("program_exercises")).filter(e => seeded.has(e.program))
  assert.ok(exercises.length > 1000, `esperaba miles de ejercicios, hay ${exercises.length}`)

  for (const ex of exercises) {
    assert.ok(PRIORITIES.includes(ex.priority), `priority "${ex.priority}" fuera del enum (${ex.exercise_id})`)
    assert.ok(SECTIONS.includes(ex.section), `section "${ex.section}" fuera del enum (${ex.exercise_id})`)
    assert.ok(DAY_IDS.includes(ex.day_id), `day_id "${ex.day_id}" fuera de lun..dom (#575) (${ex.exercise_id})`)
    assert.ok(ex.exercise_name?.es, `ejercicio sin nombre (${ex.exercise_id})`)
  }
})

test("ningún día sembrado conserva el day_id legacy d1..d6 (#575)", async () => {
  const programs = await listAll("programs")
  const seeded = new Set(programs.filter(p => CATALOG.includes(esName(p))).map(p => p.id))

  const configs = (await listAll("program_day_config")).filter(c => seeded.has(c.program))
  const legacy = configs.filter(c => !DAY_IDS.includes(c.day_id))
  assert.deepEqual(legacy.map(c => c.day_id), [], "buildWeekDays descarta en silencio los ids que no conoce")
})

// ─── Lectura ─────────────────────────────────────────────────────────────────

test("un usuario cualquiera ve el catálogo sembrado", async () => {
  // Sembrar sin que se vea no sirve de nada: los programas van sin `created_by`,
  // así que quien los lee lo hace por `visibility = public` (#603).
  const reader = await createUser("Lector Catálogo")
  const visible = (await listAs(reader, "programs", 'is_official = true')).map(esName)

  for (const name of CATALOG) {
    assert.ok(visible.includes(name), `«${name}» no es visible para un usuario normal`)
  }
})
