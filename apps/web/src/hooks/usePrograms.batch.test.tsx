/**
 * `duplicateProgram` y `deleteProgram` sin bucles de una petición por fila (#614).
 *
 * Duplicar creaba las fases, los day-configs y los ejercicios de uno en uno, con
 * un `await` por fila: el programa más grande de la base (732 ejercicios) son
 * ~764 viajes en serie, y un fallo a mitad dejaba una copia incompleta y viva en
 * el catálogo. Borrar hacía lo mismo al revés — y encima de más: las tres
 * colecciones hijas tienen `cascadeDelete: true`, así que PocketBase ya las
 * borraba solo.
 *
 * El hook vive en `packages/core`, pero los tests de core corren en node sin
 * testing-library, así que el único sitio donde se puede montar es aquí (web
 * tiene jsdom) — igual que `useProgramEditor.autocancel.test.tsx`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** Toda petición que el hook manda a PocketBase, en orden. */
type Call =
  | { kind: 'create'; collection: string; data: Record<string, unknown> }
  | { kind: 'delete'; collection: string; id: string }
  | { kind: 'getFullList'; collection: string }
  | { kind: 'getList'; collection: string }
  | { kind: 'batchSend'; creates: Array<{ collection: string; data: Record<string, unknown> }> }

const calls: Call[] = []

/** Lo que devuelve `send()` del batch. Se reasigna por test. */
let batchSendImpl: () => Promise<unknown> = () => Promise.resolve([])
/** Filas por colección que ven los `getFullList` del duplicado. */
let childRows: Record<string, Array<Record<string, unknown>>> = {}

const pbStub = vi.hoisted(() => ({}))

vi.mock('@calistenia/core/lib/pocketbase', () => {
  const collection = (name: string) => ({
    getOne: () => Promise.resolve({
      id: 'prog-src', name: { es: 'Fuerza', en: 'Strength' }, description: {},
      duration_weeks: 12, is_official: true, is_featured: true, difficulty: 'intermediate',
    }),
    create: (data: Record<string, unknown>) => {
      calls.push({ kind: 'create', collection: name, data })
      return Promise.resolve({ id: name === 'programs' ? 'prog-copy' : `${name}-new`, ...data })
    },
    delete: (id: string) => {
      calls.push({ kind: 'delete', collection: name, id })
      return Promise.resolve(true)
    },
    getFullList: () => {
      calls.push({ kind: 'getFullList', collection: name })
      return Promise.resolve(childRows[name] ?? [])
    },
    getList: () => {
      calls.push({ kind: 'getList', collection: name })
      return Promise.resolve({ items: [], totalItems: 0 })
    },
    getFirstListItem: () => Promise.reject({ status: 404 }),
  })

  return {
    pb: {
      baseUrl: 'http://pb.test',
      authStore: { isValid: true },
      files: { getURL: () => '' },
      filter: (expr: string, params: Record<string, string>) =>
        expr.replace(/\{:(\w+)\}/g, (_m, key: string) => JSON.stringify(params[key])),
      collection,
      createBatch: () => {
        const creates: Array<{ collection: string; data: Record<string, unknown> }> = []
        return {
          collection: (name: string) => ({
            create: (data: Record<string, unknown>) => { creates.push({ collection: name, data }) },
          }),
          send: () => {
            calls.push({ kind: 'batchSend', creates })
            return batchSendImpl()
          },
        }
      },
    },
    isPocketBaseAvailable: () => Promise.resolve(true),
    ...pbStub,
  }
})

// Sin `initCore()` `getPlatform()` lanza, y esa excepción taparía la que se
// quiere observar.
vi.mock('@calistenia/core/platform', () => ({
  getPlatform: () => ({ reportError: vi.fn() }),
}))

import { usePrograms } from '@calistenia/core/hooks/usePrograms'

type Programs = ReturnType<typeof usePrograms>

let hook: Programs

function Harness() {
  hook = usePrograms('user-1')
  return null
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  )
}

/** Solo las peticiones de escritura, que son las que cuenta este issue. */
const writes = () => calls.filter(c => c.kind === 'create' || c.kind === 'delete' || c.kind === 'batchSend')

beforeEach(() => {
  calls.length = 0
  batchSendImpl = () => Promise.resolve([])
  childRows = {
    program_phases: [
      { id: 'ph-1', phase_number: 1, name: { es: 'Base' }, weeks: '1-4', color: 'a', bg_color: 'b', sort_order: 0 },
    ],
    program_day_config: [
      { id: 'dc-1', phase_number: 1, day_id: 'lun', day_name: {}, day_type: 'circuit', day_focus: {}, day_color: 'c', sort_order: 0, circuit_rounds: 3 },
    ],
    program_exercises: [
      { id: 'ex-1', phase_number: 1, day_id: 'lun', exercise_id: 'burpees', exercise_name: {}, sets: 3, reps: '10', sort_order: 0 },
      { id: 'ex-2', phase_number: 1, day_id: 'lun', exercise_id: 'plank', exercise_name: {}, sets: 3, reps: '30', sort_order: 1 },
    ],
  }
  console.warn = vi.fn()
  console.error = vi.fn()
})

describe('duplicateProgram', () => {
  it('crea el programa y manda TODAS las hijas en un solo batch', async () => {
    mount()
    let newId: string | null = null
    await act(async () => { newId = await hook.duplicateProgram('prog-src') })

    expect(newId).toBe('prog-copy')

    // Una sola escritura suelta (el programa padre) y un solo batch: nada de
    // una petición por fila.
    const w = writes()
    expect(w).toHaveLength(2)
    expect(w[0]).toMatchObject({ kind: 'create', collection: 'programs' })
    expect(w[1].kind).toBe('batchSend')

    const batch = w[1] as Extract<Call, { kind: 'batchSend' }>
    expect(batch.creates.map(c => c.collection)).toEqual([
      'program_phases', 'program_day_config', 'program_exercises', 'program_exercises',
    ])
    // Todas las hijas cuelgan de la copia, no del original.
    for (const c of batch.creates) expect(c.data.program).toBe('prog-copy')
  })

  it('la copia nace privada y sin las banderas de oficial/destacado', async () => {
    mount()
    await act(async () => { await hook.duplicateProgram('prog-src') })

    const parent = writes()[0] as Extract<Call, { kind: 'create' }>
    expect(parent.data.visibility).toBe('private')
    expect(parent.data.is_official).toBe(false)
    expect(parent.data.is_featured).toBe(false)
    expect(parent.data.created_by).toBe('user-1')
  })

  it('si el batch falla (400 de una sub-petición), borra el programa nuevo', async () => {
    // 400 es el código con el que PocketBase rechaza una sub-petición que no
    // pasa la create rule: eso NO es «la API no está», es un fallo de verdad.
    batchSendImpl = () => Promise.reject({ status: 400, message: 'Batch transaction failed.' })
    mount()
    let newId: string | null = 'no-asignado'
    await act(async () => { newId = await hook.duplicateProgram('prog-src') })

    expect(newId).toBeNull()
    // El rollback es UN delete sobre `programs`: cascadea sobre las hijas, así
    // que no hace falta (ni debe haber) un delete por fila.
    const deletes = calls.filter(c => c.kind === 'delete')
    expect(deletes).toEqual([{ kind: 'delete', collection: 'programs', id: 'prog-copy' }])
    // Y no se reintenta en secuencial: el 400 no es señal de fallback.
    expect(calls.filter(c => c.kind === 'create')).toHaveLength(1)
  })

  it('si el servidor no tiene la API batch (403), copia en secuencial y termina bien', async () => {
    // 403 «Batch requests are not allowed.» es lo que devuelve un PocketBase con
    // `batch.enabled = false` — comprobado contra el binario. NO devuelve 404,
    // que es lo que uno esperaría de un endpoint apagado.
    batchSendImpl = () => Promise.reject({ status: 403, message: 'Batch requests are not allowed.' })
    mount()
    let newId: string | null = null
    await act(async () => { newId = await hook.duplicateProgram('prog-src') })

    // Un servidor sin la migración duplica lento, pero duplica: el botón no se
    // rompe, y sobre todo NO se hace rollback de una copia que sí entró.
    expect(newId).toBe('prog-copy')
    expect(calls.filter(c => c.kind === 'delete')).toEqual([])
    expect(calls.filter(c => c.kind === 'create').map(c => (c as any).collection)).toEqual([
      'programs', 'program_phases', 'program_day_config', 'program_exercises', 'program_exercises',
    ])
  })

  it('lee las hijas enteras: ni un `getList` con tope', async () => {
    mount()
    await act(async () => { await hook.duplicateProgram('prog-src') })

    const read = calls.filter(c => c.kind === 'getFullList').map(c => (c as any).collection)
    expect(read).toEqual(expect.arrayContaining(['program_phases', 'program_day_config', 'program_exercises']))
    // `user_programs` sigue usando `getList` en otras rutas del hook; aquí lo
    // que importa es que ninguna de las TRES hijas se lea paginada a mano.
    const paged = calls.filter(c => c.kind === 'getList').map(c => (c as any).collection)
    expect(paged).not.toContain('program_phases')
    expect(paged).not.toContain('program_day_config')
    expect(paged).not.toContain('program_exercises')
  })
})

describe('deleteProgram', () => {
  it('borra SOLO el programa: las hijas las cascadea PocketBase', async () => {
    mount()
    let ok = false
    await act(async () => { ok = await hook.deleteProgram('prog-src') })

    expect(ok).toBe(true)

    const deleted = calls.filter(c => c.kind === 'delete').map(c => (c as any).collection)
    expect(deleted).toEqual(['programs'])
  })

  it('ni siquiera lista las colecciones hijas para borrarlas', async () => {
    mount()
    await act(async () => { await hook.deleteProgram('prog-src') })

    // Listarlas sería la señal de que el bucle ha vuelto: el coste de los ~760
    // viajes empezaba en estas tres lecturas.
    const touched = calls
      .filter(c => c.kind === 'getList' || c.kind === 'getFullList')
      .map(c => (c as any).collection)
    expect(touched).not.toContain('program_exercises')
    expect(touched).not.toContain('program_day_config')
    expect(touched).not.toContain('program_phases')
  })
})
