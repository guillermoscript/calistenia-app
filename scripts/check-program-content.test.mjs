/**
 * check-program-content.test.mjs — Unit tests for checkProgram().
 *
 * Fixtures live in memory (no disk I/O): each test builds a minimal-but-valid
 * program doc via `baseProgram()` and mutates only the field under test, so a
 * failing assertion points at exactly one broken rule instead of a pile of
 * unrelated content gaps.
 *
 * `baseProgram()` uses real exercise-catalog ids (bodyweight, no equipment) and
 * a real `program-catalog.mjs` slug (`principiante-fundamentos`: generalist,
 * no declared equipment) so the catalog-cross-checks (#2, #6) exercise their
 * real lookup tables instead of a synthetic stand-in.
 *
 * Run with: pnpm --filter @calistenia/core exec vitest run ../../scripts/check-program-content.test.mjs
 * Or:       node --experimental-vm-modules packages/core/node_modules/.bin/vitest run scripts/check-program-content.test.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { checkProgram } from './check-program-content.mjs'
import {
  PURE_DURATION_RE,
  MUSCLE_TOKENS,
  ENGLISH_ONLY_TOKENS,
  inferTimerFromReps,
  needsMuscleRepair,
  repairMusclesText,
} from './repair-program-timers-muscles.mjs'

const SLUG = 'principiante-fundamentos' // generalist, equipment_required: []

function exercise(overrides = {}) {
  return {
    sort_order: 1,
    name: 'Ejercicio de prueba',
    exercise_id: '90_degree_push_up',
    muscles: '',
    sets: 10,
    reps: '10',
    rest_seconds: 60,
    priority: 'primary',
    ...overrides,
  }
}

/** Programa mínimo que pasa las 9 comprobaciones sin errores ni avisos. */
function baseProgram() {
  return {
    program: {
      name: 'Principiante · Fundamentos',
      description: 'Programa de prueba',
      difficulty: 'beginner',
      duration_weeks: 8,
      instructions: { es: 'Sube el peso cuando completes todas las series.', en: 'Add weight once you complete every set.' },
    },
    phases: [
      {
        phase_number: 1,
        name: 'Fase 1',
        weeks: '1-4',
        days: [
          {
            day_id: 'lun',
            day_name: 'Lunes',
            exercises: [
              exercise({ sort_order: 1, name: '90° Push-up', exercise_id: '90_degree_push_up' }), // push
              exercise({ sort_order: 2, name: 'Arquero de pie', exercise_id: 'standing_archer' }), // pull
              exercise({ sort_order: 3, name: 'Abdominal con patada de piernas', exercise_id: 'kick_out_sit' }), // legs
            ],
          },
        ],
      },
    ],
  }
}

describe('checkProgram — programa correcto', () => {
  it('un programa bien formado no reporta errores', () => {
    const { errors } = checkProgram(SLUG, baseProgram())
    expect(errors).toEqual([])
  })
})

describe('checkProgram — exercise_id que no resuelve', () => {
  it('un id ausente del catálogo es un error', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises[0].exercise_id = 'ejercicio_que_no_existe_en_el_catalogo'
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('no resuelve contra el catálogo'))).toBe(true)
  })
})

describe('checkProgram — name como slug', () => {
  it('un nombre con forma de slug (snake_case) es un error', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises[0].name = 'pushup_std'
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('es un slug, no un nombre'))).toBe(true)
  })
})

describe('checkProgram — patrón de movimiento a 0 series', () => {
  it('0 series de push en un programa generalista es un error', () => {
    const doc = baseProgram()
    // Quita el ejercicio de push; deja solo pull y legs.
    doc.phases[0].days[0].exercises = doc.phases[0].days[0].exercises.filter(
      ex => ex.exercise_id !== '90_degree_push_up',
    )
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('0 series de push'))).toBe(true)
  })
})

describe('checkProgram — instructions vacío', () => {
  it('sin program.instructions es un error', () => {
    const doc = baseProgram()
    doc.program.instructions = ''
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('instructions vacío'))).toBe(true)
  })
})

// ── #690: temporizadores y músculos ──────────────────────────────────────────

describe('checkProgram — duración en reps sin temporizador (#690)', () => {
  it('reps "20-30s" con is_timer:false es un error', () => {
    const doc = baseProgram()
    Object.assign(doc.phases[0].days[0].exercises[0], { reps: '20-30s', is_timer: false })
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('la sesión no pinta el temporizador'))).toBe(true)
  })

  it('reps "20-30s por lado" también dispara: el «por lado» no lo deja de ser', () => {
    const doc = baseProgram()
    Object.assign(doc.phases[0].days[0].exercises[0], { reps: '20-30s por lado', is_timer: false })
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('la sesión no pinta el temporizador'))).toBe(true)
  })

  it('reps "30-45 seg" con el temporizador ya encendido no reporta nada', () => {
    const doc = baseProgram()
    Object.assign(doc.phases[0].days[0].exercises[0], {
      reps: '30-45 seg', is_timer: true, timer_seconds: 45,
    })
    const { errors } = checkProgram(SLUG, doc)
    expect(errors).toEqual([])
  })

  it('"6x10s hold" son seis repeticiones de diez segundos, no una duración', () => {
    const doc = baseProgram()
    Object.assign(doc.phases[0].days[0].exercises[0], { reps: '6x10s hold', is_timer: false })
    const { errors } = checkProgram(SLUG, doc)
    expect(errors).toEqual([])
  })

  it('"10 (3s arriba)" son repeticiones con tempo, no una duración', () => {
    const doc = baseProgram()
    Object.assign(doc.phases[0].days[0].exercises[0], { reps: '10 (3s arriba)', is_timer: false })
    const { errors } = checkProgram(SLUG, doc)
    expect(errors).toEqual([])
  })

  it('"10 c/lado" son repeticiones por lado, no una duración', () => {
    const doc = baseProgram()
    Object.assign(doc.phases[0].days[0].exercises[0], { reps: '10 c/lado', is_timer: false })
    const { errors } = checkProgram(SLUG, doc)
    expect(errors).toEqual([])
  })

  it('is_timer:true sin timer_seconds es un error: la cuenta atrás arranca en 0', () => {
    const doc = baseProgram()
    Object.assign(doc.phases[0].days[0].exercises[0], { reps: '30s', is_timer: true, timer_seconds: 0 })
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('la cuenta atrás arranca en 0'))).toBe(true)
  })
})

describe('checkProgram — tokens de máquina en muscles (#690)', () => {
  it('"core, anterior_core, shoulders" es un error', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises[0].muscles = 'core, anterior_core, shoulders'
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('tokens de máquina'))).toBe(true)
  })

  it('un token inglés suelto sin guion bajo ("back, lats") también dispara', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises[0].muscles = 'back, lats'
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('tokens de máquina'))).toBe(true)
  })

  it('un token fuera del diccionario se nombra en el error', () => {
    // Solo llega aquí por la puerta del guion bajo: sin él, una lista con un
    // token desconocido se considera texto humano y ni siquiera dispara.
    const doc = baseProgram()
    doc.phases[0].days[0].exercises[0].muscles = 'shoulders, cosa_rara'
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('fuera del diccionario: cosa_rara'))).toBe(true)
  })

  it('una lista mezclada sin guion bajo es texto humano y no se marca', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises[0].muscles = 'Espalda, lats'
    const { errors } = checkProgram(SLUG, doc)
    expect(errors).toEqual([])
  })

  it('texto humano en español pasa intacto', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises[0].muscles = 'Hombros, movilidad articular'
    const { errors } = checkProgram(SLUG, doc)
    expect(errors).toEqual([])
  })

  it('"core" y "cardiovascular" a secas son español válido y no disparan', () => {
    for (const m of ['core', 'cardiovascular', 'balance', 'abdomen', 'pectoral']) {
      const doc = baseProgram()
      doc.phases[0].days[0].exercises[0].muscles = m
      expect(checkProgram(SLUG, doc).errors, m).toEqual([])
    }
  })
})

// ── Anti-deriva: el espejo de la migración ───────────────────────────────────
//
// El JSVM de PocketBase no puede importar módulos, así que
// `pb_migrations/1786600000_repair_program_exercise_timers_muscles.js` lleva
// una copia literal de la regex y del diccionario. Si las dos se separan, la
// migración repara producción con un criterio distinto del que vigila el
// guardarraíl — y nadie se entera. Esto lo caza.

describe('la migración 1786600000 es un espejo fiel de las reglas', () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'pb_migrations', '1786600000_repair_program_exercise_timers_muscles.js'),
    'utf8',
  )

  it('la regex de duración pura es la misma', () => {
    const m = /const PURE_DURATION_RE\s*=\s*\n?\s*(\/.+\/i)\s*\n/.exec(source)
    expect(m, 'no se encontró PURE_DURATION_RE en la migración').not.toBeNull()
    expect(m[1]).toBe(String(PURE_DURATION_RE))
  })

  it('el diccionario de músculos es el mismo (claves y traducciones)', () => {
    const block = /const MUSCLE_TOKENS = \{([\s\S]*?)\n  \}/.exec(source)
    expect(block, 'no se encontró MUSCLE_TOKENS en la migración').not.toBeNull()
    const mirror = {}
    for (const [, key, es, en] of block[1].matchAll(
      /^\s+([a-z_]+): \{ es: "([^"]*)", en: "([^"]*)" \},$/gm,
    )) {
      mirror[key] = { es, en }
    }
    expect(mirror).toEqual(MUSCLE_TOKENS)
  })

  it('la lista de tokens solo-ingleses es la misma', () => {
    const block = /const ENGLISH_ONLY_LIST = \[([\s\S]*?)\n  \]/.exec(source)
    expect(block, 'no se encontró ENGLISH_ONLY_LIST en la migración').not.toBeNull()
    const mirror = [...block[1].matchAll(/"([a-z_]+)"/g)].map(m => m[1])
    expect(new Set(mirror)).toEqual(ENGLISH_ONLY_TOKENS)
  })
})

describe('checkProgram — el sufijo de lateralidad no rompe la duración (#690)', () => {
  // La misma regla vive en `packages/core/lib/exercise-timer-inference.ts`
  // como cinturón en tiempo de ejecución. Si el guardarraíl fuese más estricto,
  // dejaría entrar filas que la app arregla al vuelo pero el dato no.
  for (const reps of ['30s/lado', '20-30s por lado', '30-40 seg c/lado', '20-30s lado', '45s each side']) {
    it(`"${reps}" con is_timer:false es un error`, () => {
      const doc = baseProgram()
      Object.assign(doc.phases[0].days[0].exercises[0], { reps, is_timer: false })
      const { errors } = checkProgram(SLUG, doc)
      expect(errors.some(e => e.includes('la sesión no pinta el temporizador'))).toBe(true)
    })
  }
})

// ── Las reglas en crudo ──────────────────────────────────────────────────────

describe('inferTimerFromReps — segundos, no solo sí/no', () => {
  // El sufijo de lateralidad se acepta en todas sus formas y no cambia lo que
  // dura UNA serie, así que no toca los segundos. La forma con barra existe de
  // verdad en producción («30s/lado», Mujer · Full Body Toning).
  const DURACIONES = {
    '30s/lado': 30,
    '20-30 seg/lado': 30,
    '30s / lado': 30,
    '45s /lado': 45,
    '20-30s por lado': 30,
    '30-40 seg c/lado': 40,
    '45s each side': 45,
    '30-45 seg': 45,
    '30s': 30,
    '12-18s': 18,
    '2 min': 120,
    '1-2 minutos': 120,
  }
  for (const [reps, seconds] of Object.entries(DURACIONES)) {
    it(`"${reps}" → ${seconds} s`, () => {
      expect(inferTimerFromReps(reps)).toBe(seconds)
    })
  }

  // El número que se ve no es lo que duraría el temporizador.
  for (const reps of ['6x10s hold', '5 × 10s hold', '3-5 (descenso lento 3-4s)', '10 (3s arriba)', '15 + pausa 2s', 'AMRAP 60s', '10m ida/vuelta', '10 c/lado', '8-12', 'al fallo', 'máx', '']) {
    it(`"${reps}" no es una duración`, () => {
      expect(inferTimerFromReps(reps)).toBeNull()
    })
  }
})

describe('needsMuscleRepair — las dos puertas', () => {
  it('un guion bajo basta por sí solo', () => {
    expect(needsMuscleRepair('full_body')).toBe(true)
    expect(needsMuscleRepair('core, anterior_core, shoulders')).toBe(true)
  })

  it('sin guion bajo hace falta un token inequívocamente inglés', () => {
    expect(needsMuscleRepair('core, shoulders')).toBe(true)
    expect(needsMuscleRepair('back, lats, scapula')).toBe(true)
  })

  it('lo ambiguo en español se queda como está', () => {
    for (const t of ['core', 'cardiovascular', 'balance', 'cardio', 'core, balance']) {
      expect(needsMuscleRepair(t), t).toBe(false)
    }
  })

  it('una lista humana con un token inglés dentro no se toca: traducirla a medias es peor', () => {
    // «espalda» no está en el diccionario, así que la lista es de una persona,
    // no de una siembra de máquina.
    expect(needsMuscleRepair('Espalda, lats')).toBe(false)
    expect(needsMuscleRepair('Hombros, movilidad articular')).toBe(false)
    expect(needsMuscleRepair('Pecho, tríceps, potencia')).toBe(false)
  })

  it('un texto con guion bajo y un token desconocido se deja entero y se registra', () => {
    expect(needsMuscleRepair('shoulders, cosa_rara')).toBe(true)
    expect(repairMusclesText('shoulders, cosa_rara')).toBeNull()
  })
})

describe('el diccionario de músculos cubre el censo de producción', () => {
  // 3.106 filas censadas el 2026-09-02: 16 con guion bajo y 58 listas inglesas
  // sin él. Si una siembra futura trae un token nuevo, esta lista lo caza antes
  // de que la migración deje filas sin traducir.
  const PROD_TOKENS = [
    'adductors', 'anterior_core', 'arms', 'back', 'balance', 'biceps',
    'cardiovascular', 'chest', 'core', 'full_body', 'glutes', 'hamstrings',
    'hip_flexors', 'hips', 'lats', 'obliques', 'quads', 'rear_delts',
    'rotator_cuff', 'scapula', 'shoulders', 'spine', 'thoracic', 'traps',
    'triceps',
  ]
  it('los 25 tokens de prod están en el diccionario', () => {
    expect(PROD_TOKENS.filter(t => !MUSCLE_TOKENS[t])).toEqual([])
  })

  it('el `en` es siempre el token original capitalizado', () => {
    // Reescribirlo a un sinónimo («thoracic» → «Thoracic spine») haría que el
    // dato inglés dejase de casar con el vocabulario con el que se sembró.
    const wrong = Object.entries(MUSCLE_TOKENS)
      .filter(([k, v]) => v.en !== k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()))
      .map(([k]) => k)
    expect(wrong).toEqual([])
  })

  it('todo token inequívocamente inglés tiene traducción', () => {
    expect([...ENGLISH_ONLY_TOKENS].filter(t => !MUSCLE_TOKENS[t])).toEqual([])
  })
})
