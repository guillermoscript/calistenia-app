/**
 * Subida de portada y de media por ejercicio desde el editor (issue #618).
 *
 * Los tres campos (`programs.cover_image`, `program_exercises.demo_images` y
 * `demo_video`) existían en PocketBase desde `1774000014` / `1774000002` y ya
 * se leían, pero `saveProgram` no los escribía nunca: la base de datos entera
 * tenía 0 imágenes.
 *
 * Lo que se afirma aquí no es «que se suba un fichero» — eso lo cubren las
 * reglas puras de `packages/core/lib/programMedia.test.ts` — sino las tres
 * cosas que solo se pueden ver montando el hook contra un `pb` de verdad:
 *
 *   1. Un guardado que NO toca media no emite ninguna petición de más. Es la
 *      regresión que rompería el reconciliador de #463: los ficheros no pueden
 *      entrar en el diff porque un fichero nunca coincide con el nombre de
 *      fichero que devuelve el servidor, y entonces TODAS las filas de
 *      ejercicios se marcarían como cambiadas en cada guardado.
 *   2. La portada viaja como multipart en una petición aparte del texto.
 *   3. La media cae en la fila correcta cuando el mismo ejercicio aparece dos
 *      veces en el mismo día — el caso donde la clave natural de
 *      `programEditorDiff` se desempata por repetición.
 *
 * Igual que en `useProgramEditor.autocancel.test.tsx`, el hook vive en
 * `packages/core` pero solo se puede montar desde web (es quien tiene jsdom).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
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
    collection: (name: string) => pbStub.collection(name),
    files: { getURL: (rec: { id: string }, name: string) => `http://pb.test/f/${rec.id}/${name}` },
  },
  isPocketBaseAvailable: () => Promise.resolve(true),
}))

// `saveProgram` reporta a monitoreo en el catch, y sin `initCore()` getPlatform()
// lanza — lo que taparía el fallo real con una excepción distinta.
vi.mock('@calistenia/core/platform', () => ({
  getPlatform: () => ({ reportError: vi.fn() }),
}))

import { useProgramEditor, type EditorExercise } from '@calistenia/core/hooks/useProgramEditor'
import type { EditorMediaFile } from '@calistenia/core/lib/programMedia'

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

const DAY_KEY = '0_lun'

const exercise = (id: string, extra: Partial<EditorExercise> = {}): EditorExercise => ({
  exerciseId: id,
  name: id,
  sets: 3,
  reps: '10',
  rest: 60,
  muscles: '',
  note: '',
  youtube: '',
  priority: 'med',
  isTimer: false,
  timerSeconds: 0,
  section: 'main',
  ...extra,
})

const mediaFile = (name: string, type = 'image/jpeg'): EditorMediaFile => ({
  blob: new Blob(['x'], { type }),
  name,
  type,
})

/** Escrituras sobre una colección, en el orden en que se intentaron. */
const writesTo = (collection: string, op?: 'create' | 'update' | 'delete') =>
  pbStub.writes.filter(w => w.collection === collection && (!op || w.op === op))

beforeEach(() => {
  pbStub.reset()
})

describe('saveProgram sin media pendiente (#618 / #463)', () => {
  it('no emite ninguna escritura de más sobre programs ni program_exercises', async () => {
    mount()
    await act(async () => {
      editor.updateInfo({ name: 'Programa sin fotos' })
    })
    await act(async () => {
      editor.addExercise(DAY_KEY, exercise('dominadas'))
    })
    await act(async () => {
      await editor.saveProgram('user_1')
    })

    // Un create del programa y ninguna actualización: si aquí apareciera un
    // update, sería la subida de portada disparándose sin portada.
    expect(writesTo('programs', 'create')).toHaveLength(1)
    expect(writesTo('programs', 'update')).toHaveLength(0)

    // Una sola fila de ejercicio y ningún update encima: el update sería la
    // pasada de media corriendo sin media que subir.
    expect(writesTo('program_exercises', 'create')).toHaveLength(1)
    expect(writesTo('program_exercises', 'update')).toHaveLength(0)
  })

  it('marcar «quitar» sobre un programa que nunca tuvo portada tampoco escribe', async () => {
    mount()
    await act(async () => {
      editor.updateInfo({ name: 'Programa sin fotos', coverRemoved: true })
    })
    await act(async () => {
      await editor.saveProgram('user_1')
    })
    expect(writesTo('programs', 'update')).toHaveLength(0)
  })
})

describe('portada (#618)', () => {
  it('sube el fichero en un multipart aparte del texto del programa', async () => {
    mount()
    await act(async () => {
      editor.updateInfo({ name: 'Con portada', coverFile: mediaFile('cover.webp', 'image/webp') })
    })
    await act(async () => {
      await editor.saveProgram('user_1')
    })

    // El texto sigue viajando como JSON: meter el fichero en `programData`
    // obligaría a serializar a mano los campos i18n (`{es,en}`).
    const created = writesTo('programs', 'create')[0]
    expect(created.data).not.toBeInstanceOf(FormData)
    expect((created.data as Record<string, unknown>).cover_image).toBeUndefined()

    const updates = writesTo('programs', 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].data).toBeInstanceOf(FormData)
    expect((updates[0].data as FormData).getAll('cover_image')).toHaveLength(1)
  })

  it('el guardado deja de tener la portada pendiente, así que no se sube dos veces', async () => {
    mount()
    await act(async () => {
      editor.updateInfo({ name: 'Con portada', coverFile: mediaFile('cover.jpg') })
    })
    await act(async () => {
      await editor.saveProgram('user_1')
    })
    expect(editor.state.info.coverFile).toBeNull()

    await act(async () => {
      await editor.saveProgram('user_1')
    })
    // Sigue habiendo UNA sola subida: la segunda pasada no reenvía el fichero.
    expect(writesTo('programs', 'update').filter(w => w.data instanceof FormData)).toHaveLength(1)
  })
})

describe('media por ejercicio (#618)', () => {
  it('cae en la fila del ejercicio, no en otra', async () => {
    mount()
    await act(async () => {
      editor.updateInfo({ name: 'Con demos' })
    })
    await act(async () => {
      editor.addExercise(DAY_KEY, exercise('flexiones'))
      editor.addExercise(DAY_KEY, exercise('dominadas', { pendingImages: [mediaFile('demo-0.png', 'image/png')] }))
    })
    await act(async () => {
      await editor.saveProgram('user_1')
    })

    const updates = writesTo('program_exercises', 'update')
    expect(updates).toHaveLength(1)
    const target = pbStub.rows.program_exercises.find(r => r.id === updates[0].id)
    expect(target?.exercise_id).toBe('dominadas')
    expect((updates[0].data as FormData).getAll('demo_images')).toHaveLength(1)
  })

  it('con el mismo ejercicio repetido en el día, acierta la ocurrencia', async () => {
    // Es el caso que rompe una clave posicional ingenua: `programEditorDiff`
    // desempata por número de repetición, y la pasada de media tiene que
    // reconstruir esa MISMA clave leyendo en orden de `sort_order`.
    mount()
    await act(async () => {
      editor.updateInfo({ name: 'Dos veces dominadas' })
    })
    await act(async () => {
      editor.addExercise(DAY_KEY, exercise('dominadas'))
      editor.addExercise(DAY_KEY, exercise('dominadas', { pendingVideo: mediaFile('demo.mp4', 'video/mp4') }))
    })
    await act(async () => {
      await editor.saveProgram('user_1')
    })

    const updates = writesTo('program_exercises', 'update')
    expect(updates).toHaveLength(1)
    const target = pbStub.rows.program_exercises.find(r => r.id === updates[0].id)
    // La SEGUNDA fila del día es la que llevaba el vídeo.
    expect(target?.sort_order).toBe(2)
    expect((updates[0].data as FormData).getAll('demo_video')).toHaveLength(1)
  })

  it('quitar una imagen guardada manda demo_images- y no pisa las demás', async () => {
    mount()
    await act(async () => {
      editor.updateInfo({ name: 'Quitar una demo' })
    })
    await act(async () => {
      editor.addExercise(DAY_KEY, exercise('fondos', {
        demoImages: ['a.png', 'b.png'],
        removedImages: ['b.png'],
      }))
    })
    await act(async () => {
      await editor.saveProgram('user_1')
    })

    const form = writesTo('program_exercises', 'update')[0].data as FormData
    expect(form.getAll('demo_images-')).toEqual(['b.png'])
    // Vacío a propósito: mandar `demo_images` sustituiría la lista entera y
    // `a.png` desaparecería sin que nadie lo haya pedido.
    expect(form.getAll('demo_images')).toEqual([])
  })
})
