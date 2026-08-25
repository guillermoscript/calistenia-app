/**
 * Hito de fase de programa (#640).
 *
 * El caso que importa es el día de circuito: un día de circuito CON ejercicios
 * genera filas en `program_exercises`, así que entra en `requiredDays` como
 * cualquier otro día. Antes del #640 no había forma de que entrara en
 * `completedDays` — solo se leían `sessions` y `cardio_sessions` — y eso dejaba
 * el hito del programa entero bloqueado para siempre. Por eso las fixtures de
 * abajo tienen el día de circuito presente en `program_exercises`: una con el
 * día vacío no probaría nada.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'

const mem = new Map<string, string>()

vi.mock('../platform', () => ({
  storage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
  },
}))

/** Filas que devuelve cada colección en el test en curso. */
let rows: Record<string, any[]> = {}

vi.mock('./pocketbase', () => ({
  pb: {
    filter: (expr: string) => expr,
    collection: (name: string) => ({
      getFullList: async () => rows[name] ?? [],
    }),
  },
}))

const track = vi.fn()

vi.mock('./analytics', () => ({
  CANONICAL_ANALYTICS_EVENTS: { programMilestoneCompleted: 'program_milestone_completed' },
  trackCanonicalEvent: (...args: unknown[]) => track(...args),
  emitOnce: (key: string, emit: () => void) => {
    if (mem.has(key)) return
    mem.set(key, 'true')
    emit()
  },
}))

import { emitProgramMilestoneIfCompleted } from './program-milestone'

const UID = 'u1'
const PID = 'prog1'

/**
 * Fase 1 de un programa con dos días: `lun` de fuerza y `mie` de CIRCUITO.
 * `mie` aparece en `program_exercises` porque el circuito lleva ejercicios
 * dentro, que es exactamente lo que siembra el editor.
 */
function seedPhase({ circuits = [] as any[], sessions = [{ workout_key: 'p1_lun' }] } = {}) {
  rows = {
    program_exercises: [{ day_id: 'lun' }, { day_id: 'mie' }],
    program_day_config: [{ day_id: 'mie', day_type: 'circuit' }],
    sessions,
    cardio_sessions: [],
    circuit_sessions: circuits,
  }
}

beforeEach(() => {
  mem.clear()
  track.mockClear()
  rows = {}
})

describe('emitProgramMilestoneIfCompleted', () => {
  it('no emite mientras el día de circuito siga sin hacerse', async () => {
    seedPhase({ circuits: [] })
    await emitProgramMilestoneIfCompleted(UID, PID, 'p1_lun')
    expect(track).not.toHaveBeenCalled()
  })

  // El corazón del #640: la fila de circuito completa la fase.
  it('emite el hito cuando el circuito del día cierra la fase', async () => {
    seedPhase({ circuits: [{ program_day_key: 'p1_mie' }] })
    await emitProgramMilestoneIfCompleted(UID, PID, 'p1_mie')
    expect(track).toHaveBeenCalledTimes(1)
    expect(track.mock.calls[0][0]).toBe('program_milestone_completed')
    expect(track.mock.calls[0][1]).toMatchObject({
      program_id: PID, milestone_id: 'phase_1', result: 'phase_completed',
    })
  })

  it('no emite dos veces: el marcador local lo deja idempotente', async () => {
    seedPhase({ circuits: [{ program_day_key: 'p1_mie' }] })
    await emitProgramMilestoneIfCompleted(UID, PID, 'p1_mie')
    await emitProgramMilestoneIfCompleted(UID, PID, 'p1_mie')
    expect(track).toHaveBeenCalledTimes(1)
  })

  // `~` es un LIKE y `_` es comodín de un carácter, así que el filtro puede
  // traer claves de otra fase: el prefijo se re-comprueba de forma exacta.
  it('no cuenta un circuito de otra fase que el LIKE cuela', async () => {
    seedPhase({ circuits: [{ program_day_key: 'p2_mie' }] })
    await emitProgramMilestoneIfCompleted(UID, PID, 'p1_mie')
    expect(track).not.toHaveBeenCalled()
  })

  it('sigue emitiendo con solo días de fuerza (no rompe el camino de siempre)', async () => {
    rows = {
      program_exercises: [{ day_id: 'lun' }],
      program_day_config: [],
      sessions: [{ workout_key: 'p1_lun' }],
      cardio_sessions: [],
      circuit_sessions: [],
    }
    await emitProgramMilestoneIfCompleted(UID, PID, 'p1_lun')
    expect(track).toHaveBeenCalledTimes(1)
  })
})
