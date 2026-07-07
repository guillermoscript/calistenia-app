import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { CircuitDefinition } from '@calistenia/core/types'

// pb/op se mockean: CircuitSessionContext los usa para persistir sesiones
// completadas (pb.collection('circuit_sessions').create) y trackear eventos.
const { mockCreate, mockTrack } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockTrack: vi.fn(),
}))

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: { collection: vi.fn(() => ({ create: mockCreate })) },
}))

vi.mock('@calistenia/core/lib/analytics', () => ({
  op: { track: mockTrack },
}))

import { CircuitSessionProvider, useCircuitSession } from './CircuitSessionContext'

const STORAGE_KEY = 'calistenia_circuit_active'
const UNSAVED_KEY = 'calistenia_circuit_unsaved'

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

  // OJO: en modo timed, el fin de ronda SIEMPRE pasa por 'roundRest' sin
  // consultar restBetweenRounds (a diferencia del modo circuit, que si
  // restBetweenRounds===0 salta directo a la siguiente ronda). Si el usuario
  // configura un circuito timed con restBetweenRounds=0 esperando "sin pausa
  // entre rondas", igual verá la pantalla de roundRest. Puede ser intencional
  // (roundRest en timed usa su propio breather) pero la asimetría entre modos
  // no está documentada — la caracterizamos, no la arreglamos.
  it('OJO: fin de ronda en timed ignora restBetweenRounds=0 (asimetría vs modo circuit)', () => {
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

    expect(result.current.progress.phase).toBe('roundRest') // no salta a la siguiente ronda como haría modo circuit
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

  it('si PB falla: no lanza, encola en calistenia_circuit_unsaved y actualiza unsavedCount', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network down'))
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })

    await act(async () => { await expect(result.current.completeCircuit()).resolves.toBeUndefined() })

    expect(result.current.unsavedCount).toBe(1)
    const queue = JSON.parse(window.localStorage.getItem(UNSAVED_KEY) ?? '[]')
    expect(queue).toHaveLength(1)
    // sigue desactivando la sesión aunque el guardado remoto haya fallado
    expect(result.current.isActive).toBe(false)
  })

  // OJO: si pb.create falla, doComplete igual llama a op.track('circuit_completed')
  // (ver CircuitSessionContext.tsx tras el catch) — el evento de analítica se
  // dispara aunque la sesión sólo haya quedado en cola local sin confirmarse
  // guardada en PocketBase. Si el flush posterior también falla, analytics
  // registra una sesión "completada" que nunca llegó al backend.
  it('OJO: circuit_completed se trackea igual aunque el guardado en PB haya fallado', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network down'))
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })

    await act(async () => { await result.current.completeCircuit() })

    expect(mockTrack).toHaveBeenCalledWith('circuit_completed', expect.anything())
  })

  it('sin userId (guard): no llama a PB ni cambia el estado', async () => {
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper(null) })
    act(() => { result.current.startCircuit(makeCircuit(), 'custom') })

    await act(async () => { await result.current.completeCircuit() })

    expect(mockCreate).not.toHaveBeenCalled()
    expect(result.current.isActive).toBe(true)
  })
})

describe('cola de sesiones no guardadas: cap FIFO de 5', () => {
  it('al encolar 6 sesiones fallidas, quedan las 5 más recientes (se cae la más vieja)', async () => {
    mockCreate.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })

    for (let i = 0; i < 6; i++) {
      act(() => { result.current.startCircuit(makeCircuit({ name: `Circuito ${i}` }), 'custom') })
      await act(async () => { await result.current.completeCircuit() })
    }

    const queue = JSON.parse(window.localStorage.getItem(UNSAVED_KEY) ?? '[]')
    expect(queue).toHaveLength(5)
    expect(queue.map((s: { circuit_name: string }) => s.circuit_name)).toEqual([
      'Circuito 1', 'Circuito 2', 'Circuito 3', 'Circuito 4', 'Circuito 5',
    ])
    expect(result.current.unsavedCount).toBe(5)
  })
})

describe('flush de la cola al montar (retry)', () => {
  it('reintenta crear en PB las sesiones encoladas y vacía la cola si todas se guardan', async () => {
    window.localStorage.setItem(UNSAVED_KEY, JSON.stringify([
      { circuit_name: 'A', user: 'u1' },
      { circuit_name: 'B', user: 'u1' },
    ]))

    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })

    await waitFor(() => expect(result.current.unsavedCount).toBe(0))
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(window.localStorage.getItem(UNSAVED_KEY)).toBeNull()
  })

  it('si una falla y otra se guarda, deja solo la fallida en la cola', async () => {
    window.localStorage.setItem(UNSAVED_KEY, JSON.stringify([
      { circuit_name: 'ok', user: 'u1' },
      { circuit_name: 'falla', user: 'u1' },
    ]))
    mockCreate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('network down'))

    const { result } = renderHook(() => useCircuitSession(), { wrapper: makeWrapper('u1') })

    await waitFor(() => expect(result.current.unsavedCount).toBe(1))
    const queue = JSON.parse(window.localStorage.getItem(UNSAVED_KEY) ?? '[]')
    expect(queue).toEqual([{ circuit_name: 'falla', user: 'u1' }])
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
