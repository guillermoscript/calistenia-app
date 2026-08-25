/**
 * Copiar días y fases, y reordenar ejercicios dentro de su sección (#621).
 *
 * Va en un fichero aparte —como `useProgramEditor.media.test.tsx` y
 * `useProgramEditor.catalog.test.ts`— y no dentro de un test del hook: las
 * reglas son funciones puras a nivel de módulo justo para poder alcanzarlas
 * desde Node, sin renderizador de React.
 */
import { describe, it, expect, vi } from 'vitest'

// Importar el hook arrastra `lib/pocketbase`, que en el arranque pide un
// `initCore()` que en Node no existe. El stub solo sirve para que el módulo se
// pueda importar: todo lo que se ejercita aquí abajo es puro y no toca la red.
vi.mock('../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})), authStore: { record: null } },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

import {
  cloneExerciseForCopy,
  copyDayInto,
  copyDayTargets,
  copyPhaseInto,
  copyPhaseTargets,
  moveExerciseWithin,
  reorderExerciseWithin,
  type EditorDay,
  type EditorExercise,
} from './useProgramEditor'

function ex(name: string, over: Partial<EditorExercise> = {}): EditorExercise {
  return {
    exerciseId: `id_${name}`,
    name,
    sets: 3,
    reps: '10',
    rest: 60,
    muscles: 'dorsal',
    note: '',
    youtube: '',
    priority: 'med',
    isTimer: false,
    timerSeconds: 0,
    section: 'main',
    ...over,
  }
}

function day(dayId: string, over: Partial<EditorDay> = {}): EditorDay {
  return {
    dayId,
    dayName: dayId.toUpperCase(),
    focus: 'Descanso',
    type: 'rest',
    color: '#888899',
    exercises: [],
    ...over,
  }
}

describe('cloneExerciseForCopy', () => {
  it('descarta la media propia del programa y el id de su registro', () => {
    const original = ex('dominadas', {
      pbRecordId: 'pe_abc123',
      demoImages: ['dominadas_1.png', 'dominadas_2.png'],
      demoVideo: 'dominadas.mp4',
      pendingImages: [{ blob: new Blob(['a']), name: 'a.png', type: 'image/png' }],
      pendingVideo: { blob: new Blob(['v']), name: 'v.mp4', type: 'video/mp4' },
      removedImages: ['vieja.png'],
      removeVideo: true,
    })

    const copia = cloneExerciseForCopy(original)

    // Los nombres de fichero solo resuelven contra el `pbRecordId` que los
    // tiene colgados: heredarlos daría imágenes rotas en el día copiado.
    expect(copia.pbRecordId).toBeUndefined()
    expect(copia.demoImages).toBeUndefined()
    expect(copia.demoVideo).toBeUndefined()
    expect(copia.pendingImages).toBeUndefined()
    expect(copia.pendingVideo).toBeUndefined()
    expect(copia.removedImages).toBeUndefined()
    expect(copia.removeVideo).toBeUndefined()
  })

  it('conserva el contenido de entrenamiento, y `youtube` porque es una URL', () => {
    const original = ex('fondos', {
      sets: 5,
      reps: '8-12',
      rest: 90,
      note: 'bajar lento',
      priority: 'high',
      isTimer: true,
      timerSeconds: 45,
      section: 'warmup',
      youtube: 'https://youtu.be/abc',
      pbRecordId: 'pe_zzz',
    })

    const copia = cloneExerciseForCopy(original)

    expect(copia).toMatchObject({
      exerciseId: 'id_fondos',
      name: 'fondos',
      sets: 5,
      reps: '8-12',
      rest: 90,
      note: 'bajar lento',
      priority: 'high',
      isTimer: true,
      timerSeconds: 45,
      section: 'warmup',
      youtube: 'https://youtu.be/abc',
    })
  })
})

describe('copyDayInto', () => {
  const days: Record<string, EditorDay> = {
    '0_lun': day('lun', {
      dayName: 'Lunes',
      focus: 'Empuje',
      type: 'push',
      color: '#c8f542',
      exercises: [ex('flexiones'), ex('fondos')],
    }),
    '0_jue': day('jue', { dayName: 'Jueves' }),
  }

  it('lleva el contenido de entrenamiento al día destino', () => {
    const next = copyDayInto(days, '0_lun', '0_jue')

    expect(next['0_jue'].type).toBe('push')
    expect(next['0_jue'].focus).toBe('Empuje')
    expect(next['0_jue'].color).toBe('#c8f542')
    expect(next['0_jue'].exercises.map(e => e.name)).toEqual(['flexiones', 'fondos'])
  })

  it('el destino conserva su `dayId` y su `dayName`', () => {
    const next = copyDayInto(days, '0_lun', '0_jue')

    // Si la copia se llevara el `dayId` del origen, `saveProgram` escribiría
    // `day_id: 'lun'` en el hueco del jueves y rompería la clave natural con la
    // que `programEditorDiff.ts` identifica las filas entre guardados.
    expect(next['0_jue'].dayId).toBe('jue')
    expect(next['0_jue'].dayName).toBe('Jueves')
  })

  it('arrastra la configuración de circuito y de cardio', () => {
    const conConfig: Record<string, EditorDay> = {
      '0_lun': day('lun', {
        type: 'circuit',
        exercises: [ex('burpees')],
        circuitMode: 'timed',
        circuitRounds: 5,
        circuitWorkSeconds: 30,
        circuitRestSeconds: 15,
        circuitRestBetweenExercises: 10,
        circuitRestBetweenRounds: 90,
        cardioActivityType: 'running',
        cardioTargetDistanceKm: 5,
        cardioTargetDurationMin: 30,
      }),
      '0_jue': day('jue'),
    }

    const next = copyDayInto(conConfig, '0_lun', '0_jue')

    expect(next['0_jue']).toMatchObject({
      circuitMode: 'timed',
      circuitRounds: 5,
      circuitWorkSeconds: 30,
      circuitRestSeconds: 15,
      circuitRestBetweenExercises: 10,
      circuitRestBetweenRounds: 90,
      cardioActivityType: 'running',
      cardioTargetDistanceKm: 5,
      cardioTargetDurationMin: 30,
    })
  })

  it('la copia es independiente: editar el destino no toca el origen', () => {
    const next = copyDayInto(days, '0_lun', '0_jue')

    next['0_jue'].exercises[0].reps = '20'

    expect(next['0_lun'].exercises[0].reps).toBe('10')
    expect(next['0_jue'].exercises[0]).not.toBe(next['0_lun'].exercises[0])
  })

  it('no toca el día de origen', () => {
    const next = copyDayInto(days, '0_lun', '0_jue')

    expect(next['0_lun']).toBe(days['0_lun'])
  })

  it('devuelve el mismo estado al copiar un día sobre sí mismo', () => {
    expect(copyDayInto(days, '0_lun', '0_lun')).toBe(days)
  })

  it('devuelve el mismo estado si el origen o el destino no existen', () => {
    expect(copyDayInto(days, '0_sab', '0_jue')).toBe(days)
    expect(copyDayInto(days, '0_lun', '3_jue')).toBe(days)
  })
})

describe('copyPhaseInto', () => {
  const days: Record<string, EditorDay> = {
    '0_lun': day('lun', { type: 'push', focus: 'Empuje', exercises: [ex('flexiones')] }),
    '0_mar': day('mar', { type: 'pull', focus: 'Tirón', exercises: [ex('dominadas')] }),
    '0_mie': day('mie', { type: 'lumbar' }),
    '0_jue': day('jue', { type: 'legs' }),
    '0_vie': day('vie', { type: 'full' }),
    '0_sab': day('sab'),
    '0_dom': day('dom'),
    '1_lun': day('lun'),
    '1_mar': day('mar'),
    '1_mie': day('mie'),
    '1_jue': day('jue'),
    '1_vie': day('vie'),
    '1_sab': day('sab'),
    '1_dom': day('dom'),
  }

  it('copia los siete días de la fase, conservando la identidad de cada uno', () => {
    const next = copyPhaseInto(days, 0, 1)

    expect(next['1_lun'].type).toBe('push')
    expect(next['1_lun'].exercises.map(e => e.name)).toEqual(['flexiones'])
    expect(next['1_mar'].type).toBe('pull')
    expect(next['1_mar'].exercises.map(e => e.name)).toEqual(['dominadas'])
    expect(next['1_vie'].type).toBe('full')

    for (const dayId of ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']) {
      expect(next[`1_${dayId}`].dayId).toBe(dayId)
    }
  })

  it('no toca la fase de origen', () => {
    const next = copyPhaseInto(days, 0, 1)

    expect(next['0_lun']).toBe(days['0_lun'])
    expect(next['0_mar'].exercises.map(e => e.name)).toEqual(['dominadas'])
  })

  it('devuelve el mismo estado al copiar una fase sobre sí misma', () => {
    expect(copyPhaseInto(days, 0, 0)).toBe(days)
  })

  it('devuelve el mismo estado si la fase destino no existe', () => {
    expect(copyPhaseInto(days, 0, 7)).toBe(days)
  })
})

describe('copyDayTargets', () => {
  const days: Record<string, EditorDay> = {
    '0_lun': day('lun', { exercises: [ex('flexiones'), ex('fondos')] }),
    '0_mar': day('mar'),
    '0_mie': day('mie'),
    '0_jue': day('jue'),
    '0_vie': day('vie'),
    '0_sab': day('sab'),
    '0_dom': day('dom'),
    '1_lun': day('lun', { exercises: [ex('sentadillas')] }),
    '1_mar': day('mar'),
    '1_mie': day('mie'),
    '1_jue': day('jue'),
    '1_vie': day('vie'),
    '1_sab': day('sab'),
    '1_dom': day('dom'),
  }

  it('ofrece todos los días del programa menos el de origen', () => {
    const targets = copyDayTargets(days, 2, '0_lun')

    expect(targets).toHaveLength(13)
    expect(targets.some(t => t.key === '0_lun')).toBe(false)
  })

  it('respeta el orden de DAY_DEFAULTS dentro de cada fase', () => {
    const targets = copyDayTargets(days, 2, '0_lun')

    expect(targets.slice(0, 6).map(t => t.dayId)).toEqual(['mar', 'mie', 'jue', 'vie', 'sab', 'dom'])
    expect(targets.slice(6).map(t => t.dayId)).toEqual(['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'])
    expect(targets.slice(6).every(t => t.phaseIndex === 1)).toBe(true)
  })

  it('lleva el recuento de ejercicios del destino, que es el aviso de que copiar reemplaza', () => {
    const targets = copyDayTargets(days, 2, '0_mar')

    expect(targets.find(t => t.key === '0_lun')?.exerciseCount).toBe(2)
    expect(targets.find(t => t.key === '1_lun')?.exerciseCount).toBe(1)
    expect(targets.find(t => t.key === '1_dom')?.exerciseCount).toBe(0)
  })

  it('salta las claves que no existen en vez de inventar días', () => {
    const partial: Record<string, EditorDay> = { '0_lun': day('lun'), '0_mar': day('mar') }

    expect(copyDayTargets(partial, 2, '0_lun').map(t => t.key)).toEqual(['0_mar'])
  })
})

describe('copyPhaseTargets', () => {
  const days: Record<string, EditorDay> = {
    '0_lun': day('lun', { exercises: [ex('flexiones')] }),
    '1_lun': day('lun', { exercises: [ex('sentadillas'), ex('zancadas')] }),
    '1_jue': day('jue', { exercises: [ex('dominadas')] }),
    '2_lun': day('lun'),
  }

  it('ofrece todas las fases menos la de origen', () => {
    expect(copyPhaseTargets(days, 3, 0).map(t => t.phaseIndex)).toEqual([1, 2])
    expect(copyPhaseTargets(days, 3, 1).map(t => t.phaseIndex)).toEqual([0, 2])
  })

  it('suma los ejercicios de los siete días, porque copiar los reemplaza todos', () => {
    const targets = copyPhaseTargets(days, 3, 0)

    expect(targets.find(t => t.phaseIndex === 1)?.exerciseCount).toBe(3)
    expect(targets.find(t => t.phaseIndex === 2)?.exerciseCount).toBe(0)
  })
})

describe('moveExerciseWithin', () => {
  // El caso exacto que antes era un no-op invisible: array [A, B, C, D] con
  // calentamiento [A, B] y principal [C, D]. Subir C lo intercambiaba con B y
  // dejaba [A, C, B, D], pero al filtrar por sección volvían a salir [A, B] y
  // [C, D] y la pantalla no cambiaba.
  const mixto = [
    ex('A', { section: 'warmup' }),
    ex('B', { section: 'warmup' }),
    ex('C', { section: 'main' }),
    ex('D', { section: 'main' }),
  ]

  it('subir el primer ejercicio de una sección no hace nada (ya está arriba)', () => {
    expect(moveExerciseWithin(mixto, 2, 'up')).toBe(mixto)
  })

  it('bajar el último ejercicio de una sección no hace nada', () => {
    expect(moveExerciseWithin(mixto, 3, 'down')).toBe(mixto)
  })

  it('subir dentro de la sección reordena de verdad y no cruza secciones', () => {
    const next = moveExerciseWithin(mixto, 3, 'up')

    expect(next.filter(e => e.section === 'main').map(e => e.name)).toEqual(['D', 'C'])
    expect(next.filter(e => e.section === 'warmup').map(e => e.name)).toEqual(['A', 'B'])
    expect(next.every(e => e.section === mixto.find(o => o.name === e.name)!.section)).toBe(true)
  })

  it('funciona con las secciones intercaladas en el array', () => {
    // `addExercise` añade siempre al final, así que un calentamiento añadido
    // después del principal queda detrás dentro de `day.exercises`.
    const intercalado = [
      ex('A', { section: 'warmup' }),
      ex('C', { section: 'main' }),
      ex('B', { section: 'warmup' }),
      ex('D', { section: 'main' }),
    ]

    const next = moveExerciseWithin(intercalado, 2, 'up')

    expect(next.filter(e => e.section === 'warmup').map(e => e.name)).toEqual(['B', 'A'])
    expect(next.filter(e => e.section === 'main').map(e => e.name)).toEqual(['C', 'D'])
  })

  it('trata un ejercicio sin `section` como principal', () => {
    const sinSeccion = [
      ex('A', { section: 'warmup' }),
      ex('B', { section: undefined }),
      ex('C', { section: 'main' }),
    ]

    const next = moveExerciseWithin(sinSeccion, 2, 'up')

    expect(next.map(e => e.name)).toEqual(['A', 'C', 'B'])
  })

  it('devuelve el mismo array con un índice fuera de rango', () => {
    expect(moveExerciseWithin(mixto, 9, 'up')).toBe(mixto)
  })
})

describe('reorderExerciseWithin', () => {
  const exercises = [
    ex('A', { section: 'warmup' }),
    ex('B', { section: 'main' }),
    ex('C', { section: 'main' }),
    ex('D', { section: 'main' }),
  ]

  it('mueve por índices locales a la sección', () => {
    // Dentro de `main`: [B, C, D] → mover el 0 al 2 → [C, D, B].
    const next = reorderExerciseWithin(exercises, 'main', 0, 2)

    expect(next.filter(e => e.section === 'main').map(e => e.name)).toEqual(['C', 'D', 'B'])
    expect(next.filter(e => e.section === 'warmup').map(e => e.name)).toEqual(['A'])
  })

  it('no saca al ejercicio de su sección', () => {
    const next = reorderExerciseWithin(exercises, 'main', 2, 0)

    expect(next.every(e => e.section === exercises.find(o => o.name === e.name)!.section)).toBe(true)
  })

  it('devuelve el mismo array si el destino se sale de la sección', () => {
    // `main` solo tiene tres ejercicios: el índice local 3 no existe.
    expect(reorderExerciseWithin(exercises, 'main', 0, 3)).toBe(exercises)
    expect(reorderExerciseWithin(exercises, 'main', 0, -1)).toBe(exercises)
  })

  it('devuelve el mismo array si origen y destino coinciden', () => {
    expect(reorderExerciseWithin(exercises, 'main', 1, 1)).toBe(exercises)
  })

  it('devuelve el mismo array para una sección vacía', () => {
    expect(reorderExerciseWithin(exercises, 'cooldown', 0, 1)).toBe(exercises)
  })
})
