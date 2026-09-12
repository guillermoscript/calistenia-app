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
 * La auditoría de ENTRENAMIENTO del 2026-09-08 (#711) añadió las reglas de
 * LÓGICA: nivel del ejercicio frente al del programa, regresión por familia
 * entre fases, contraindicaciones derivadas del contenido, descarga prometida
 * y no codificada, cardio y nutrición en `fat_loss`, días pesados seguidos,
 * frecuencia por patrón y ejercicios prometidos en el texto (#715). Nacieron
 * como AVISO para no bloquear las quince issues de contenido que corrían en
 * paralelo; con `--strict` las de `STRICT_RULES` pasan a ERROR. Desde el cierre
 * de #711 (#719-#733 mergeadas) `--strict` ES el modo de CI: sin el flag el
 * script sigue siendo el modo «mirar sin cortar», pero lo que decide el merge
 * es `pnpm programs:content:check --strict`.
 *
 * Descarga (#716, decidido e implementado): `deload_last_week: true` en la fase
 * es la ÚNICA codificación. El motor sirve la mitad de series en la última
 * semana del rango `weeks` de esa fase y las pantallas lo anuncian. Un
 * `day_type: 'deload'` NO existe en el motor: aquí ya no cuenta como descarga.
 * Una issue de contenido (#719-#733) que prometa descarga en `instructions`
 * debe (a) poner el flag en las fases donde la promete o (b) quitar la promesa.
 *
 * Cada hallazgo lleva un `rule` estable (ver `STRICT_RULES` y los ids de cada
 * llamada) para que `--json` se pueda filtrar por programa y regla.
 *
 * Uso:
 *   node scripts/check-program-content.mjs            # todos
 *   node scripts/check-program-content.mjs mujer-*    # por slug
 *   node scripts/check-program-content.mjs --json     # salida para máquinas
 *   node scripts/check-program-content.mjs --strict   # reglas de lógica como ERROR
 *   node scripts/check-program-content.mjs --digest   # el programa día a día
 */

import { readFileSync, readdirSync } from 'fs'
import { resolve, dirname, basename, join } from 'path'
import { fileURLToPath } from 'url'
import { CATALOG_BY_SLUG } from './lib/program-catalog.mjs'
import { PRIORITY_ALIASES, normalizeWeeklyProgression } from './lib/program-exercise-fields.mjs'
import {
  inferTimerFromReps,
  needsMuscleRepair,
  unknownMuscleTokens,
} from './repair-program-timers-muscles.mjs'

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

// ── Lógica de entrenamiento (#715) ───────────────────────────────────────────

/**
 * Reglas que `--strict` convierte en ERROR. Las demás reglas nuevas
 * (`heavy_consecutive_days`, `pattern_frequency`, `promised_exercise`) son
 * decisiones de programación discutibles y se quedan en AVISO siempre.
 */
export const STRICT_RULES = new Set([
  // Material (#714): el catálogo dejó de mentir sobre goblet squat, remos de
  // polea/mancuerna y TRX, y los programas que los usan (#721, #722, #732) se
  // corrigieron en sus issues. Estas dos reglas fueron AVISO hasta el cierre
  // de #711 para no dejar la CI en rojo entre medias; ahora la CI corre con
  // `--strict`, así que vuelven a ser ERROR.
  'gym_equipment',
  'equipment',
  'level_cap',
  'family_regression',
  'contraindications',
  'deload_promise',
  'fat_loss_cardio',
  'fat_loss_nutrition',
])

/** Escalones de `difficulty` del catálogo, en orden. Solo hay tres. */
const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 }

/**
 * Contraindicaciones que el contenido obliga a declarar en `SKELETONS`
 * (vocabulario de `program-catalog.mjs`). Cada disparador casa contra la
 * `family` del catálogo O contra el id del ejercicio; con que un ejercicio de
 * TRABAJO dispare, el programa tiene que declarar todas las del grupo.
 *
 * - Colgado máximo / excéntrico de tracción: codo y hombro.
 * - Apoyo invertido de manos y planche: muñeca y hombro.
 * - Impacto (saltos, pliometría, nordic): rodilla. El tobillo de burpees y
 *   patinadores queda como decisión del programa, no se exige.
 *
 * La `family` solo cuenta en entradas de categoría `skill`: el catálogo tiene
 * a `chinup` en `family: handstand` (lo arregla #714) y sin ese cerrojo una
 * dominada supina exigiría declarar muñeca.
 */
const CONTRAINDICATION_TRIGGERS = [
  { label: 'colgado máximo o excéntrico de tracción', families: ['muscle_up', 'front_lever', 'back_lever'], ids: /muscleup|muscle_up|front_lever|back_lever|_neg\b|negative|dead_hang/, requires: ['elbow', 'shoulder'] },
  { label: 'apoyo invertido o planche', families: ['handstand', 'planche'], ids: /handstand|hspu|planche|crow|elbow_lever/, requires: ['wrist', 'shoulder'] },
  { label: 'impacto, pliometría o nordic', families: [], ids: /jump|plyo|burpee|skater|nordic|hop\b/, requires: ['knee'] },
]

/** `instructions` promete una descarga. */
const DELOAD_RE = /descarga|deload/i

/** Marcador del párrafo de nutrición que #718 fija para los `fat_loss`. */
const NUTRITION_MARKER = { es: /d[ée]ficit/i, en: /deficit/i }

/**
 * Qué cuenta como bloque de cardio en un `fat_loss` (#718): un ejercicio de
 * trabajo cronometrado, de categoría `full` o con id de cardio, que dure en
 * total ≥ `minBlockSeconds`; o un día `day_type: 'circuit'`. Un `fat_loss`
 * necesita `blocksPerWeek` por fase (cada fase es una semana tipo).
 */
const CARDIO = { blocksPerWeek: 2, minBlockSeconds: 300 }
const CARDIO_IDS = /burpee|jump|jack|climber|skater|high_knee|bear_crawl|rope|jog|run|sprint|cardio|hiit/

/** Series a partir de las cuales un día es «pesado» en un patrón. */
const HEAVY_DAY_SETS = 8

/** Tirón vertical: lo que cuelga de la barra. Los remos no cuentan. */
const VERTICAL_PULL = { families: new Set(['pull_up', 'muscle_up', 'front_lever']), ids: /pull_?up|chin_?up|chinup|muscleup|front_lever/ }

/** Días mínimos por patrón principal en un `muscle_gain`. */
const MIN_PATTERN_DAYS = 2

const WEEKDAY_INDEX = {
  lun: 0, mar: 1, mie: 2, jue: 3, vie: 4, sab: 5, dom: 6,
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
}

/**
 * Promesas del texto que el contenido tiene que cumplir. Acotada a propósito:
 * casar los 1.576 nombres del catálogo contra el texto libre daría más ruido
 * que señal. `text` casa contra `instructions`, `day_focus` y `workout_title`;
 * `ids` contra los ids del contenido (cualquier prioridad). `cardio` usa la
 * definición de bloque de arriba.
 */
const PROMISES = [
  { label: 'dead hang / colgado', text: /dead\s*hang|colgad[oa]s?\b|colgarte/i, ids: /hang/ },
  { label: 'false grip / agarre falso', text: /false\s*grip|agarre\s+falso/i, ids: /false_grip/ },
  { label: 'muscle-up', text: /muscle[\s-]?ups?/i, ids: /muscleup|muscle_up/ },
  { label: 'pino / handstand', text: /\bpino\b|handstand/i, ids: /handstand|hspu/ },
  { label: 'pistol', text: /pistol/i, ids: /pistol/ },
  { label: 'nordic', text: /nordic|n[óo]rdic[oa]/i, ids: /nordic/ },
  { label: 'dominada / pull-up', text: /dominadas?|pull[\s-]?ups?/i, ids: /pull_?up|chin_?up|chinup/ },
  { label: 'fondos / dips', text: /\bfondos?\b|\bdips?\b/i, ids: /dip/ },
  { label: 'cardio', text: /\bcardio\b/i, cardio: true },
]

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

// ── Progresión semanal dentro de la fase (#755) ──────────────────────────────

/**
 * Ventana razonable del valor FINAL de una rampa, por campo.
 *
 * No son límites del motor —una rampa puede acabar donde quiera— sino un
 * cinturón contra el error de dedo, que en una rampa es especialmente difícil
 * de ver: un `step: 50` en vez de `5` no rompe nada, solo pide medio minuto más
 * de colgado cada semana y nadie se da cuenta hasta que el usuario se queda
 * mirando un cronómetro de cuatro minutos.
 */
const PROGRESSION_BOUNDS = {
  timerSeconds: { min: 5, max: 300, label: 'segundos de cronómetro' },
  sets: { min: 1, max: 8, label: 'series' },
  reps: { min: 1, max: 60, label: 'repeticiones' },
  rest: { min: 15, max: 600, label: 'segundos de descanso' },
}

/** El campo del JSON que espeja cada campo de la rampa. */
const PROGRESSION_SOURCE = {
  timerSeconds: 'timer_seconds',
  sets: 'sets',
  reps: 'reps',
  rest: 'rest_seconds',
}

/**
 * Una cadena de números encadenados con flechas: «20 → 25 → 30». Es como están
 * escritas en prosa TODAS las rampas numéricas del contenido actual, así que
 * sirve igual para detectar la que falta migrar y la que se quedó duplicada.
 */
const RAMP_CHAIN_RE = /(\d+)\s*(?:→|->|—>|–>)\s*(\d+)/

/** Primer número comparable de un valor de campo: «8-12» → 8, «20 s» → 20. */
function firstNumber(value) {
  const m = /(\d+)/.exec(String(value ?? ''))
  return m ? Number(m[1]) : null
}

/** Semanas que dura una fase según su rango `weeks` («1-4» → 4). */
function phaseWeekCount(phase) {
  const nums = String(phase?.weeks ?? '').match(/\d+/g)
  if (!nums || nums.length === 0) return null
  const from = Number(nums[0])
  const to = nums.length > 1 ? Number(nums[1]) : from
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.abs(to - from) + 1
}

/**
 * Reglas de la rampa semanal de un ejercicio (#755).
 *
 * Cinco cosas, en orden de gravedad:
 *
 * - **`progression_shape`** (ERROR): la rampa no se puede leer. Es error y no
 *   aviso por la misma razón que un `priority` fuera del enum: una rampa mal
 *   escrita no se nota mirando la pantalla —la sesión sale como antes de
 *   #755—, así que una progresión muerta llegaría a producción en silencio.
 * - **`progression_base`**: el valor de la fila no coincide con el de la
 *   primera semana de la rampa. Todo lo que NO aplica la rampa (la pantalla de
 *   detalle del programa, el MCP, una exportación) enseña el valor de la fila,
 *   y si no es el de la semana 1, miente.
 * - **`progression_range`**: la rampa acaba fuera de la ventana razonable.
 * - **`progression_duplicated`**: la rampa está en el campo Y los números
 *   siguen en la nota. La nota se queda con el «por qué», no con los números:
 *   duplicarlos garantiza que algún día discrepen.
 * - **`progression_in_prose`**: la nota describe una rampa numérica sobre un
 *   campo que la fila tiene, y la fila no la declara. Es la regla que habría
 *   cazado #755. Se exige que el primer número de la cadena COINCIDA con el
 *   valor actual del campo: sin ese emparejamiento la regla saltaría con los
 *   tempos («baja 4 s… 5 s… 6 s») y las progresiones cualitativas, que no
 *   tienen campo donde vivir.
 */
function checkWeeklyProgression(ex, phase, where, { err, logic }) {
  const note = textOf(ex.note)
  const chain = RAMP_CHAIN_RE.exec(note)

  let ramps = null
  try {
    ramps = normalizeWeeklyProgression(ex.weekly_progression, ex.name?.es || ex.name)
  } catch (e) {
    err(`${where}: ${e.message}`, 'progression_shape')
    return
  }

  if (!ramps) {
    // Sin rampa declarada: ¿la describe la nota sobre un campo que existe?
    if (chain) {
      const start = Number(chain[1])
      const match = Object.entries(PROGRESSION_SOURCE)
        .find(([, src]) => firstNumber(ex[src]) === start)
      if (match) {
        logic(
          'progression_in_prose',
          `${where}: la nota rampa ${chain[1]} → ${chain[2]} y el ejercicio arranca justo en ${start} ` +
          `(${match[1]}), pero no declara 'weekly_progression' — la pantalla enseñará ${start} las cuatro semanas`,
        )
      }
    }
    return
  }

  const weeks = phaseWeekCount(phase)

  for (const r of ramps) {
    const source = PROGRESSION_SOURCE[r.field]
    const base = ex[source]

    // El campo sobre el que rampa tiene que existir en la fila.
    if (base === undefined || base === null || base === '') {
      err(
        `${where}: rampa sobre '${source}' y el ejercicio no lo trae — la rampa no haría nada`,
        'progression_shape',
      )
      continue
    }

    if (r.values) {
      if (weeks !== null && r.values.length > weeks) {
        err(
          `${where}: rampa de '${source}' con ${r.values.length} valores y la fase dura ${weeks} semanas`,
          'progression_shape',
        )
      }
      const first = r.values[0]
      if (String(first) !== String(base)) {
        logic(
          'progression_base',
          `${where}: rampa de '${source}' empieza en ${JSON.stringify(first)} y la fila dice ` +
          `${JSON.stringify(base)} — todo lo que no aplica la rampa (detalle del programa, MCP) enseñará el de la fila`,
        )
      }
    } else if (r.field === 'reps' && !/^\d+(\s*-\s*\d+)?$/.test(String(base).trim())) {
      // La forma lineal sobre `reps` solo sabe mover «6» y «8-12».
      err(
        `${where}: rampa lineal de 'reps' sobre "${base}", que no es un número ni un rango — usa 'values'`,
        'progression_shape',
      )
      continue
    }

    // Valor final de la rampa, dentro de una ventana razonable.
    const bounds = PROGRESSION_BOUNDS[r.field]
    const last = r.values
      ? firstNumber(r.values[r.values.length - 1])
      : firstNumber(base) === null
        ? null
        : clampBound(firstNumber(base) + r.step * Math.max(0, (weeks ?? 4) - 1), r)
    if (bounds && last !== null && (last < bounds.min || last > bounds.max)) {
      logic(
        'progression_range',
        `${where}: la rampa de '${source}' acaba en ${last} ${bounds.label} ` +
        `(fuera de ${bounds.min}-${bounds.max}) — repasa el 'step' o los 'values'`,
      )
    }

  }

  // Una sola vez por ejercicio, aunque declare varias rampas.
  if (chain) {
    logic(
      'progression_duplicated',
      `${where}: la rampa está en 'weekly_progression' y los números siguen en la nota ` +
      `(«${chain[1]} → ${chain[2]}») — la nota se queda con el por qué, no con los números`,
    )
  }
}

/** `min`/`max` de la forma lineal, aplicados como los aplica el motor. */
function clampBound(n, r) {
  let out = n
  if (typeof r.min === 'number') out = Math.max(out, r.min)
  if (typeof r.max === 'number') out = Math.min(out, r.max)
  return out
}

// ── Comprobación de un programa ──────────────────────────────────────────────

export function checkProgram(slug, doc, { strict = false } = {}) {
  const errors = []
  const warnings = []
  const findings = []
  const push = (level, rule, message) => {
    findings.push({ rule, level, message })
    ;(level === 'error' ? errors : warnings).push(message)
  }
  const err = (m, rule = 'legacy') => push('error', rule, m)
  const warn = (m, rule = 'legacy') => push('warning', rule, m)
  /**
   * Regla de lógica (#715): AVISO por defecto; ERROR con `--strict` si está en
   * `STRICT_RULES`. Las demás son aviso siempre.
   */
  const logic = (rule, m) => push(strict && STRICT_RULES.has(rule) ? 'error' : 'warning', rule, m)

  const meta = CATALOG_BY_SLUG.get(slug)
  if (!meta) err(`no tiene entrada en SKELETONS de program-catalog.mjs`, 'catalog_entry')

  const program = doc.program ?? {}
  if (!program.duration_weeks) err(`program.duration_weeks ausente`, 'duration')

  // #618: el bloque «cómo seguir este programa». Vacío en los 15 originales, que
  // es como el usuario acababa repitiendo la misma dosis cuatro semanas seguidas.
  const instr = program.instructions
  if (!instr || !textOf(instr).trim()) {
    err(`program.instructions vacío — el usuario no recibe ninguna regla de progresión`, 'instructions')
  } else if (typeof instr === 'object' && (!instr.es?.trim() || !instr.en?.trim())) {
    err(`program.instructions debe traer 'es' y 'en'`, 'instructions')
  }

  const usedEquipment = new Set()
  const setsByPattern = new Map() // fase → patrón → series
  const idsByPhase = new Map()
  let totalExercises = 0

  // Lo que las reglas de lógica (#715) necesitan ver después del bucle.
  const phaseLogic = [] // { pn, days: [{ label, weekday, push, vpull, patterns }], famMax, cardioBlocks, deload }
  const allIds = new Set() // ids resueltos de cualquier prioridad (promesas)
  const triggered = new Map() // etiqueta del disparador → primer sitio donde salta
  const promisedText = [textOf(program.instructions), typeof program.instructions === 'object' ? program.instructions?.en ?? '' : '']
  let anyDeloadEncoded = false

  for (const phase of doc.phases ?? []) {
    const pn = phase.phase_number
    const perPattern = new Map()
    const ids = new Set()
    const lp = { pn, days: [], famMax: new Map(), cardioBlocks: 0, deload: !!phase.deload_last_week }
    if (lp.deload) anyDeloadEncoded = true

    for (const day of phase.days ?? []) {
      // El id del ejercicio anterior EN ORDEN, para la comprobación 2b.
      let previousId = null
      const dayType = String(day.day_type ?? '').toLowerCase()
      if (dayType === 'circuit') lp.cardioBlocks++
      const ld = { label: `fase ${pn} · ${day.day_id}`, weekday: WEEKDAY_INDEX[String(day.day_id ?? '').toLowerCase()], push: 0, vpull: 0, patterns: new Set() }
      lp.days.push(ld)
      promisedText.push(textOf(day.day_focus), textOf(day.workout_title))

      // `workout_title` y `day_name` son lo que la tarjeta de «Elige tu
      // entrenamiento» pone en la pantalla de inicio. Sin ellos la tarjeta se
      // queda en «LUNES · 11 EJERCICIOS» y el usuario no sabe qué le toca hoy.
      // No es hipotético: el #762 los borró de los quince días de
      // intermedio-hipertrofia y llegó a producción sin que nada chistara —
      // el contenido seguía siendo válido y el hash cuadraba. Es ERROR sin
      // `--strict` porque no es una decisión de programación discutible: o el
      // día tiene título o la pantalla sale rota.
      if (!textOf(day.workout_title).trim()) {
        err(`fase ${pn} · ${day.day_id}: sin 'workout_title' — la tarjeta de inicio saldría sin título`, 'day_title')
      }
      if (!textOf(day.day_name).trim()) {
        err(`fase ${pn} · ${day.day_id}: sin 'day_name'`, 'day_title')
      }

      for (const ex of [...(day.exercises ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      )) {
        totalExercises++
        const where = `fase ${pn} · ${day.day_id} · #${ex.sort_order}`

        // 1 — Esquema único. `catalog_id` y el campo ausente eran los otros dos
        //     dialectos que convivían en `programs/`.
        if (!ex.exercise_id) {
          err(`${where}: sin 'exercise_id' (${'catalog_id' in ex ? "usa 'catalog_id', renómbralo" : 'campo ausente'})`, 'exercise_id')
          continue
        }

        // 2 — El id tiene que existir de verdad en el catálogo.
        const resolved = resolveId(ex.exercise_id)
        if (!resolved) {
          err(`${where}: exercise_id "${ex.exercise_id}" no resuelve contra el catálogo`, 'exercise_id')
          continue
        }
        if (resolved !== ex.exercise_id) {
          warn(`${where}: "${ex.exercise_id}" resuelve a "${resolved}" — escribe el id canónico`, 'exercise_id')
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
          err(`${where}: "${resolved}" repetido justo después de sí mismo — fusiona el bloque de navegación de la sesión`, 'duplicate_adjacent')
        }
        previousId = resolved

        // 3 — El nombre es lo que se pinta en pantalla.
        const name = textOf(ex.name)
        if (!name.trim()) err(`${where}: sin nombre`, 'exercise_name')
        else if (SLUG_LIKE.test(name.trim())) {
          err(`${where}: el nombre "${name}" es un slug, no un nombre — se enseña tal cual al usuario`, 'exercise_name')
        }

        // 3b — Una duración en `reps` sin temporizador encendido (#690).
        //
        // La sesión solo pinta la cuenta atrás cuando `is_timer` es true. Con
        // `is_timer:false` el usuario lee «30-45 seg» y no tiene nada que
        // arrancar: la plancha se hace a ojo. Solo dispara con duraciones
        // PURAS; «6x10s hold» o «10 (3s arriba)» son repeticiones con tempo y
        // pasan intactas.
        const inferred = inferTimerFromReps(ex.reps)
        if (inferred !== null && !ex.is_timer) {
          err(`${where}: reps "${ex.reps}" es una duración pero is_timer es false — la sesión no pinta el temporizador`, 'timer')
        } else if (ex.is_timer && !Number(ex.timer_seconds)) {
          err(`${where}: is_timer sin timer_seconds — la cuenta atrás arranca en 0`, 'timer')
        }

        // 3c — Tokens de máquina en `muscles` (#690). La ficha del ejercicio
        //      los enseña tal cual: «core, anterior_core, shoulders».
        const muscles = textOf(ex.muscles)
        if (needsMuscleRepair(muscles)) {
          const unknown = unknownMuscleTokens(muscles)
          err(
            `${where}: muscles "${muscles}" lleva tokens de máquina — se enseña tal cual al usuario` +
            (unknown.length ? ` (fuera del diccionario: ${unknown.join(', ')})` : ''),
            'muscles',
          )
        }

        // 4 — Prioridad dentro del vocabulario que la app sabe pintar.
        if (ex.priority && !(String(ex.priority).toLowerCase() in PRIORITY_ALIASES)) {
          err(`${where}: priority "${ex.priority}" fuera del enum`, 'priority')
        }

        // 4b — Progresión semanal dentro de la fase (#755).
        checkWeeklyProgression(ex, phase, where, { err, logic })

        const entry = byId.get(resolved)
        for (const eq of entry?.equipment ?? []) {
          if (GYM_ONLY.has(eq)) {
            logic('gym_equipment', `${where}: "${resolved}" necesita ${eq} — material de gimnasio en un programa de calistenia`)
          } else if (!HOUSEHOLD.has(eq)) {
            usedEquipment.add(eq)
          }
        }

        allIds.add(resolved)

        // 5 — Volumen: solo cuenta el trabajo efectivo.
        if (WORK.has(String(ex.priority ?? '').toLowerCase())) {
          const p = patternOf(entry)
          const sets = Number(ex.sets) || 0
          perPattern.set(p, (perPattern.get(p) ?? 0) + sets)
          // Se indexa por FAMILIA, no por id: ver la comprobación 8.
          ids.add(entry?.family || resolved)

          // ── Recogida para las reglas de lógica (#715) ──
          const rank = LEVEL_RANK[entry?.difficulty]
          const level = meta?.difficulty ?? program.difficulty
          const programRank = LEVEL_RANK[level]
          // L1 — Dificultad máxima por nivel.
          if (rank === 2 && programRank === 0) {
            logic('level_cap', `${where}: "${resolved}" es advanced en un programa beginner`)
          } else if (rank === 2 && programRank === 1 && pn === 1) {
            logic('level_cap', `${where}: "${resolved}" es advanced en la fase 1 de un programa intermediate — el día 1 debe poder hacerlo el usuario declarado`)
          }
          if (entry?.family && rank !== undefined) {
            const prev = lp.famMax.get(entry.family)
            if (!prev || rank > prev.rank) lp.famMax.set(entry.family, { rank, id: resolved })
          }
          for (const t of CONTRAINDICATION_TRIGGERS) {
            const byFamily = entry?.category === 'skill' && t.families.includes(entry.family)
            if (!triggered.has(t.label) && (byFamily || t.ids.test(resolved))) {
              triggered.set(t.label, { where, id: resolved, requires: t.requires })
            }
          }
          if (p === 'push') ld.push += sets
          if (VERTICAL_PULL.families.has(entry?.family) || VERTICAL_PULL.ids.test(resolved)) ld.vpull += sets
          ld.patterns.add(p)
          const timed = ex.is_timer && Number(ex.timer_seconds) > 0
          if (timed && (entry?.category === 'full' || CARDIO_IDS.test(resolved))) {
            const total = Math.max(1, sets) * Number(ex.timer_seconds)
            if (total >= CARDIO.minBlockSeconds) lp.cardioBlocks++
          }
        }
      }
    }
    setsByPattern.set(pn, perPattern)
    idsByPhase.set(pn, ids)
    phaseLogic.push(lp)
  }

  // 6 — Material declarado ⊇ material usado.
  if (meta) {
    const declared = new Set(meta.equipment_required ?? [])
    const missing = [...usedEquipment]
      .map(eq => EQUIPMENT_MAP[eq])
      .filter(eq => eq && !declared.has(eq))
    if (missing.length) {
      logic('equipment', `material sin declarar en program-catalog.mjs: ${[...new Set(missing)].join(', ')}`)
    }
    const unused = [...declared].filter(
      d => ![...usedEquipment].some(eq => EQUIPMENT_MAP[eq] === d),
    )
    if (unused.length) {
      warn(`declara material que no usa: ${unused.join(', ')} — excluye gente del matching a cambio de nada`, 'equipment')
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
        if (isSkillTrack) warn(`fase ${pn}: 0 series de ${pattern} — el antagonista necesita algo aunque sea un bloque de especialización`, 'volume')
        else err(`fase ${pn}: 0 series de ${pattern} en un programa generalista`, 'volume')
      } else if (n < SETS.floor) {
        err(`fase ${pn}: ${n} series de ${pattern} — por debajo del mínimo con el que un grupo crece (${SETS.floor})`, 'volume')
      } else if (n < SETS.min && !isSkillTrack) {
        warn(`fase ${pn}: ${n} series de ${pattern} — por debajo del rango útil (${SETS.min}-${SETS.max})`, 'volume')
      } else if (n > SETS.hardMax) {
        err(`fase ${pn}: ${n} series de ${pattern} — muy por encima de lo recuperable`, 'volume')
      } else if (n > SETS.max) {
        warn(`fase ${pn}: ${n} series de ${pattern} — por encima del rango con evidencia (${SETS.max})`, 'volume')
      }
    }

    for (const pattern of SOFT_PATTERNS) {
      const n = perPattern.get(pattern) ?? 0
      if (n > 0 && n < SETS.min && !isSkillTrack) {
        warn(`fase ${pn}: ${n} series de ${pattern} — por debajo del rango útil (${SETS.min}-${SETS.max})`, 'volume')
      } else if (n > SETS.hardMax) {
        err(`fase ${pn}: ${n} series de ${pattern} — muy por encima de lo recuperable`, 'volume')
      }
    }

    const push = perPattern.get('push') ?? 0
    const pull = perPattern.get('pull') ?? 0
    if (push && pull) {
      const ratio = push / pull
      if (!isSkillTrack && (ratio > 1.5 || ratio < 0.6)) {
        warn(`fase ${pn}: empuje:tirón ${ratio.toFixed(2)} — fuera de 0,60-1,50`, 'push_pull_ratio')
      }
    }
    if (total > 140) warn(`fase ${pn}: ${total} series semanales en total — revisa que sea recuperable`, 'total_volume')
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
      err(`solo ${pct}% de continuidad entre la primera fase y la última — no hay familia de movimiento que dure lo bastante para progresar en ella`, 'continuity')
    } else if (pct < 30) {
      warn(`${pct}% de continuidad entre la primera fase y la última — poca base para sobrecarga progresiva`, 'continuity')
    }
  }

  // 9 — Escalada de volumen sin descarga.
  if (phases.length > 1) {
    const sum = pn => [...(setsByPattern.get(pn)?.values() ?? [])].reduce((a, b) => a + b, 0)
    const a = sum(phases[0])
    const b = sum(phases[phases.length - 1])
    if (a && b / a > 1.4) {
      warn(`el volumen sube ${Math.round((100 * (b - a)) / a)}% de la primera fase a la última sin descarga`, 'volume_escalation')
    }
  }

  // ── Reglas de lógica de entrenamiento (#715) ─────────────────────────────
  // L1 (level_cap) se emite dentro del bucle, ejercicio a ejercicio.

  // L2 — No-regresión por familia entre fases consecutivas. Con tres escalones
  //      de `difficulty` solo se ve el salto grande (tuck → lean, full →
  //      single), que es justo el que la auditoría encontró.
  phaseLogic.sort((a, b) => a.pn - b.pn)
  for (let i = 1; i < phaseLogic.length; i++) {
    const prev = phaseLogic[i - 1]
    const cur = phaseLogic[i]
    for (const [family, before] of prev.famMax) {
      const after = cur.famMax.get(family)
      if (after && after.rank < before.rank) {
        logic('family_regression', `familia ${family}: la fase ${prev.pn} llega a "${before.id}" (${entry(before.id).difficulty}) y la fase ${cur.pn} baja a "${after.id}" (${entry(after.id).difficulty})`)
      }
    }
  }

  // L3 — Contraindicaciones derivadas del contenido.
  if (meta) {
    const declared = new Set(meta.contraindications ?? [])
    for (const [label, hit] of triggered) {
      const missing = hit.requires.filter(c => !declared.has(c))
      if (missing.length) {
        logic('contraindications', `${hit.where}: "${hit.id}" es ${label} y SKELETONS no declara ${missing.join(' ni ')} en contraindications`)
      }
    }
  }

  // L4 — Promesa de descarga sin codificar (#716).
  if (instr && DELOAD_RE.test(textOf(instr)) && !anyDeloadEncoded) {
    logic('deload_promise', `instructions promete una descarga y ninguna fase la codifica (deload_last_week: true en la fase) — codifícala o quita la promesa`)
  }

  // L5 — fat_loss: cardio real y párrafo de nutrición (#718).
  if (meta?.goal_type === 'fat_loss') {
    for (const lp of phaseLogic) {
      if (lp.cardioBlocks < CARDIO.blocksPerWeek) {
        logic('fat_loss_cardio', `fase ${lp.pn}: ${lp.cardioBlocks} bloque(s) de cardio cronometrado ≥ ${CARDIO.minBlockSeconds / 60} min por semana en un fat_loss — mínimo ${CARDIO.blocksPerWeek}`)
      }
    }
    if (instr) {
      const es = typeof instr === 'object' ? instr.es ?? '' : String(instr)
      const en = typeof instr === 'object' ? instr.en ?? '' : String(instr)
      if (!NUTRITION_MARKER.es.test(es) || !NUTRITION_MARKER.en.test(en)) {
        logic('fat_loss_nutrition', `instructions de un fat_loss sin el párrafo de nutrición (marcador «déficit» / "deficit") — la grasa la decide el déficit, no el entreno`)
      }
    }
  }

  // L6 — Dos días de calendario seguidos con el mismo patrón pesado.
  for (const lp of phaseLogic) {
    const days = lp.days.filter(d => d.weekday !== undefined).sort((a, b) => a.weekday - b.weekday)
    for (let i = 1; i < days.length; i++) {
      const a = days[i - 1]
      const b = days[i]
      if (b.weekday - a.weekday !== 1) continue
      if (a.push > HEAVY_DAY_SETS && b.push > HEAVY_DAY_SETS) {
        logic('heavy_consecutive_days', `${a.label} y ${b.label}: ${a.push} y ${b.push} series de empuje en dos días seguidos`)
      }
      if (a.vpull > HEAVY_DAY_SETS && b.vpull > HEAVY_DAY_SETS) {
        logic('heavy_consecutive_days', `${a.label} y ${b.label}: ${a.vpull} y ${b.vpull} series de tirón vertical en dos días seguidos`)
      }
    }
  }

  // L7 — Frecuencia por patrón en muscle_gain.
  if (meta?.goal_type === 'muscle_gain') {
    for (const lp of phaseLogic) {
      for (const pattern of CORE_PATTERNS) {
        const n = lp.days.filter(d => d.patterns.has(pattern)).length
        if (n > 0 && n < MIN_PATTERN_DAYS) {
          logic('pattern_frequency', `fase ${lp.pn}: ${pattern} solo ${n} día/semana en un muscle_gain — cada patrón principal necesita ≥ ${MIN_PATTERN_DAYS}`)
        }
      }
    }
  }

  // L8 — Ejercicio prometido en el texto que no está en el contenido.
  const corpus = promisedText.filter(Boolean).join('\n')
  const anyCardio = phaseLogic.some(lp => lp.cardioBlocks > 0)
  for (const pr of PROMISES) {
    if (!pr.text.test(corpus)) continue
    const delivered = pr.cardio ? anyCardio : [...allIds].some(id => pr.ids.test(id))
    if (!delivered) {
      logic('promised_exercise', `el texto promete ${pr.label} y ningún ejercicio del contenido lo es`)
    }
  }

  return { slug, errors, warnings, findings, totalExercises }
}

/** Entrada del catálogo (o un hueco inofensivo) para pintar mensajes. */
function entry(id) {
  return byId.get(id) ?? { difficulty: '?' }
}

/**
 * El programa día a día, para leerlo entero de un vistazo (auditorías).
 *
 * En los cronometrados enseña el rango de `reps` («20-30 s») cuando existe y
 * solo cae a `timer_seconds` si `reps` está vacío: leer «30 s» cuando la ficha
 * dice «20-30 s» hacía que la auditoría midiera la dosis mal.
 */
export function digestProgram(slug, doc) {
  const out = [`# ${slug} — ${textOf(doc.program?.name)} (${doc.program?.difficulty ?? '?'}, ${doc.program?.duration_weeks ?? '?'} sem)`]
  for (const phase of doc.phases ?? []) {
    out.push(`\n## Fase ${phase.phase_number} · ${textOf(phase.name)} · semanas ${phase.weeks ?? '?'}${phase.deload_last_week ? ' · descarga última semana' : ''}`)
    for (const day of phase.days ?? []) {
      out.push(`\n### ${day.day_id} · ${textOf(day.workout_title) || textOf(day.day_focus) || ''}${day.day_type ? ` [${day.day_type}]` : ''}`)
      for (const ex of [...(day.exercises ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
        const dose = ex.is_timer
          ? `${ex.sets}×${String(ex.reps ?? '').trim() || `${ex.timer_seconds} s`}${ex.reps && ex.timer_seconds ? ` (timer ${ex.timer_seconds} s)` : ''}`
          : `${ex.sets}×${ex.reps}`
        out.push(`- ${textOf(ex.name)} [${ex.exercise_id}] ${dose} · descanso ${ex.rest_seconds ?? 0} s · ${ex.priority}`)
      }
    }
  }
  return out.join('\n')
}

/** Lee y comprueba un `programs/<slug>.json` del disco. */
function checkProgramFile(file, opts) {
  const slug = basename(file, '.json')
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  return checkProgram(slug, doc, opts)
}

// ── Ejecución ────────────────────────────────────────────────────────────────
// Solo corre cuando el fichero se invoca como script (no cuando un test lo
// importa por `checkProgram`) — así el runner no dispara la CLI de rebote.

const isMain = import.meta.url === `file://${process.argv[1]}`

if (isMain) {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  const strict = args.includes('--strict')
  const asDigest = args.includes('--digest')
  const filters = args.filter(a => !a.startsWith('--'))

  const files = readdirSync(join(ROOT, 'programs'))
    .filter(f => f.endsWith('.json'))
    .filter(f => !filters.length || filters.some(x => basename(f, '.json').includes(x.replace(/\*/g, ''))))
    .map(f => join(ROOT, 'programs', f))
    .sort()

  if (asDigest) {
    for (const file of files) {
      console.log(digestProgram(basename(file, '.json'), JSON.parse(readFileSync(file, 'utf8'))))
      console.log()
    }
    process.exit(0)
  }

  const results = files.map(f => checkProgramFile(f, { strict }))

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
      `\n${'─'.repeat(70)}\n${results.length} programas · ${nErr} errores · ${nWarn} avisos${strict ? ' (--strict)' : ''}\n`,
    )
    if (nErr) process.exit(1)
  }
}
