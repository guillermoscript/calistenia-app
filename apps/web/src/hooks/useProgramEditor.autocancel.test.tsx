/**
 * Tests de `useProgramEditor.saveProgram` frente a la auto-cancelación del SDK
 * de PocketBase (issue #536).
 *
 * El hook vive en `packages/core`, pero los tests de core corren en node sin
 * testing-library, así que el único sitio donde se puede montar es aquí (web
 * tiene jsdom).
 *
 * `programEditorDiff.test.ts` ya cubre el diff y el orden de las operaciones,
 * pero lo hace con un writer de mentira, y la auto-cancelación **solo existe en
 * el `pb` real**: por eso el bug pasó por delante de esa suite. El doble de
 * `pbAutoCancelStub` sí la reproduce, así que un guardado de 4 fases y 28 días
 * falla aquí exactamente como fallaba en el navegador.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const pbStub = await vi.hoisted(async () => {
  const { createPbAutoCancelStub } = await import('../test/pbAutoCancelStub')
  return createPbAutoCancelStub()
})

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    baseUrl: 'http://pb.test',
    filter: (expr: string) => expr,
    collection: pbStub.collection,
  },
  isPocketBaseAvailable: () => Promise.resolve(true),
}))

// `saveProgram` reporta a monitoreo en el catch, y sin `initCore()` getPlatform()
// lanza — lo que taparía el fallo real con una excepción distinta.
const reportError = vi.fn()
vi.mock('@calistenia/core/platform', () => ({
  getPlatform: () => ({ reportError }),
}))

import { useProgramEditor } from '@calistenia/core/hooks/useProgramEditor'

type Editor = ReturnType<typeof useProgramEditor>

/** Último valor devuelto por el hook — se reasigna en cada render. */
let editor: Editor

function Harness() {
  editor = useProgramEditor()
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

const exercise = (id: string) => ({
  exerciseId: id,
  name: id,
  sets: 3,
  reps: '10',
  rest: 60,
  muscles: '',
  note: '',
  youtube: '',
  priority: 'med' as const,
  isTimer: false,
  timerSeconds: 0,
  section: 'main' as const,
})

/** Escrituras del guardado reconciliado (el `create` de `programs` va aparte). */
const reconciledWrites = () => pbStub.writes.filter(w => w.collection.startsWith('program_'))

describe('useProgramEditor — auto-cancelación de PocketBase (#536)', () => {
  beforeEach(() => {
    pbStub.reset()
    reportError.mockClear()
  })

  it('guarda las 4 fases y los 28 días de configuración, no una de cada', async () => {
    mount()

    await act(async () => {
      editor.updateInfo({ name: 'Mi programa' })
    })
    // Dos ejercicios en el mismo día: dos altas concurrentes más contra la
    // misma colección, que es la condición exacta que se perdía.
    await act(async () => {
      editor.addExercise('0_lun', exercise('flexiones'))
      editor.addExercise('0_lun', exercise('fondos'))
    })

    let savedId: string | null = null
    await act(async () => {
      savedId = await editor.saveProgram('user_1')
    })

    expect(savedId).toBeTruthy()
    expect(editor.state.error).toBeNull()
    expect(reportError).not.toHaveBeenCalled()

    // Lo que el bug dejaba en 1 / 1 / 1.
    expect(pbStub.rows.program_phases ?? []).toHaveLength(4)
    expect(pbStub.rows.program_day_config ?? []).toHaveLength(28)
    expect(pbStub.rows.program_exercises ?? []).toHaveLength(2)

    // Y ninguna petición llegó a abortarse.
    expect(pbStub.aborted).toEqual([])
  })

  it('pasa requestKey: null en cada escritura del guardado reconciliado', async () => {
    mount()

    await act(async () => {
      editor.updateInfo({ name: 'Mi programa' })
    })
    await act(async () => {
      editor.addExercise('0_lun', exercise('flexiones'))
    })
    await act(async () => {
      await editor.saveProgram('user_1')
    })

    const writes = reconciledWrites()
    expect(writes.length).toBeGreaterThan(0)
    for (const w of writes) {
      expect(w.options, `${w.op} en ${w.collection}`).toEqual({ requestKey: null })
    }
  })

  it('reconcilia un segundo guardado tras quitar una fase', async () => {
    mount()

    await act(async () => {
      editor.updateInfo({ name: 'Mi programa' })
    })
    await act(async () => {
      await editor.saveProgram('user_1')
    })
    expect(pbStub.rows.program_phases ?? []).toHaveLength(4)

    await act(async () => {
      editor.removePhase(3)
    })
    await act(async () => {
      await editor.saveProgram('user_1')
    })

    expect(editor.state.error).toBeNull()
    // Los borrados de la fase sobrante y de sus 7 días también van en paralelo.
    expect(pbStub.rows.program_phases ?? []).toHaveLength(3)
    expect(pbStub.rows.program_day_config ?? []).toHaveLength(21)
    expect(pbStub.aborted).toEqual([])
  })
})
