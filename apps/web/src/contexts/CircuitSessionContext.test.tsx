import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { CircuitDefinition } from '@calistenia/core/types'

// pb/op se mockean: CircuitSessionContext los usa para persistir sesiones
// completadas (pb.collection('circuit_sessions').create) y trackear eventos.
const { mockCreate, mockTrack, mockReportError, connectivity } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockTrack: vi.fn(),
  mockReportError: vi.fn(),
  connectivity: { online: true },
}))

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    // #464: la cola de core no drena sin sesión válida (evita descartar
    // replays sin token como "poison").
    authStore: { isValid: true, onChange: vi.fn(() => () => {}) },
    collection: vi.fn(() => ({ create: mockCreate })),
  },
}))

vi.mock('@calistenia/core/lib/analytics', () => ({
  op: { track: mockTrack },
}))

// #464: los circuitos pasan por `offlineQueue`, que lee el adapter de
// plataforma de core (storage + connectivity). En tests no hay `initCore()`,
// así que se inyecta aquí, respaldado por el localStorage de jsdom.
vi.mock('@calistenia/core/platform', () => ({
  storage: {
    getItem: (k: string) => window.localStorage.getItem(k),
    setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
    removeItem: (k: string) => window.localStorage.removeItem(k),
  },
  getPlatform: () => ({
    connectivity: {
      isOnline: () => connectivity.online,
      onOnline: () => () => {},
      onChange: () => () => {},
    },
    reportError: mockReportError,
  }),
}))

import { CircuitSessionProvider, useCircuitSession } from './CircuitSessionContext'
import { getQueue, clearQueue } from '@calistenia/core/lib/offlineQueue'
import { LEGACY_CIRCUIT_UNSAVED_KEY } from '@calistenia/core/lib/circuitSessionQueue'

const STORAGE_KEY = 'calistenia_circuit_active'
const UNSAVED_KEY = LEGACY_CIRCUIT_UNSAVED_KEY

/** Sesiones de circuito pendientes en la cola común de core. */
function queuedCircuits() {
  return getQueue().filter(a => a.collection === 'circuit_sessions')
}

function makeCircuit(overrides: Record<string, unknown> = {}): CircuitDefinition {
  return {
    id: 'c1',
    name: 'Circuito test',
    mode: 'circuit',
    exercises: [{ id: 'e1' }, { id: 'e2' }],
    rounds: 2,
    restBetweenExercises: 10,
    restBetweenRounds: 20,
    ...overrides,
  } as unknown as CircuitDefinition
}

function makeWrapper(userId: string | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <CircuitSessionProvider userId={userId}>{children}</CircuitSessionProvider>
  }
}

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({})
  mockTrack.mockReset()
  mockReportError.mockReset()
  connectivity.online = true
  clearQueue()
})

describe('useCircuitSession fuera de provider', () => {
  it('lanza si no hay CircuitSessionProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useCircuitSession())).toThrow(
      'useCircuitSession must be used within CircuitSessionProvider',
    )
    spy.mockRestore()
  })
})

describe('startCircuit', () => {
  it('fase inicial getReady, isActive true y circuit seteado', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    const circuit = makeCircuit()

    act(() => { result.current.startCircuit(circuit, 'custom') })

    expect(result.current.isActive).toBe(true)
    expect(result.current.circuit).toEqual(circuit)
    expect(result.current.progress.phase).toBe('getReady')
    expect(result.current.progress.currentRound).toBe(0)
    expect(result.current.progress.currentExerciseIndex).toBe(0)
    expect(result.current.progress.completedExercises).toBe(0)
    expect(result.current.isPaused).toBe(false)
  })

  it('persiste en localStorage bajo calistenia_circuit_active', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    const circuit = makeCircuit()

    act(() => { result.current.startCircuit(circuit, 'preset', 'prog1', 'day1') })

    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const persisted = JSON.parse(raw!)
    expect(persisted.circuit.name).toBe('Circuito test')
    expect(persisted.progress.phase).toBe('getReady')
    expect(persisted.source).toBe('preset')
    expect(persisted.programId).toBe('prog1')
    expect(persisted.programDayKey).toBe('day1')
  })

  it('trackea circuit_started con mode/exercises/rounds/source', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    const circuit = makeCircuit({ mode: 'timed', rounds: 3 })

    act(() => { result.current.startCircuit(circuit, 'program', 'prog1') })

    expect(mockTrack).toHaveBeenCalledWith('circuit_started', {
      mode: 'timed',
      exercises: 2,
      rounds: 3,
      source: 'program',
    })
  })
})

describe('advanceFromGetReady', () => {
  it('modo timed: getReady -> work', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit({ mode: 'timed' }), 'custom') })
    act(() => { result.current.advanceFromGetReady() })
    expect(result.current.progress.phase).toBe('work')
  })

  it('modo circuit: getReady -> exercise', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit({ mode: 'circuit' }), 'custom') })
    act(() => { result.current.advanceFromGetReady() })
    expect(result.current.progress.phase).toBe('exercise')
  })
})

describe('modo circuit — máquina de estados (advanceExercise)', () => {
  it('con restBetweenExercises>0 avanza a rest sin cambiar el índice', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit({ restBetweenExercises: 10 }), 'custom') })
    act(() => { result.current.advanceFromGetReady() })

    act(() => { result.current.advanceExercise() })

    expect(result.current.progress.phase).toBe('rest')
    expect(result.current.progress.currentExerciseIndex).toBe(0)
    expect(result.current.progress.completedExercises).toBe(1)
  })

  it('con restBetweenExercises=0 avanza directo al siguiente ejercicio', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(
        makeCircuit({ rounds: 1, restBetweenExercises: 0 }),
        'custom',
      )
    })
    act(() => { result.current.advanceFromGetReady() })

    act(() => { result.current.advanceExercise() })

    expect(result.current.progress.phase).toBe('exercise')
    expect(result.current.progress.currentExerciseIndex).toBe(1)
    expect(result.current.progress.completedExercises).toBe(1)
  })

  it('fin de ronda con restBetweenRounds>0 avanza a roundRest', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(
        makeCircuit({ exercises: [{ id: 'e1' }], rounds: 2, restBetweenRounds: 20 }),
        'custom',
      )
    })
    act(() => { result.current.advanceFromGetReady() }) // exercise, round0/idx0 (único ejercicio)

    act(() => { result.current.advanceExercise() })

    expect(result.current.progress.phase).toBe('roundRest')
    expect(result.current.progress.currentRound).toBe(0)
    expect(result.current.progress.completedExercises).toBe(1)
  })

  it('fin de ronda con restBetweenRounds=0 avanza directo a la siguiente ronda', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(
        makeCircuit({ exercises: [{ id: 'e1' }], rounds: 2, restBetweenRounds: 0 }),
        'custom',
      )
    })
    act(() => { result.current.advanceFromGetReady() })

    act(() => { result.current.advanceExercise() })

    expect(result.current.progress.phase).toBe('exercise')
    expect(result.current.progress.currentRound).toBe(1)
    expect(result.current.progress.currentExerciseIndex).toBe(0)
    expect(result.current.progress.completedExercises).toBe(1)
  })

  it('último ejercicio de la última ronda pasa a celebrate', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(
        makeCircuit({ exercises: [{ id: 'e1' }], rounds: 1, restBetweenRounds: 0 }),
        'custom',
      )
    })
    act(() => { result.current.advanceFromGetReady() })

    act(() => { result.current.advanceExercise() })

    expect(result.current.progress.phase).toBe('celebrate')
    expect(result.current.progress.completedExercises).toBe(1)
  })

  it('recorrido completo 2 ejercicios x 2 rondas incrementa completedExercises en cada paso', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') }) // 2 ex x 2 rondas, rest>0 en ambos
    act(() => { result.current.advanceFromGetReady() }) // exercise r0/i0

    act(() => { result.current.advanceExercise() }) // -> rest (completed 1)
    expect(result.current.progress.phase).toBe('rest')
    act(() => { result.current.advanceToNextPhase() }) // -> exercise r0/i1
    expect(result.current.progress).toMatchObject({ phase: 'exercise', currentRound: 0, currentExerciseIndex: 1 })

    act(() => { result.current.advanceExercise() }) // último de la ronda -> roundRest (completed 2)
    expect(result.current.progress).toMatchObject({ phase: 'roundRest', completedExercises: 2 })
    act(() => { result.current.advanceToNextPhase() }) // -> exercise r1/i0
    expect(result.current.progress).toMatchObject({ phase: 'exercise', currentRound: 1, currentExerciseIndex: 0 })

    act(() => { result.current.advanceExercise() }) // -> rest (completed 3)
    expect(result.current.progress).toMatchObject({ phase: 'rest', completedExercises: 3 })
    act(() => { result.current.advanceToNextPhase() }) // -> exercise r1/i1
    act(() => { result.current.advanceExercise() }) // último ejercicio, última ronda -> celebrate (completed 4)
    expect(result.current.progress).toMatchObject({ phase: 'celebrate', completedExercises: 4 })
  })
})

describe('modo timed — máquina de estados (advanceExercise)', () => {
  it('work -> rest cuando restSeconds>0, sin cambiar el índice', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(makeCircuit({ mode: 'timed', restSeconds: 10 }), 'custom')
    })
    act(() => { result.current.advanceFromGetReady() }) // work

    act(() => { result.current.advanceExercise() })

    expect(result.current.progress.phase).toBe('rest')
    expect(result.current.progress.currentExerciseIndex).toBe(0)
    expect(result.current.progress.completedExercises).toBe(1)
  })

  it('work -> siguiente work directo cuando restSeconds es 0/undefined', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(makeCircuit({ mode: 'timed', rounds: 1 }), 'custom') // sin restSeconds
    })
    act(() => { result.current.advanceFromGetReady() })

    act(() => { result.current.advanceExercise() })

    expect(result.current.progress.phase).toBe('work')
    expect(result.current.progress.currentExerciseIndex).toBe(1)
    expect(result.current.progress.completedExercises).toBe(1)
  })

  it('fin de ronda pasa a roundRest', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(
        makeCircuit({ mode: 'timed', exercises: [{ id: 'e1' }], rounds: 2 }),
        'custom',
      )
    })
    act(() => { result.current.advanceFromGetReady() })

    act(() => { result.current.advanceExercise() })

    expect(result.current.progress.phase).toBe('roundRest')
  })

  it('fin de ronda en timed con restBetweenRounds=0 salta directo a la siguiente ronda (simétrico al modo circuit)', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(
        makeCircuit({
          mode: 'timed',
          exercises: [{ id: 'e1' }],
          rounds: 2,
          restBetweenRounds: 0,
        }),
        'custom',
      )
    })
    act(() => { result.current.advanceFromGetReady() })

    act(() => { result.current.advanceExercise() })

    expect(result.current.progress.phase).toBe('work')
    expect(result.current.progress.currentRound).toBe(1)
    expect(result.current.progress.currentExerciseIndex).toBe(0)
  })

  it('último ejercicio de la última ronda pasa a celebrate', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(
        makeCircuit({ mode: 'timed', exercises: [{ id: 'e1' }], rounds: 1 }),
        'custom',
      )
    })
    act(() => { result.current.advanceFromGetReady() })

    act(() => { result.current.advanceExercise() })

    expect(result.current.progress.phase).toBe('celebrate')
  })

  it('advanceExercise en fase rest/roundRest no cambia nada (lo maneja advanceToNextPhase)', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(makeCircuit({ mode: 'timed', restSeconds: 10 }), 'custom')
    })
    act(() => { result.current.advanceFromGetReady() })
    act(() => { result.current.advanceExercise() }) // -> rest
    const snapshot = { ...result.current.progress }
    expect(snapshot.phase).toBe('rest')

    act(() => { result.current.advanceExercise() }) // no-op esperado

    expect(result.current.progress).toEqual(snapshot)
  })
})

describe('advanceToNextPhase', () => {
  it('desde rest avanza al siguiente ejercicio (fase según modo)', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit({ restBetweenExercises: 10 }), 'custom') })
    act(() => { result.current.advanceFromGetReady() })
    act(() => { result.current.advanceExercise() }) // -> rest, idx 0

    act(() => { result.current.advanceToNextPhase() })

    expect(result.current.progress.phase).toBe('exercise')
    expect(result.current.progress.currentExerciseIndex).toBe(1)
  })

  it('desde roundRest avanza a la siguiente ronda con índice 0', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(
        makeCircuit({ exercises: [{ id: 'e1' }], rounds: 2, restBetweenRounds: 20 }),
        'custom',
      )
    })
    act(() => { result.current.advanceFromGetReady() })
    act(() => { result.current.advanceExercise() }) // -> roundRest

    act(() => { result.current.advanceToNextPhase() })

    expect(result.current.progress.phase).toBe('exercise')
    expect(result.current.progress.currentRound).toBe(1)
    expect(result.current.progress.currentExerciseIndex).toBe(0)
  })

  it('en otras fases (exercise/work/getReady) no hace nada', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })
    act(() => { result.current.advanceFromGetReady() }) // fase 'exercise'
    const snapshot = { ...result.current.progress }

    act(() => { result.current.advanceToNextPhase() })

    expect(result.current.progress).toEqual(snapshot)
  })
})

describe('pause/resume', () => {
  it('pause pone isPaused en true y resume lo vuelve a false', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })

    act(() => { result.current.pause() })
    expect(result.current.isPaused).toBe(true)

    act(() => { result.current.resume() })
    expect(result.current.isPaused).toBe(false)
  })
})

describe('completeCircuit', () => {
  it('crea la sesión en PB con rounds_completed = currentRound+1 si no está en celebrate', async () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(makeCircuit({ rounds: 3 }), 'custom')
    }) // getReady, currentRound 0

    await act(async () => { await result.current.completeCircuit() })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const data = mockCreate.mock.calls[0][0]
    expect(data.rounds_completed).toBe(1) // currentRound(0)+1
    expect(data.rounds_target).toBe(3)
    expect(data.user).toBe('u1')
  })

  it('crea la sesión con rounds_completed = circuit.rounds cuando la fase es celebrate', async () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => {
      result.current.startCircuit(
        makeCircuit({ exercises: [{ id: 'e1' }], rounds: 1, restBetweenRounds: 0 }),
        'custom',
      )
    })
    act(() => { result.current.advanceFromGetReady() })
    act(() => { result.current.advanceExercise() }) // -> celebrate
    expect(result.current.progress.phase).toBe('celebrate')

    await act(async () => { await result.current.completeCircuit() })

    const data = mockCreate.mock.calls[0][0]
    expect(data.rounds_completed).toBe(1) // circuit.rounds
  })

  it('trackea circuit_completed, limpia storage y desactiva la sesión', async () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })

    await act(async () => { await result.current.completeCircuit('nota final') })

    expect(mockTrack).toHaveBeenCalledWith('circuit_completed', expect.objectContaining({
      mode: 'circuit',
      rounds_target: 2,
      exercise_count: 2,
      source: 'custom',
    }))
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(result.current.isActive).toBe(false)
    expect(result.current.circuit).toBeNull()
  })

  // #464: cada sesión lleva un `client_id` generado UNA sola vez. Es lo que
  // permite que un reintento de una petición que sí llegó choque contra el
  // índice único parcial en vez de crear una sesión duplicada.
  it('la sesión se crea con un client_id no vacío', async () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })

    await act(async () => { await result.current.completeCircuit() })

    expect(mockCreate.mock.calls[0][0].client_id).toBeTruthy()
  })

  it('si la red falla (status 0): no lanza, encola en la cola de core y actualiza unsavedCount', async () => {
    const netErr: any = new Error('network down')
    netErr.status = 0 // «no hubo respuesta», no «no llegó»
    mockCreate.mockRejectedValueOnce(netErr)
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })

    await act(async () => { await expect(result.current.completeCircuit()).resolves.toBeUndefined() })

    expect(result.current.unsavedCount).toBe(1)
    expect(queuedCircuits()).toHaveLength(1)
    // sigue desactivando la sesión aunque el guardado remoto haya fallado
    expect(result.current.isActive).toBe(false)
  })

  it('sin red no llega a llamar a PB: encola directamente', async () => {
    connectivity.online = false
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })

    await act(async () => { await result.current.completeCircuit() })

    expect(mockCreate).not.toHaveBeenCalled()
    expect(queuedCircuits()).toHaveLength(1)
    expect(result.current.unsavedCount).toBe(1)
  })

  // #464: un 4xx es respuesta del servidor (determinista). Encolarlo colgaría
  // la cola reintentándolo para siempre; se reporta y punto.
  it('un 4xx determinista no se encola: se reporta', async () => {
    const httpErr: any = new Error('bad request')
    httpErr.status = 400
    mockCreate.mockRejectedValueOnce(httpErr)
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })

    await act(async () => { await expect(result.current.completeCircuit()).resolves.toBeUndefined() })

    expect(queuedCircuits()).toHaveLength(0)
    expect(mockReportError).toHaveBeenCalled()
    expect(result.current.isActive).toBe(false)
  })

  // El circuito se completó físicamente aunque el guardado remoto falle (la
  // sesión queda encolada): el evento se trackea igual, pero con `saved` para
  // poder segmentar en analytics las sesiones que aún no llegaron al backend.
  it('circuit_completed se trackea con saved:false si el guardado en PB falló', async () => {
    const netErr: any = new Error('network down')
    netErr.status = 0
    mockCreate.mockRejectedValueOnce(netErr)
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })

    await act(async () => { await result.current.completeCircuit() })

    expect(mockTrack).toHaveBeenCalledWith('circuit_completed', expect.objectContaining({ saved: false }))
  })

  it('circuit_completed se trackea con saved:true cuando PB guarda bien', async () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })

    await act(async () => { await result.current.completeCircuit() })

    expect(mockTrack).toHaveBeenCalledWith('circuit_completed', expect.objectContaining({ saved: true }))
  })

  it('sin userId (guard): no llama a PB ni cambia el estado', async () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper(null) })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })

    await act(async () => { await result.current.completeCircuit() })

    expect(mockCreate).not.toHaveBeenCalled()
    expect(result.current.isActive).toBe(true)
  })
})

// #464: ya no hay cap FIFO de 5 (descartaba en silencio la sesión más antigua).
// La cola común de core no tira entrenos.
describe('sin cap: varias sesiones pendientes se conservan todas', () => {
  it('seis circuitos sin red quedan los seis encolados', async () => {
    connectivity.online = false
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })

    for (let i = 0; i < 6; i++) {
      act(() => { result.current.startCircuit(makeCircuit({ name: `Circuito ${i}` }), 'custom') })
      await act(async () => { await result.current.completeCircuit() })
    }

    const queue = queuedCircuits()
    expect(queue).toHaveLength(6)
    expect(queue.map(a => a.data.circuit_name)).toEqual([
      'Circuito 0', 'Circuito 1', 'Circuito 2', 'Circuito 3', 'Circuito 4', 'Circuito 5',
    ])
    expect(result.current.unsavedCount).toBe(6)
  })
})

describe('flush de la cola al montar (retry)', () => {
  it('reintenta crear en PB las sesiones encoladas y vacía la cola si todas se guardan', async () => {
    // Cola vieja (pre-#464): al montar se trasvasa a la de core y se drena.
    window.localStorage.setItem(UNSAVED_KEY, JSON.stringify([
      { circuit_name: 'A', user: 'u1' },
      { circuit_name: 'B', user: 'u1' },
    ]))

    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })

    await waitFor(() => expect(result.current.unsavedCount).toBe(0))
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(window.localStorage.getItem(UNSAVED_KEY)).toBeNull()
    expect(queuedCircuits()).toHaveLength(0)
  })

  it('al trasvasar la cola vieja le pone client_id a cada sesión', async () => {
    window.localStorage.setItem(UNSAVED_KEY, JSON.stringify([{ circuit_name: 'A', user: 'u1' }]))

    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })

    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
    expect(mockCreate.mock.calls[0][0].client_id).toBeTruthy()
    expect(result.current.unsavedCount).toBe(0)
  })

  it('si una falla por red y otra se guarda, deja solo la fallida en la cola', async () => {
    window.localStorage.setItem(UNSAVED_KEY, JSON.stringify([
      { circuit_name: 'ok', user: 'u1' },
      { circuit_name: 'falla', user: 'u1' },
    ]))
    const netErr: any = new Error('network down')
    netErr.status = 0
    mockCreate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(netErr)

    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })

    await waitFor(() => expect(result.current.unsavedCount).toBe(1))
    expect(queuedCircuits().map(a => a.data.circuit_name)).toEqual(['falla'])
  })

  // #464: el replay de una sesión que SÍ había llegado choca contra el índice
  // único parcial. Eso es «ya está», no un fallo: se descarta sin duplicar.
  it('un replay rechazado por el índice único se descarta sin duplicar', async () => {
    window.localStorage.setItem(UNSAVED_KEY, JSON.stringify([{ circuit_name: 'A', user: 'u1' }]))
    const dupErr: any = new Error('not unique')
    dupErr.status = 400
    dupErr.response = { data: { client_id: { code: 'validation_not_unique' } } }
    mockCreate.mockRejectedValueOnce(dupErr)

    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })

    await waitFor(() => expect(result.current.unsavedCount).toBe(0))
    expect(queuedCircuits()).toHaveLength(0)
    expect(mockReportError).not.toHaveBeenCalled()
  })

  it('sin userId no intenta el flush', () => {
    window.localStorage.setItem(UNSAVED_KEY, JSON.stringify([{ circuit_name: 'A' }]))

    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper(null) })

    expect(result.current.unsavedCount).toBe(0)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('abandonCircuit', () => {
  it('limpia storage, desactiva la sesión y trackea circuit_abandoned', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit({ mode: 'timed' }), 'preset') })

    act(() => { result.current.abandonCircuit() })

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(result.current.isActive).toBe(false)
    expect(result.current.circuit).toBeNull()
    expect(mockTrack).toHaveBeenCalledWith('circuit_abandoned', expect.objectContaining({
      mode: 'timed',
      source: 'preset',
    }))
  })

  it('sin circuito activo no trackea nada', () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })

    act(() => { result.current.abandonCircuit() })

    expect(mockTrack).not.toHaveBeenCalledWith('circuit_abandoned', expect.anything())
  })
})

describe('restauración desde localStorage', () => {
  it('restaura una sesión válida al montar (estado sincrónico en el primer render)', async () => {
    const circuit = makeCircuit()
    const progress = {
      currentRound: 1,
      currentExerciseIndex: 1,
      phase: 'exercise' as const,
      completedExercises: 3,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      circuit,
      progress,
      startedAt: Date.now(),
      isPaused: true,
      source: 'program',
      programId: 'prog1',
      programDayKey: 'day1',
    }))

    vi.resetModules()
    const fresh = await import('./CircuitSessionContext')
    function FreshWrapper({ children }: { children: ReactNode }) {
      return <fresh.CircuitSessionProvider userId="u1">{children}</fresh.CircuitSessionProvider>
    }
    const { result } = renderHook(() => fresh.useCircuitSession(), { wrapper: FreshWrapper })

    expect(result.current.isActive).toBe(true)
    expect(result.current.progress).toEqual(progress)
    expect(result.current.isPaused).toBe(true)
    expect(result.current.source).toBe('program')
    expect(result.current.programId).toBe('prog1')
  })

  it('descarta una sesión de más de 24h', async () => {
    const staleStartedAt = Date.now() - (25 * 60 * 60 * 1000)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      circuit: makeCircuit(),
      progress: { currentRound: 0, currentExerciseIndex: 0, phase: 'exercise', completedExercises: 0 },
      startedAt: staleStartedAt,
      isPaused: false,
      source: 'custom',
    }))

    vi.resetModules()
    const fresh = await import('./CircuitSessionContext')
    function FreshWrapper({ children }: { children: ReactNode }) {
      return <fresh.CircuitSessionProvider userId="u1">{children}</fresh.CircuitSessionProvider>
    }
    const { result } = renderHook(() => fresh.useCircuitSession(), { wrapper: FreshWrapper })

    expect(result.current.isActive).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('descarta JSON corrupto sin lanzar', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{not valid json')

    vi.resetModules()
    const fresh = await import('./CircuitSessionContext')
    function FreshWrapper({ children }: { children: ReactNode }) {
      return <fresh.CircuitSessionProvider userId="u1">{children}</fresh.CircuitSessionProvider>
    }
    const { result } = renderHook(() => fresh.useCircuitSession(), { wrapper: FreshWrapper })

    expect(result.current.isActive).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
