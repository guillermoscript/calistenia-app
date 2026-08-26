import { describe, it, expect } from 'vitest'
import {
  suggestProgression,
  parseSets,
  parseTarget,
  readTarget,
  DEFAULT_REPS_CAP,
  DEFAULT_SECONDS_CAP,
  type ProgressionExercise,
  type ProgressionSession,
  type VariantRef,
} from './autoProgression'

/** Flexión de rodillas: 3×10, prescripción típica del catálogo. */
const pushupKnee: ProgressionExercise = {
  id: 'pushup_knee',
  sets: 3,
  reps: '10',
  isTimer: false,
}

/** Plancha: 3×30 s. Los segundos viven en `reps` Y en `timerSeconds`. */
const plank: ProgressionExercise = {
  id: 'plank',
  sets: 3,
  reps: '30',
  isTimer: true,
  timerSeconds: 30,
}

/** Dos sesiones con las mismas series, la más antigua primero a propósito. */
const twoSessions = (values: number[]): ProgressionSession[] => [
  { date: '2026-08-18', values },
  { date: '2026-08-21', values },
]

const harderIs = (ref: VariantRef) => () => ref
const noHarder = () => null

describe('parseSets', () => {
  it('acepta el número y la cadena numérica', () => {
    expect(parseSets(3)).toBe(3)
    expect(parseSets('3')).toBe(3)
  })

  it('rechaza las series no numéricas del catálogo', () => {
    // `Exercise.sets` admite «múltiples» / «intentos»: no hay dosis que subir.
    expect(parseSets('múltiples')).toBeNull()
    expect(parseSets(0)).toBeNull()
  })
})

describe('parseTarget', () => {
  it('en un rango el objetivo es el tope', () => {
    // Es el número que hay que batir, y el mismo criterio que `parseRepsForPR`.
    expect(parseTarget('8-12')).toBe(12)
  })

  it('sin dígitos no hay objetivo', () => {
    expect(parseTarget('máximas')).toBeNull()
    expect(parseTarget('al fallo')).toBeNull()
    expect(parseTarget('')).toBeNull()
  })
})

describe('readTarget', () => {
  it('en temporizador manda `timerSeconds` sobre el texto', () => {
    // El texto puede haberse quedado atrás; la cuenta atrás real es la que el
    // usuario ha estado batiendo.
    const ex = { ...plank, reps: '20', timerSeconds: 45 }
    expect(readTarget(ex)).toEqual({ unit: 'seconds', target: 45, sets: 3 })
  })

  it('sin `timerSeconds` cae al texto, y sigue siendo segundos', () => {
    const ex: ProgressionExercise = { id: 'plank', sets: 3, reps: '40', isTimer: true }
    expect(readTarget(ex)).toEqual({ unit: 'seconds', target: 40, sets: 3 })
  })

  it('un ejercicio normal se lee en repeticiones', () => {
    expect(readTarget(pushupKnee)).toEqual({ unit: 'reps', target: 10, sets: 3 })
  })
})

describe('suggestProgression — subir la dosis', () => {
  it('dos sesiones cumpliendo justo el objetivo suben una repetición', () => {
    const out = suggestProgression(pushupKnee, twoSessions([10, 10, 10]))
    expect(out).toEqual({ kind: 'dose', unit: 'reps', sets: 3, from: 10, to: 11 })
  })

  it('con margen amplio sube dos', () => {
    // Todas las series dos pasos por encima en las dos sesiones: la
    // prescripción se ha quedado corta, no es que «cumpliera».
    const out = suggestProgression(pushupKnee, twoSessions([12, 12, 13]))
    expect(out).toMatchObject({ kind: 'dose', to: 12 })
  })

  it('el margen lo marca la PEOR serie que contó, no la mejor', () => {
    // 15 en una serie y 10 en las otras dos es una serie buena, no un salto.
    const out = suggestProgression(pushupKnee, twoSessions([15, 10, 10]))
    expect(out).toMatchObject({ kind: 'dose', to: 11 })
  })

  it('la subida nunca pasa del tope', () => {
    const nearCap: ProgressionExercise = { ...pushupKnee, reps: String(DEFAULT_REPS_CAP - 1) }
    const out = suggestProgression(nearCap, twoSessions([14, 14, 14]))
    // +2 se saldría del tope: se recorta, no se salta al cambio de variante.
    expect(out).toMatchObject({ kind: 'dose', to: DEFAULT_REPS_CAP })
  })
})

describe('suggestProgression — temporizador', () => {
  it('sugiere +5 s y lo marca como segundos, nunca como reps', () => {
    const out = suggestProgression(plank, twoSessions([30, 30, 30]))
    expect(out).toEqual({ kind: 'dose', unit: 'seconds', sets: 3, from: 30, to: 35 })
  })

  it('el margen en segundos es de dos pasos (10 s), no de dos segundos', () => {
    // 32 s es cumplir con holgura, no es el doble de salto.
    expect(suggestProgression(plank, twoSessions([32, 32, 32]))).toMatchObject({ to: 35 })
    expect(suggestProgression(plank, twoSessions([40, 40, 40]))).toMatchObject({ to: 40 })
  })

  it('el tope de segundos dispara la variante, no el de repeticiones', () => {
    // 90 s está muy por encima del tope de reps (12): si la unidad se
    // confundiera, esto sugeriría variante desde el primer día.
    const atCap: ProgressionExercise = { ...plank, reps: '90', timerSeconds: DEFAULT_SECONDS_CAP }
    const values = Array(3).fill(DEFAULT_SECONDS_CAP)
    const out = suggestProgression(atCap, twoSessions(values), {
      harderVariant: harderIs({ id: 'plank_single_arm', name: 'Plancha a una mano' }),
    })
    expect(out).toMatchObject({ kind: 'variant', unit: 'seconds', to: 30 })
  })
})

describe('suggestProgression — cambio de variante', () => {
  const atCap: ProgressionExercise = { ...pushupKnee, reps: String(DEFAULT_REPS_CAP) }
  const met = twoSessions(Array(3).fill(DEFAULT_REPS_CAP))

  it('en el tope y cumpliendo propone la variante más dura de la familia', () => {
    const out = suggestProgression(atCap, met, {
      harderVariant: harderIs({ id: 'pushup_std', name: 'Flexión estándar' }),
    })
    expect(out).toEqual({
      kind: 'variant',
      unit: 'reps',
      sets: 3,
      from: DEFAULT_REPS_CAP,
      to: 8,
      exerciseId: 'pushup_std',
      exerciseName: 'Flexión estándar',
    })
  })

  it('la dosis de estreno vuelve a la base, no arrastra el tope', () => {
    // Estrenar `pushup_std` con 3×12 sería exactamente lo que hace que la
    // gente abandone la variante nueva.
    const out = suggestProgression(atCap, met, {
      harderVariant: harderIs({ id: 'pushup_std', name: 'Flexión estándar' }),
    })
    expect(out).toMatchObject({ to: 8 })
    expect(out?.to).toBeLessThan(DEFAULT_REPS_CAP)
  })

  it('en el tope y sin variante más dura no sugiere nada', () => {
    // Preferimos callar antes que ofrecer un salto que no se puede aceptar.
    expect(suggestProgression(atCap, met, { harderVariant: noHarder })).toBeNull()
  })

  it('sin resolver de variantes tampoco inventa una', () => {
    expect(suggestProgression(atCap, met)).toBeNull()
  })
})

describe('suggestProgression — cuándo callarse', () => {
  it('una sola sesión cumplida no basta', () => {
    const out = suggestProgression(pushupKnee, [{ date: '2026-08-21', values: [10, 10, 10] }])
    expect(out).toBeNull()
  })

  it('una sesión con menos series de las prescritas no cuenta como cumplida', () => {
    // 3×10 prescritas y una sola serie de 12 NO es cumplir 3×10. Es la
    // diferencia con `shouldSuggestProgression`, que se conforma con una serie.
    const out = suggestProgression(pushupKnee, [
      { date: '2026-08-18', values: [10, 10, 10] },
      { date: '2026-08-21', values: [12] },
    ])
    expect(out).toBeNull()
  })

  it('quedarse corto en una serie tumba la sesión entera', () => {
    const out = suggestProgression(pushupKnee, twoSessions([10, 10, 9]))
    expect(out).toBeNull()
  })

  it('un objetivo no numérico no se puede superar', () => {
    const maxReps: ProgressionExercise = { ...pushupKnee, reps: 'máximas' }
    expect(suggestProgression(maxReps, twoSessions([20, 20, 20]))).toBeNull()
  })

  it('unas series no numéricas tampoco', () => {
    const multi: ProgressionExercise = { ...pushupKnee, sets: 'múltiples' }
    expect(suggestProgression(multi, twoSessions([10, 10, 10]))).toBeNull()
  })

  it('sin historial devuelve null en vez de lanzar', () => {
    expect(suggestProgression(pushupKnee, [])).toBeNull()
  })

  it('las sesiones sin series se descartan antes de contar', () => {
    // Una sesión vacía no puede rellenar el cupo de las dos exigidas.
    const out = suggestProgression(pushupKnee, [
      { date: '2026-08-21', values: [10, 10, 10] },
      { date: '2026-08-18', values: [] },
    ])
    expect(out).toBeNull()
  })
})

describe('suggestProgression — orden e independencia del historial', () => {
  it('mira las MÁS RECIENTES, no las primeras del array', () => {
    // Las dos últimas fallan; las viejas cumplían. No debe sugerir.
    const out = suggestProgression(pushupKnee, [
      { date: '2026-08-01', values: [10, 10, 10] },
      { date: '2026-08-04', values: [10, 10, 10] },
      { date: '2026-08-18', values: [8, 8, 8] },
      { date: '2026-08-21', values: [9, 9, 9] },
    ])
    expect(out).toBeNull()
  })

  it('un mal día antiguo no bloquea la subida', () => {
    const out = suggestProgression(pushupKnee, [
      { date: '2026-08-01', values: [4, 4, 4] },
      { date: '2026-08-18', values: [10, 10, 10] },
      { date: '2026-08-21', values: [10, 10, 10] },
    ])
    expect(out).toMatchObject({ kind: 'dose', to: 11 })
  })

  it('`sessionsAtTarget` es configurable para quien quiera ser más exigente', () => {
    const three = [
      { date: '2026-08-14', values: [10, 10, 10] },
      { date: '2026-08-18', values: [10, 10, 10] },
      { date: '2026-08-21', values: [10, 10, 10] },
    ]
    expect(suggestProgression(pushupKnee, three, { sessionsAtTarget: 3 })).toMatchObject({ to: 11 })
    expect(suggestProgression(pushupKnee, three.slice(1), { sessionsAtTarget: 3 })).toBeNull()
  })
})
