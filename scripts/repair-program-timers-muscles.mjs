/**
 * Reglas de reparación de `reps`→temporizador y de `muscles` en los programas.
 *
 * POR QUÉ EXISTE (issue #690)
 *
 * Muchos ejercicios sostenidos se sembraron con la duración escrita en `reps`
 * («30-45 seg») pero con `is_timer:false` y `timer_seconds:0`. La sesión solo
 * pinta la cuenta atrás cuando `is_timer` es true, así que el usuario leía
 * «30-45 seg» y no tenía ningún temporizador que darle al play. Aparte, algunas
 * filas llevan tokens de máquina en `muscles` («core, anterior_core,
 * shoulders») que se enseñan tal cual en la ficha del ejercicio.
 *
 * Este módulo es la ÚNICA definición de las dos reglas para el lado JS:
 *   - `scripts/check-program-content.mjs` las importa como guardarraíl.
 *   - La CLI de aquí abajo repara `programs/*.json` en el sitio.
 *   - `pb_migrations/1786600000_repair_program_exercise_timers_muscles.js`
 *     lleva un ESPEJO literal (el JSVM de PocketBase no puede importar), y
 *     `scripts/check-program-content.test.mjs` comprueba que no se separan.
 *
 * Uso:
 *   node scripts/repair-program-timers-muscles.mjs            # reescribe programs/*.json
 *   node scripts/repair-program-timers-muscles.mjs --check    # exit 1 si algo cambiaría
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { resolve, dirname, join, basename } from 'path'
import { fileURLToPath } from 'url'

// ── (a) Temporizadores ───────────────────────────────────────────────────────

/**
 * Una duración PURA: un número o un rango, una unidad de tiempo y, como mucho,
 * un «por lado». Nada más.
 *
 * Deliberadamente estricta. Estas NO son duraciones puras y se quedan como
 * están, porque el número que se ve no es lo que duraría el temporizador:
 *   «6x10s hold»              → seis repeticiones de diez segundos
 *   «5 × 10s hold»            → ídem
 *   «3-5 (descenso lento 3-4s)» → repeticiones con un tempo entre paréntesis
 *   «10 (3s arriba)»          → repeticiones con una pausa arriba
 *   «15 + pausa 2s»           → ídem
 *   «AMRAP 60s»               → formato de circuito
 *   «10m ida/vuelta»          → metros, no minutos
 *
 * El sufijo de lateralidad es laxo a propósito («por lado», «c/lado»,
 * «/lado», «lado» a secas, «each side»): no cambia lo que dura UNA serie, así
 * que se acepta y se ignora. Es literalmente la misma regex que
 * `packages/core/lib/exercise-timer-inference.ts`, que hace de cinturón en
 * tiempo de ejecución para las filas que esta reparación no llegue a ver; si
 * las dos se separan, el guardarraíl deja pasar filas que la app sí arregla al
 * vuelo, y el dato de la base se queda mal para siempre.
 */
export const PURE_DURATION_RE =
  /^(\d+)(?:\s*[-–]\s*(\d+))?\s*(s|seg|segs|sec|secs|segundos|min|mins|minutos)\b\s*(?:(?:por|cada|c\/|\/)?\s*lado|each side|per side)?\s*$/i

/**
 * `reps` → segundos del temporizador, o `null` si no es una duración pura.
 *
 * De un rango se coge el EXTREMO ALTO: el temporizador marca el objetivo, y
 * quedarse corto lo decide quien entrena parando antes. Al revés (contar 30 s
 * cuando el objetivo es «30-45 seg») el objetivo alto sería inalcanzable.
 */
export function inferTimerFromReps(reps) {
  const m = PURE_DURATION_RE.exec(String(reps ?? '').trim())
  if (!m) return null
  const unit = m[3].toLowerCase()
  const factor = unit.startsWith('min') ? 60 : 1
  const upper = Number(m[2] ?? m[1])
  if (!Number.isFinite(upper) || upper <= 0) return null
  return upper * factor
}

// ── (b) Músculos ─────────────────────────────────────────────────────────────

/**
 * Tokens de máquina → texto humano. Cubre los 25 tokens que existen de verdad
 * en producción (3.106 filas, censadas el 2026-09-02) más los del vocabulario
 * del catálogo que podrían llegar por una siembra futura.
 *
 * El `en` es siempre el token original capitalizado, con el guion bajo hecho
 * espacio: es el vocabulario con el que se sembró, y reescribirlo a un sinónimo
 * («thoracic» → «Thoracic spine») haría que el dato inglés dejase de casar con
 * lo que cualquier otra herramienta espera. `scripts/check-program-content.test.mjs`
 * lo comprueba entrada por entrada.
 *
 * Un token que NO esté aquí deja la fila ENTERA sin tocar: media traducción
 * («Core, shoulders») es peor que el dato original.
 */
export const MUSCLE_TOKENS = {
  abductors: { es: 'Abductores', en: 'Abductors' },
  abs: { es: 'Abdomen', en: 'Abs' },
  adductors: { es: 'Aductores', en: 'Adductors' },
  ankles: { es: 'Tobillos', en: 'Ankles' },
  anterior_core: { es: 'Core anterior', en: 'Anterior core' },
  arms: { es: 'Brazos', en: 'Arms' },
  back: { es: 'Espalda', en: 'Back' },
  balance: { es: 'Equilibrio', en: 'Balance' },
  biceps: { es: 'Bíceps', en: 'Biceps' },
  calves: { es: 'Gemelos', en: 'Calves' },
  cardio: { es: 'Cardio', en: 'Cardio' },
  cardiovascular: { es: 'Cardiovascular', en: 'Cardiovascular' },
  chest: { es: 'Pecho', en: 'Chest' },
  core: { es: 'Core', en: 'Core' },
  forearms: { es: 'Antebrazos', en: 'Forearms' },
  full_body: { es: 'Cuerpo completo', en: 'Full body' },
  glutes: { es: 'Glúteos', en: 'Glutes' },
  grip: { es: 'Agarre', en: 'Grip' },
  hamstrings: { es: 'Isquiotibiales', en: 'Hamstrings' },
  hip_flexors: { es: 'Flexores de cadera', en: 'Hip flexors' },
  hips: { es: 'Caderas', en: 'Hips' },
  lats: { es: 'Dorsales', en: 'Lats' },
  legs: { es: 'Piernas', en: 'Legs' },
  lower_back: { es: 'Lumbar', en: 'Lower back' },
  mobility: { es: 'Movilidad', en: 'Mobility' },
  neck: { es: 'Cuello', en: 'Neck' },
  obliques: { es: 'Oblicuos', en: 'Obliques' },
  posterior_chain: { es: 'Cadena posterior', en: 'Posterior chain' },
  quads: { es: 'Cuádriceps', en: 'Quads' },
  rear_delts: { es: 'Deltoides posterior', en: 'Rear delts' },
  rotator_cuff: { es: 'Manguito rotador', en: 'Rotator cuff' },
  scapula: { es: 'Escápulas', en: 'Scapula' },
  serratus: { es: 'Serrato', en: 'Serratus' },
  shoulders: { es: 'Hombros', en: 'Shoulders' },
  spine: { es: 'Columna', en: 'Spine' },
  thoracic: { es: 'Columna torácica', en: 'Thoracic' },
  traps: { es: 'Trapecio', en: 'Traps' },
  triceps: { es: 'Tríceps', en: 'Triceps' },
  upper_back: { es: 'Espalda alta', en: 'Upper back' },
  wrists: { es: 'Muñecas', en: 'Wrists' },
}

/**
 * Tokens que son inequívocamente ingleses.
 *
 * `core`, `cardio`, `cardiovascular` y `balance` NO están aquí a propósito: se
 * escriben igual (o casi) en español y son texto humano perfectamente válido
 * escrito por una persona. Un `muscles` que sea solo eso («core», «core,
 * balance») se queda como está; solo entra a traducir si lo acompaña un token
 * de esta lista o algo con `_`.
 */
export const ENGLISH_ONLY_TOKENS = new Set([
  'abductors', 'abs', 'adductors', 'ankles', 'arms', 'back', 'biceps',
  'calves', 'chest', 'forearms', 'glutes', 'grip', 'hamstrings', 'hips',
  'lats', 'legs', 'mobility', 'neck', 'obliques', 'quads', 'scapula',
  'serratus', 'shoulders', 'spine', 'thoracic', 'traps', 'triceps', 'wrists',
])

/**
 * `true` si el texto lleva tokens de máquina que hay que humanizar.
 *
 * Dos puertas, y las dos son conservadoras:
 *
 *   1. Un guion bajo no aparece en texto escrito por una persona. Basta.
 *   2. Si no lo hay, hacen falta las DOS cosas: que TODOS los tokens estén en
 *      el diccionario y que al menos uno sea inequívocamente inglés.
 *
 * El «todos» es lo que protege el texto humano mezclado. «Espalda, lats» tiene
 * un token inglés, pero «espalda» no está en el diccionario: es una lista
 * escrita a mano, no una siembra de máquina, y traducir media lista o marcarla
 * como rota son las dos cosas peores que dejarla en paz. El «al menos uno»
 * protege lo ambiguo: «core» y «core, balance» se escriben igual en español.
 */
export function needsMuscleRepair(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return false
  if (raw.includes('_')) return true
  const tokens = splitMuscleTokens(raw)
  if (!tokens.length) return false
  if (!tokens.every(t => MUSCLE_TOKENS[t])) return false
  return tokens.some(t => ENGLISH_ONLY_TOKENS.has(t))
}

/** Trocea por comas y, dentro de cada trozo, por espacios si hace falta. */
function splitMuscleTokens(text) {
  return String(text ?? '')
    .split(/\s*,\s*/)
    .flatMap(part => {
      const t = part.trim().toLowerCase()
      if (!t) return []
      // Un trozo que ya es un token conocido no se parte más, por si alguna
      // vez entra en el diccionario una clave con espacio dentro.
      if (MUSCLE_TOKENS[t]) return [t]
      return t.split(/\s+/).filter(Boolean)
    })
}

/**
 * Texto de músculos → `{ es, en }` humano, o `null` si no hay nada que hacer o
 * si algún token se sale del diccionario (en cuyo caso la fila se deja intacta
 * y quien llama lo registra).
 */
export function repairMusclesText(text) {
  if (!needsMuscleRepair(text)) return null
  const tokens = splitMuscleTokens(text)
  const out = { es: [], en: [] }
  for (const t of tokens) {
    const hit = MUSCLE_TOKENS[t]
    if (!hit) return null // token desconocido → fila entera intacta
    out.es.push(hit.es)
    out.en.push(hit.en)
  }
  if (!out.es.length) return null
  return { es: out.es.join(', '), en: out.en.join(', ') }
}

/** Tokens de un texto que la reparación no sabe traducir (para el log). */
export function unknownMuscleTokens(text) {
  if (!needsMuscleRepair(text)) return []
  return [...new Set(splitMuscleTokens(text).filter(t => !MUSCLE_TOKENS[t]))]
}

// ── Reparación de un ejercicio de `programs/*.json` ──────────────────────────

/** Texto de un campo que puede ser cadena plana o `{es,en}`. */
export const muscleTextOf = v =>
  v && typeof v === 'object' ? String(v.es ?? v.en ?? '') : String(v ?? '')

/**
 * Aplica las dos reglas a un ejercicio de `programs/*.json`.
 *
 * Devuelve `{ exercise, changes }`. `exercise` puede ser un objeto NUEVO: los
 * ficheros omiten `timer_seconds` cuando `is_timer` es false, y al encenderlo
 * hay que reinsertar la clave justo detrás de `is_timer` en vez de al final,
 * o el diff sale desordenado respecto al resto de ejercicios.
 */
export function repairExercise(ex) {
  const changes = []
  let out = ex

  if (!ex.is_timer) {
    const seconds = inferTimerFromReps(ex.reps)
    if (seconds !== null) {
      // Un `timer_seconds` puesto a mano gana sobre el inferido.
      const value = ex.timer_seconds || seconds
      out = {}
      for (const [k, v] of Object.entries(ex)) {
        if (k === 'timer_seconds') continue
        out[k] = k === 'is_timer' ? true : v
        if (k === 'is_timer') out.timer_seconds = value
      }
      changes.push(`timer: "${ex.reps}" → is_timer:true, timer_seconds:${value}`)
    }
  }

  const text = muscleTextOf(out.muscles)
  if (needsMuscleRepair(text)) {
    const fixed = repairMusclesText(text)
    if (fixed) {
      // En `programs/*.json` `muscles` es una cadena plana; se respeta la forma
      // que ya tenga la fila para no cambiar el esquema del fichero.
      out.muscles = out.muscles && typeof out.muscles === 'object' ? fixed : fixed.es
      changes.push(`muscles: "${text}" → "${muscleTextOf(out.muscles)}"`)
    } else {
      changes.push(`AVISO muscles sin traducir: "${text}" (${unknownMuscleTokens(text).join(', ')})`)
    }
  }

  return { exercise: out, changes }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const isMain = import.meta.url === `file://${process.argv[1]}`

if (isMain) {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const ROOT = resolve(__dirname, '..')
  const checkOnly = process.argv.slice(2).includes('--check')

  const files = readdirSync(join(ROOT, 'programs'))
    .filter(f => f.endsWith('.json'))
    .sort()

  let touched = 0
  let warned = 0

  for (const file of files) {
    const path = join(ROOT, 'programs', file)
    const before = readFileSync(path, 'utf8')
    const doc = JSON.parse(before)
    const lines = []

    for (const phase of doc.phases ?? []) {
      for (const day of phase.days ?? []) {
        const list = day.exercises ?? []
        for (let i = 0; i < list.length; i++) {
          const { exercise, changes } = repairExercise(list[i])
          list[i] = exercise
          for (const c of changes) {
            if (c.startsWith('AVISO')) warned++
            lines.push(`    fase ${phase.phase_number} · ${day.day_id} · #${exercise.sort_order}  ${c}`)
          }
        }
      }
    }

    // Mismo formato que los ficheros existentes: 2 espacios y salto final.
    const after = JSON.stringify(doc, null, 2) + '\n'
    if (after !== before) {
      touched++
      console.log(`${checkOnly ? '✗' : '·'} ${basename(file)}`)
      for (const l of lines) console.log(l)
      if (!checkOnly) writeFileSync(path, after, 'utf8')
    } else if (lines.length) {
      for (const l of lines) console.log(`  ${basename(file)}\n${l}`)
    }
  }

  console.log(
    `\n${files.length} programas · ${touched} ficheros ${checkOnly ? 'cambiarían' : 'reescritos'}` +
    (warned ? ` · ${warned} avisos` : ''),
  )
  if (checkOnly && touched) {
    console.error('Ejecuta `node scripts/repair-program-timers-muscles.mjs` y vuelve a comprobar.')
    process.exit(1)
  }
}
