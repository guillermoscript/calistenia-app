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
import { checkProgram, digestProgram, STRICT_RULES } from './check-program-content.mjs'
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
    exercise_id: 'pushup_std',
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
              exercise({ sort_order: 1, name: 'Push-up Estándar', exercise_id: 'pushup_std' }), // push
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
      ex => ex.exercise_id !== 'pushup_std',
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

// ── Lógica de entrenamiento (#715) ───────────────────────────────────────────
//
// `checkProgram(slug, doc)` no lee el nivel, el `goal_type` ni las
// contraindicaciones del propio `doc`: todo eso sale de `SKELETONS` a través
// del `slug` que se le pasa (ver `CATALOG_BY_SLUG.get(slug)` en el fichero
// bajo prueba). Por eso muchos fixtures de aquí abajo reutilizan
// `baseProgram()` tal cual y solo cambian el slug con el que se llama a
// `checkProgram` — es la forma más corta de "un programa beginner" pasar a
// ser "un programa fat_loss" sin tocar el contenido.
//
// Los que sí necesitan más de una fase o más de un día (regresión por
// familia, días pesados seguidos, frecuencia por patrón, cardio real) se
// construyen con los helpers `day()`/`phase()`/`logicProgram()` de aquí
// abajo en vez de con `baseProgram()`.

/** Un día mínimo con los ejercicios dados. */
function day(day_id, exercises, overrides = {}) {
  return { day_id, day_name: day_id, exercises, ...overrides }
}

/** Una fase mínima con los días dados. */
function phase(phase_number, days, overrides = {}) {
  return { phase_number, name: `Fase ${phase_number}`, weeks: '1-4', days, ...overrides }
}

/** Un documento mínimo con las fases dadas; instructions sin ninguna promesa. */
function logicProgram(phases, programOverrides = {}) {
  return {
    program: {
      name: 'Programa de prueba',
      description: 'Programa de prueba',
      difficulty: 'beginner',
      duration_weeks: 8,
      instructions: {
        es: 'Sube el peso cuando completes todas las series.',
        en: 'Add weight once you complete every set.',
      },
      ...programOverrides,
    },
    phases,
  }
}

/** Solo los findings de UNA regla, para aislar el aserto de lo demás que el fixture dispare de rebote. */
function findingsFor(result, rule) {
  return result.findings.filter(f => f.rule === rule)
}

/**
 * Fase con dos días de push+pull+legs "pesados" (10 series cada patrón, por
 * encima de `HEAVY_DAY_SETS`); `secondDayId` decide si son consecutivos en
 * el calendario (p. ej. 'mar' lo es respecto a 'lun'; 'mie' no lo es).
 */
function heavyDoc(secondDayId) {
  const heavyDay = id => day(id, [
    exercise({ sort_order: 1, name: 'Push-up Estándar', exercise_id: 'pushup_std', priority: 'primary', sets: 10 }),
    exercise({ sort_order: 2, name: 'Arquero de pie', exercise_id: 'standing_archer', priority: 'primary', sets: 10 }),
    exercise({ sort_order: 3, name: 'Abdominal con patada de piernas', exercise_id: 'kick_out_sit', priority: 'primary', sets: 10 }),
  ])
  return logicProgram([phase(1, [heavyDay('lun'), heavyDay(secondDayId)])])
}

describe('checkProgram — tope de dificultad por nivel del programa (L1, #715)', () => {
  it('un ejercicio advanced en un programa beginner es un aviso', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises.push(
      exercise({ sort_order: 4, name: 'Remo a un brazo con toalla', exercise_id: 'one_arm_towel_row', priority: 'accessory' }),
    )
    const result = checkProgram(SLUG, doc) // principiante-fundamentos: beginner
    expect(findingsFor(result, 'level_cap').some(f => f.message.includes('es advanced en un programa beginner'))).toBe(true)
  })

  it('un ejercicio advanced en la fase 1 de un programa intermediate también es un aviso', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises.push(
      exercise({ sort_order: 4, name: 'Remo a un brazo con toalla', exercise_id: 'one_arm_towel_row', priority: 'accessory' }),
    )
    const result = checkProgram('intermedio-hipertrofia', doc) // intermediate
    expect(findingsFor(result, 'level_cap').some(f => f.message.includes('es advanced en la fase 1 de un programa intermediate'))).toBe(true)
  })

  it('sin ejercicios advanced no dispara la regla', () => {
    // Ojo al elegir ids para fixtures: `90_degree_push_up` es 'advanced' en el
    // catálogo real aunque el nombre no lo deje intuir. `baseProgram()` usa
    // `pushup_std` (beginner) por eso.
    const result = checkProgram(SLUG, baseProgram())
    expect(findingsFor(result, 'level_cap')).toEqual([])
  })
})

describe('checkProgram — no-regresión por familia entre fases (L2, #715)', () => {
  it('bajar de tuck planche (advanced) en la fase 1 a planche lean (intermediate) en la fase 2 es un aviso', () => {
    const doc = logicProgram([
      phase(1, [day('lun', [exercise({ sort_order: 1, name: 'Tuck Planche', exercise_id: 'planche_tuck', priority: 'primary', sets: 5, reps: '8' })])]),
      phase(2, [day('lun', [exercise({ sort_order: 1, name: 'Planche Lean', exercise_id: 'planche_lean', priority: 'primary', sets: 5, reps: '8' })])]),
    ])
    const result = checkProgram('planche-roadmap', doc)
    const hits = findingsFor(result, 'family_regression')
    expect(hits.some(f => f.message.includes('familia planche: la fase 1 llega a') && f.message.includes('baja a'))).toBe(true)
  })

  it('subir de planche lean a tuck planche entre fases no es una regresión', () => {
    const doc = logicProgram([
      phase(1, [day('lun', [exercise({ sort_order: 1, name: 'Planche Lean', exercise_id: 'planche_lean', priority: 'primary', sets: 5, reps: '8' })])]),
      phase(2, [day('lun', [exercise({ sort_order: 1, name: 'Tuck Planche', exercise_id: 'planche_tuck', priority: 'primary', sets: 5, reps: '8' })])]),
    ])
    const result = checkProgram('planche-roadmap', doc)
    expect(findingsFor(result, 'family_regression')).toEqual([])
  })
})

describe('checkProgram — contraindicaciones derivadas del contenido (L3, #715)', () => {
  it('un ejercicio de impacto sin "knee" declarado en SKELETONS es un aviso', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises.push(
      exercise({ sort_order: 4, name: 'Sentadilla con Salto', exercise_id: 'jump_squat', priority: 'accessory' }),
    )
    const result = checkProgram('planche-roadmap', doc) // contraindications: wrist, shoulder, elbow — sin knee
    expect(findingsFor(result, 'contraindications').some(f => f.message.includes('no declara knee'))).toBe(true)
  })

  it('chinup no dispara la contraindicación de muñeca aunque su `family` de catálogo esté mal etiquetada', () => {
    // El catálogo trae a `chinup` con `family: 'handstand'` (lo arregla #714).
    // La regla solo confía en `family` para categoría `skill`; `chinup` es
    // `pull`, así que el disparador de apoyo invertido/planche tampoco lo
    // alcanza por id (su regex no casa con "chinup").
    const doc = baseProgram()
    doc.phases[0].days[0].exercises.push(
      exercise({ sort_order: 4, name: 'Chin-up (agarre supino)', exercise_id: 'chinup', priority: 'accessory' }),
    )
    const result = checkProgram('principiante-ganar-musculo', doc) // contraindications: shoulder, elbow, knee — sin wrist
    expect(findingsFor(result, 'contraindications')).toEqual([])
  })
})

describe('checkProgram — descarga prometida sin codificar (L4, #716 / #715)', () => {
  it('instructions promete una descarga y ninguna fase la codifica', () => {
    const doc = baseProgram()
    doc.program.instructions.es = 'Sube el peso cada semana. Incluye una semana de descarga al final del bloque.'
    const result = checkProgram(SLUG, doc)
    expect(findingsFor(result, 'deload_promise').some(f => f.message.includes('promete una descarga y ninguna fase la codifica'))).toBe(true)
  })

  it('con `day_type: "deload"` en un día, la promesa queda codificada y no dispara', () => {
    const doc = baseProgram()
    doc.program.instructions.es = 'Sube el peso cada semana. Incluye una semana de descarga al final del bloque.'
    doc.phases[0].days[0].day_type = 'deload'
    const result = checkProgram(SLUG, doc)
    expect(findingsFor(result, 'deload_promise')).toEqual([])
  })
})

describe('checkProgram — fat_loss: cardio real por fase (L5, #718 / #715)', () => {
  it('sin bloques de cardio cronometrado en un fat_loss es un aviso', () => {
    const result = checkProgram('principiante-quema-grasa', baseProgram())
    expect(findingsFor(result, 'fat_loss_cardio').some(f => f.message.includes('bloque(s) de cardio cronometrado'))).toBe(true)
  })

  it('dos días `day_type: "circuit"` en la fase cubren el mínimo exigido', () => {
    const circuitDay = id => day(id, [
      exercise({ sort_order: 1, exercise_id: 'pushup_std', priority: 'primary', sets: 10 }),
      exercise({ sort_order: 2, exercise_id: 'standing_archer', priority: 'primary', sets: 10 }),
      exercise({ sort_order: 3, exercise_id: 'kick_out_sit', priority: 'primary', sets: 10 }),
    ], { day_type: 'circuit' })
    const doc = logicProgram([phase(1, [circuitDay('lun'), circuitDay('jue')])])
    const result = checkProgram('principiante-quema-grasa', doc)
    expect(findingsFor(result, 'fat_loss_cardio')).toEqual([])
  })
})

describe('checkProgram — fat_loss: párrafo de nutrición (L5, #718 / #715)', () => {
  it('instructions sin "déficit"/"deficit" en un fat_loss es un aviso', () => {
    const result = checkProgram('principiante-quema-grasa', baseProgram())
    expect(findingsFor(result, 'fat_loss_nutrition').some(f => f.message.includes('sin el párrafo de nutrición'))).toBe(true)
  })

  it('"déficit" en es y "deficit" en en cumplen el marcador', () => {
    const doc = baseProgram()
    doc.program.instructions = {
      es: 'Mantén un déficit calórico moderado y sube el peso cuando puedas.',
      en: 'Keep a moderate caloric deficit and add weight when you can.',
    }
    const result = checkProgram('principiante-quema-grasa', doc)
    expect(findingsFor(result, 'fat_loss_nutrition')).toEqual([])
  })
})

describe('checkProgram — patrón pesado en dos días de calendario seguidos (L6, #715)', () => {
  it('más de 8 series de empuje en lunes y martes (seguidos) es un aviso', () => {
    const result = checkProgram('principiante-fundamentos', heavyDoc('mar'))
    expect(findingsFor(result, 'heavy_consecutive_days').some(f => f.message.includes('series de empuje en dos días seguidos'))).toBe(true)
  })

  it('lunes y miércoles no son días seguidos: no dispara', () => {
    const result = checkProgram('principiante-fundamentos', heavyDoc('mie'))
    expect(findingsFor(result, 'heavy_consecutive_days')).toEqual([])
  })
})

describe('checkProgram — frecuencia por patrón en muscle_gain (L7, #715)', () => {
  it('un patrón presente en un solo día de la fase es un aviso', () => {
    const result = checkProgram('principiante-ganar-musculo', baseProgram())
    expect(findingsFor(result, 'pattern_frequency').some(f => f.message.includes('solo 1 día/semana en un muscle_gain'))).toBe(true)
  })

  it('el mismo patrón en dos días de la fase cubre el mínimo', () => {
    const fullDay = id => day(id, [
      exercise({ sort_order: 1, exercise_id: 'pushup_std', priority: 'primary', sets: 10 }),
      exercise({ sort_order: 2, exercise_id: 'standing_archer', priority: 'primary', sets: 10 }),
      exercise({ sort_order: 3, exercise_id: 'kick_out_sit', priority: 'primary', sets: 10 }),
    ])
    const doc = logicProgram([phase(1, [fullDay('lun'), fullDay('jue')])])
    const result = checkProgram('principiante-ganar-musculo', doc)
    expect(findingsFor(result, 'pattern_frequency')).toEqual([])
  })
})

describe('checkProgram — ejercicio prometido en el texto (L8, #715)', () => {
  it('el texto promete un dead hang y ningún ejercicio del contenido lo es', () => {
    const doc = baseProgram()
    doc.program.instructions.es = 'Incluye un dead hang al final de cada sesión.'
    const result = checkProgram(SLUG, doc)
    expect(findingsFor(result, 'promised_exercise').some(f => f.message.includes('promete dead hang'))).toBe(true)
  })

  it('con un ejercicio de id "dead_hang" en el contenido, la promesa queda cumplida', () => {
    const doc = baseProgram()
    doc.program.instructions.es = 'Incluye un dead hang al final de cada sesión.'
    doc.phases[0].days[0].exercises.push(
      exercise({ sort_order: 4, name: 'Suspensión en Barra', exercise_id: 'dead_hang', priority: 'accessory' }),
    )
    const result = checkProgram('principiante-ganar-musculo', doc) // declara pull_bar
    expect(findingsFor(result, 'promised_exercise')).toEqual([])
  })
})

describe('checkProgram — --strict promueve solo las reglas de STRICT_RULES', () => {
  it('level_cap es aviso por defecto y error con --strict', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises.push(
      exercise({ sort_order: 4, name: 'Remo a un brazo con toalla', exercise_id: 'one_arm_towel_row', priority: 'accessory' }),
    )
    const loose = checkProgram(SLUG, doc)
    expect(loose.warnings.some(w => w.includes('es advanced en un programa beginner'))).toBe(true)
    expect(loose.errors.some(e => e.includes('es advanced en un programa beginner'))).toBe(false)

    const strict = checkProgram(SLUG, doc, { strict: true })
    expect(strict.errors.some(e => e.includes('es advanced en un programa beginner'))).toBe(true)
    expect(strict.warnings.some(w => w.includes('es advanced en un programa beginner'))).toBe(false)
  })

  it('heavy_consecutive_days no está en STRICT_RULES y se queda en aviso incluso con --strict', () => {
    expect(STRICT_RULES.has('heavy_consecutive_days')).toBe(false)
    const strict = checkProgram('principiante-fundamentos', heavyDoc('mar'), { strict: true })
    expect(strict.warnings.some(w => w.includes('series de empuje en dos días seguidos'))).toBe(true)
    expect(strict.errors.some(e => e.includes('series de empuje en dos días seguidos'))).toBe(false)
  })
})

describe('checkProgram — findings', () => {
  it('cada finding trae una regla no vacía y "findings" mide lo mismo que errors + warnings', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises.push(
      exercise({ sort_order: 4, name: 'Sentadilla con Salto', exercise_id: 'jump_squat', priority: 'accessory' }),
    )
    // planche-roadmap + --strict: contraindications (error) + equipment no usado (aviso) —
    // mezcla deliberada de error y aviso para que la suma no case por casualidad.
    const { errors, warnings, findings } = checkProgram('planche-roadmap', doc, { strict: true })
    expect(errors.length).toBeGreaterThan(0)
    expect(warnings.length).toBeGreaterThan(0)
    expect(findings.length).toBe(errors.length + warnings.length)
    expect(findings.every(f => typeof f.rule === 'string' && f.rule.length > 0)).toBe(true)
  })
})

describe('checkProgram — baseProgram() en modo --strict', () => {
  // Sus instructions no prometen descarga ni ningún ejercicio de la lista de
  // #715, su slug (principiante-fundamentos) es `maintain` y ninguno de sus
  // ejercicios es advanced: el fixture base tiene que seguir limpio también
  // cuando las reglas de lógica son errores.
  it('no reporta errores', () => {
    const { errors } = checkProgram(SLUG, baseProgram(), { strict: true })
    expect(errors).toEqual([])
  })
})

describe('digestProgram', () => {
  it('un timer con reps de rango muestra el rango y el timer entre paréntesis', () => {
    const doc = baseProgram()
    Object.assign(doc.phases[0].days[0].exercises[0], { reps: '20-30 s', is_timer: true, timer_seconds: 30 })
    const out = digestProgram(SLUG, doc)
    expect(out).toContain('20-30 s')
    expect(out).toContain('(timer 30 s)')
  })

  it('un timer sin reps cae a los segundos a secas, sin el sufijo "(timer ...)"', () => {
    const doc = baseProgram()
    Object.assign(doc.phases[0].days[0].exercises[0], { reps: '', is_timer: true, timer_seconds: 30 })
    const out = digestProgram(SLUG, doc)
    expect(out).toContain('30 s')
    expect(out).not.toContain('(timer')
  })
})
