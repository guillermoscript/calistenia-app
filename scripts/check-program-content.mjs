/**
 * Guardarraíl de contenido de los programas oficiales (auditoría 2026-08).
 *
 * La auditoría de los 15 programas encontró seis defectos que ninguna prueba
 * podía ver, porque no había nada que mirase el CONTENIDO: ids que no resuelven
 * contra el catálogo, slugs escritos en el campo `name` y enseñados en pantalla,
 * material declarado que no cubre el que los ejercicios necesitan de verdad, y
 * programas que reparten cero volumen en un patrón entero de movimiento.
 *
 * Este script es lo que impide que vuelvan a entrar. Falla el proceso (exit 1)
 * ante un ERROR y solo informa ante un AVISO; los avisos son decisiones de
 * programación defendibles que conviene mirar, no cosas rotas.
 *
 * Uso:
 *   node scripts/check-program-content.mjs            # todos
 *   node scripts/check-program-content.mjs mujer-*    # por slug
 *   node scripts/check-program-content.mjs --json     # salida para máquinas
 */

import { readFileSync, readdirSync } from 'fs'
import { resolve, dirname, basename, join } from 'path'
import { fileURLToPath } from 'url'
import { CATALOG_BY_SLUG } from './lib/program-catalog.mjs'
import { PRIORITY_ALIASES } from './lib/program-exercise-fields.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── Catálogo ─────────────────────────────────────────────────────────────────

const catalog = JSON.parse(
  readFileSync(join(ROOT, 'packages/core/data/exercise-catalog.json'), 'utf8'),
)

/** Mismo normalizador que `packages/core/lib/catalogIndex.ts`. */
const norm = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const byId = new Map()
const bySlug = new Map()
const byName = new Map()

for (const [category, group] of Object.entries(catalog.categories)) {
  for (const ex of group.exercises) {
    byId.set(ex.id, { ...ex, category })
    for (const key of ['seed_slug', 'slug']) {
      if (!ex[key]) continue
      if (!bySlug.has(ex[key])) bySlug.set(ex[key], ex.id)
      if (!bySlug.has(norm(ex[key]))) bySlug.set(norm(ex[key]), ex.id)
    }
    for (const lang of ['es', 'en']) {
      const n = ex.name?.[lang]
      if (n && !byName.has(norm(n))) byName.set(norm(n), ex.id)
    }
  }
}

/** Espejo de `resolveExerciseId`: nunca adivina, devuelve null si no está seguro. */
function resolveId(input) {
  if (!input) return null
  if (byId.has(input)) return input
  const raw = bySlug.get(input)
  if (raw) return raw
  const n = norm(input)
  return bySlug.get(n) ?? byName.get(n) ?? null
}

// ── Vocabulario de material ──────────────────────────────────────────────────

/**
 * Material del catálogo → material declarable en `program-catalog.mjs`.
 *
 * Lo que no está aquí es material «de casa» (pared, toalla, silla, escalón): no
 * excluye a nadie del matching del onboarding, así que no obliga a declararlo.
 */
const EQUIPMENT_MAP = {
  barra_dominadas: 'pull_bar',
  paralelas: 'parallel_bars',
  banda_elastica: 'bands',
  anillas: 'rings',
  lastre: 'weight',
}

const HOUSEHOLD = new Set(['ninguno', 'pared', 'toalla', 'banco', 'escalon', 'silla'])

/**
 * Material que no cabe en un programa de calistenia.
 *
 * El catálogo tiene 1.578 entradas, pero la mayoría vienen de la importación de
 * ExerciseDB y son de gimnasio: 292 con mancuernas, 178 con barra, 162 de
 * máquina, 157 de polea. Un id de esos resuelve perfectamente y no lo cazaría
 * ninguna otra comprobación — así entró la «sentadilla goblet» en un programa
 * que se anuncia sin material.
 */
const GYM_ONLY = new Set([
  'mancuernas', 'barra', 'maquina', 'polea', 'kettlebell',
  'fitball', 'bosu', 'balon_medicinal',
])

// ── Umbrales del baremo ──────────────────────────────────────────────────────

/**
 * Rango de series semanales por patrón, del consenso de las meta-regresiones
 * (mínimo con el que un grupo crece: 4; rango óptimo en entrenados: 12-20).
 * El tope es holgado a propósito: pasarse es una decisión, no un fallo.
 */
const SETS = { floor: 4, min: 10, max: 30, hardMax: 45 }

/** Patrones que un programa generalista no puede dejar a cero. */
const CORE_PATTERNS = ['push', 'pull', 'legs']

/**
 * Patrones que se vigilan por dosis pero no se exigen.
 *
 * El core entra aquí y no arriba porque un roadmap de skill puede entrenarlo
 * entero dentro del propio skill (una plancha ES core en línea recta), así que
 * exigirlo daría falsos positivos. Pero sí conviene avisar cuando se queda en
 * nada: arreglar un programa con exceso de core recortándolo hasta 6 series
 * semanales cambia un desequilibrio por el contrario, y sin esta regla pasaba
 * en silencio.
 */
const SOFT_PATTERNS = ['core']

/** Un slug de la base de datos colado en un campo de texto humano. */
const SLUG_LIKE = /^[a-z0-9]+(_[a-z0-9]+)+$/

const WORK = new Set(['primary', 'secondary', 'accessory', 'high', 'med', 'low'])

// ── Utilidades ───────────────────────────────────────────────────────────────

const textOf = v => (v && typeof v === 'object' ? v.es ?? v.en ?? '' : v ?? '')

function patternOf(entry) {
  if (!entry) return '??'
  // `lumbar` es cadena posterior y `movilidad` no es trabajo: se agrupan donde
  // el baremo los sabe leer.
  if (entry.category === 'lumbar') return 'core'
  if (entry.category === 'full') return 'full'
  return entry.category
}

// ── Comprobación de un programa ──────────────────────────────────────────────

export function checkProgram(slug, doc) {
  const errors = []
  const warnings = []
  const err = m => errors.push(m)
  const warn = m => warnings.push(m)

  const meta = CATALOG_BY_SLUG.get(slug)
  if (!meta) err(`no tiene entrada en SKELETONS de program-catalog.mjs`)

  const program = doc.program ?? {}
  if (!program.duration_weeks) err(`program.duration_weeks ausente`)

  // #618: el bloque «cómo seguir este programa». Vacío en los 15 originales, que
  // es como el usuario acababa repitiendo la misma dosis cuatro semanas seguidas.
  const instr = program.instructions
  if (!instr || !textOf(instr).trim()) {
    err(`program.instructions vacío — el usuario no recibe ninguna regla de progresión`)
  } else if (typeof instr === 'object' && (!instr.es?.trim() || !instr.en?.trim())) {
    err(`program.instructions debe traer 'es' y 'en'`)
  }

  const usedEquipment = new Set()
  const setsByPattern = new Map() // fase → patrón → series
  const idsByPhase = new Map()
  let totalExercises = 0

  for (const phase of doc.phases ?? []) {
    const pn = phase.phase_number
    const perPattern = new Map()
    const ids = new Set()

    for (const day of phase.days ?? []) {
      // El id del ejercicio anterior EN ORDEN, para la comprobación 2b.
      let previousId = null

      for (const ex of [...(day.exercises ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      )) {
        totalExercises++
        const where = `fase ${pn} · ${day.day_id} · #${ex.sort_order}`

        // 1 — Esquema único. `catalog_id` y el campo ausente eran los otros dos
        //     dialectos que convivían en `programs/`.
        if (!ex.exercise_id) {
          err(`${where}: sin 'exercise_id' (${'catalog_id' in ex ? "usa 'catalog_id', renómbralo" : 'campo ausente'})`)
          continue
        }

        // 2 — El id tiene que existir de verdad en el catálogo.
        const resolved = resolveId(ex.exercise_id)
        if (!resolved) {
          err(`${where}: exercise_id "${ex.exercise_id}" no resuelve contra el catálogo`)
          continue
        }
        if (resolved !== ex.exercise_id) {
          warn(`${where}: "${ex.exercise_id}" resuelve a "${resolved}" — escribe el id canónico`)
        }

        // 2b — Nunca el mismo ejercicio dos veces SEGUIDAS en un día.
        //
        // Sembrar el id real del catálogo (en vez de la clave de hueco
        // `dia_fase_orden`, que era única por construcción) hace que dos filas
        // contiguas puedan compartir id. `computeExerciseBoundaries` en
        // `packages/core/lib/session-machine.ts` marca el inicio de un ejercicio
        // comparando SOLO con la fila anterior: dos ids iguales seguidos se
        // fusionan en un único bloque y la navegación anterior/siguiente se
        // salta uno. La misma igualdad rompe la `key` de React en WorkoutPage.
        //
        // Por eso mira lo contiguo y no el día entero: repetir movilidad de
        // muñeca en el calentamiento y otra vez en la vuelta a la calma es
        // legítimo y no toca ninguna frontera.
        if (resolved === previousId) {
          err(`${where}: "${resolved}" repetido justo después de sí mismo — fusiona el bloque de navegación de la sesión`)
        }
        previousId = resolved

        // 3 — El nombre es lo que se pinta en pantalla.
        const name = textOf(ex.name)
        if (!name.trim()) err(`${where}: sin nombre`)
        else if (SLUG_LIKE.test(name.trim())) {
          err(`${where}: el nombre "${name}" es un slug, no un nombre — se enseña tal cual al usuario`)
        }

        // 4 — Prioridad dentro del vocabulario que la app sabe pintar.
        if (ex.priority && !(String(ex.priority).toLowerCase() in PRIORITY_ALIASES)) {
          err(`${where}: priority "${ex.priority}" fuera del enum`)
        }

        const entry = byId.get(resolved)
        for (const eq of entry?.equipment ?? []) {
          if (GYM_ONLY.has(eq)) {
            err(`${where}: "${resolved}" necesita ${eq} — material de gimnasio en un programa de calistenia`)
          } else if (!HOUSEHOLD.has(eq)) {
            usedEquipment.add(eq)
          }
        }

        // 5 — Volumen: solo cuenta el trabajo efectivo.
        if (WORK.has(String(ex.priority ?? '').toLowerCase())) {
          const p = patternOf(entry)
          perPattern.set(p, (perPattern.get(p) ?? 0) + (Number(ex.sets) || 0))
          // Se indexa por FAMILIA, no por id: ver la comprobación 8.
          ids.add(entry?.family || resolved)
        }
      }
    }
    setsByPattern.set(pn, perPattern)
    idsByPhase.set(pn, ids)
  }

  // 6 — Material declarado ⊇ material usado.
  if (meta) {
    const declared = new Set(meta.equipment_required ?? [])
    const missing = [...usedEquipment]
      .map(eq => EQUIPMENT_MAP[eq])
      .filter(eq => eq && !declared.has(eq))
    if (missing.length) {
      err(`material sin declarar en program-catalog.mjs: ${[...new Set(missing)].join(', ')}`)
    }
    const unused = [...declared].filter(
      d => ![...usedEquipment].some(eq => EQUIPMENT_MAP[eq] === d),
    )
    if (unused.length) {
      warn(`declara material que no usa: ${unused.join(', ')} — excluye gente del matching a cambio de nada`)
    }
  }

  // 7 — Ningún patrón a cero, y volumen dentro del baremo.
  const isSkillTrack = meta?.goal_type === 'skill'
  for (const [pn, perPattern] of setsByPattern) {
    const total = [...perPattern.values()].reduce((a, b) => a + b, 0)
    for (const pattern of CORE_PATTERNS) {
      const n = perPattern.get(pattern) ?? 0
      // Un roadmap de skill puede no tener piernas; lo que no puede es dejar el
      // antagonista del patrón que machaca sin una sola serie.
      if (n === 0) {
        if (isSkillTrack && pattern === 'legs') continue
        if (isSkillTrack) warn(`fase ${pn}: 0 series de ${pattern} — el antagonista necesita algo aunque sea un bloque de especialización`)
        else err(`fase ${pn}: 0 series de ${pattern} en un programa generalista`)
      } else if (n < SETS.floor) {
        err(`fase ${pn}: ${n} series de ${pattern} — por debajo del mínimo con el que un grupo crece (${SETS.floor})`)
      } else if (n < SETS.min && !isSkillTrack) {
        warn(`fase ${pn}: ${n} series de ${pattern} — por debajo del rango útil (${SETS.min}-${SETS.max})`)
      } else if (n > SETS.hardMax) {
        err(`fase ${pn}: ${n} series de ${pattern} — muy por encima de lo recuperable`)
      } else if (n > SETS.max) {
        warn(`fase ${pn}: ${n} series de ${pattern} — por encima del rango con evidencia (${SETS.max})`)
      }
    }

    for (const pattern of SOFT_PATTERNS) {
      const n = perPattern.get(pattern) ?? 0
      if (n > 0 && n < SETS.min && !isSkillTrack) {
        warn(`fase ${pn}: ${n} series de ${pattern} — por debajo del rango útil (${SETS.min}-${SETS.max})`)
      } else if (n > SETS.hardMax) {
        err(`fase ${pn}: ${n} series de ${pattern} — muy por encima de lo recuperable`)
      }
    }

    const push = perPattern.get('push') ?? 0
    const pull = perPattern.get('pull') ?? 0
    if (push && pull) {
      const ratio = push / pull
      if (!isSkillTrack && (ratio > 1.5 || ratio < 0.6)) {
        warn(`fase ${pn}: empuje:tirón ${ratio.toFixed(2)} — fuera de 0,60-1,50`)
      }
    }
    if (total > 140) warn(`fase ${pn}: ${total} series semanales en total — revisa que sea recuperable`)
  }

  // 8 — Continuidad: sin movimientos que duren, no hay nada que sobrecargar.
  //
  // Se mide por FAMILIA del catálogo (`push_up`, `l_sit`, `leg_curl`…) y no por
  // id, porque contar ids castigaba justo lo que un buen programa hace: pasar de
  // `pushup_std` a `archer_pushup` en la fase 3 cambia el id pero es EL MISMO
  // movimiento un escalón más arriba, y ahí sí hay sobrecarga progresiva. Con
  // ids, un programa ejemplar y otro que salta de un ejercicio a otro cada
  // cuatro semanas puntuaban igual de mal.
  //
  // 1.073 de las 1.578 entradas del catálogo declaran familia; las que no, caen
  // a su propio id, que es el comportamiento anterior.
  const phases = [...idsByPhase.keys()].sort((a, b) => a - b)
  if (phases.length > 1) {
    const first = idsByPhase.get(phases[0])
    const last = idsByPhase.get(phases[phases.length - 1])
    const union = new Set([...first, ...last])
    const shared = [...first].filter(id => last.has(id)).length
    const pct = union.size ? Math.round((100 * shared) / union.size) : 0
    if (pct < 20) {
      err(`solo ${pct}% de continuidad entre la primera fase y la última — no hay familia de movimiento que dure lo bastante para progresar en ella`)
    } else if (pct < 30) {
      warn(`${pct}% de continuidad entre la primera fase y la última — poca base para sobrecarga progresiva`)
    }
  }

  // 9 — Escalada de volumen sin descarga.
  if (phases.length > 1) {
    const sum = pn => [...(setsByPattern.get(pn)?.values() ?? [])].reduce((a, b) => a + b, 0)
    const a = sum(phases[0])
    const b = sum(phases[phases.length - 1])
    if (a && b / a > 1.4) {
      warn(`el volumen sube ${Math.round((100 * (b - a)) / a)}% de la primera fase a la última sin descarga`)
    }
  }

  return { slug, errors, warnings, totalExercises }
}

/** Lee y comprueba un `programs/<slug>.json` del disco. */
function checkProgramFile(file) {
  const slug = basename(file, '.json')
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  return checkProgram(slug, doc)
}

// ── Ejecución ────────────────────────────────────────────────────────────────
// Solo corre cuando el fichero se invoca como script (no cuando un test lo
// importa por `checkProgram`) — así el runner no dispara la CLI de rebote.

const isMain = import.meta.url === `file://${process.argv[1]}`

if (isMain) {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  const filters = args.filter(a => !a.startsWith('--'))

  const files = readdirSync(join(ROOT, 'programs'))
    .filter(f => f.endsWith('.json'))
    .filter(f => !filters.length || filters.some(x => basename(f, '.json').includes(x.replace(/\*/g, ''))))
    .map(f => join(ROOT, 'programs', f))
    .sort()

  const results = files.map(checkProgramFile)

  if (asJson) {
    console.log(JSON.stringify(results, null, 2))
  } else {
    let nErr = 0
    let nWarn = 0
    for (const r of results) {
      nErr += r.errors.length
      nWarn += r.warnings.length
      const mark = r.errors.length ? '✗' : r.warnings.length ? '!' : '✓'
      console.log(`\n${mark} ${r.slug}  (${r.totalExercises} ejercicios)`)
      for (const e of r.errors) console.log(`    ERROR  ${e}`)
      for (const w of r.warnings) console.log(`    aviso  ${w}`)
    }
    console.log(
      `\n${'─'.repeat(70)}\n${results.length} programas · ${nErr} errores · ${nWarn} avisos\n`,
    )
    if (nErr) process.exit(1)
  }
}
