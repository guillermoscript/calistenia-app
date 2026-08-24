/**
 * Ida y vuelta de la configuración de circuitos del editor (issue #601).
 *
 * El editor escribía `circuit_mode`, `circuit_rounds`, `circuit_work_seconds`,
 * `circuit_rest_seconds`, `circuit_rest_between_exercises` y
 * `circuit_rest_between_rounds` a `program_day_config`, pero ninguno existía en
 * el esquema. PocketBase **descarta en silencio** los campos que no conoce: el
 * POST devolvía 200, nadie veía un error, y al reabrir el editor el día de
 * circuito volvía a los valores por defecto.
 *
 * Por eso este test no vale de nada si el stub acepta cualquier campo — pasaría
 * en verde con y sin migración, que es exactamente lo que dejó pasar el bug. El
 * doble de `pb` de aquí **replica el descarte silencioso**: filtra el cuerpo de
 * las escrituras a `program_day_config` contra los nombres de campo declarados
 * en `pb_migrations/`. Si alguien borra o renombra la migración, el guardado
 * pierde los seis campos y estos tests se ponen rojos.
 *
 * Igual que en `useProgramEditor.autocancel.test.tsx`, el hook vive en
 * `packages/core` pero solo se puede montar desde web (es quien tiene jsdom).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const pbStub = await vi.hoisted(async () => {
  const { createPbAutoCancelStub } = await import('../test/pbAutoCancelStub')
  const fs = await import('node:fs')
  const path = await import('node:path')

  // Nombres de campo que `program_day_config` acepta de verdad, leídos de las
  // migraciones: cualquier literal en snake_case de los ficheros que tocan esa
  // colección. Es deliberadamente generoso (también entran nombres de tipo o de
  // colección); lo que importa es que un campo que NINGUNA migración declara no
  // esté en el conjunto.
  //
  // La raíz se busca subiendo desde el cwd en vez de con `import.meta.url`:
  // bajo la transformación de vitest ese URL no es de esquema `file:`.
  const findMigrationsDir = () => {
    let dir = process.cwd()
    for (let i = 0; i < 6; i++) {
      const candidate = path.join(dir, 'pb_migrations')
      if (fs.existsSync(candidate)) return candidate
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    throw new Error(`no se encontró pb_migrations/ subiendo desde ${process.cwd()}`)
  }
  const migrationsDir = findMigrationsDir()
  const schemaFields = new Set<string>(['id'])
  for (const file of fs.readdirSync(migrationsDir)) {
    if (!file.endsWith('.js')) continue
    const source = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    const touchesDayConfig =
      file.includes('program_day_config') ||
      source.includes('program_day_config') ||
      source.includes('pbc_4000000075')
    if (!touchesDayConfig) continue
    for (const [, name] of source.matchAll(/['"]([a-z][a-z0-9_]*)['"]/g)) {
      schemaFields.add(name)
    }
  }

  const stub = createPbAutoCancelStub()
  const rawCollection = stub.collection

  /** Lo que hace PocketBase con un campo que no está en el esquema: tirarlo. */
  const dropUnknownFields = (data: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(data).filter(([k]) => schemaFields.has(k)))

  stub.collection = (name: string) => {
    const api = rawCollection(name)
    if (name !== 'program_day_config') return api
    return {
      ...api,
      create: (data: Record<string, unknown>, options?: unknown) =>
        api.create(dropUnknownFields(data), options),
      update: (id: string, data: Record<string, unknown>, options?: unknown) =>
        api.update(id, dropUnknownFields(data), options),
    }
  }

  return Object.assign(stub, { schemaFields })
})

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    baseUrl: 'http://pb.test',
    filter: (expr: string) => expr,
    collection: (name: string) => pbStub.collection(name),
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

/** Monta una instancia limpia del editor (simula reabrir la pantalla). */
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

/** El miércoles de la primera fase, convertido en día de circuito. */
const DAY_KEY = '0_mie'

/**
 * Valores deliberadamente distintos de los defaults del lector
 * (`circuit`/3/40/20/0/60): si la ida y vuelta se pierde, `loadProgram` los
 * repone y el test ve los defaults, no lo guardado.
 */
const CIRCUIT = {
  circuitMode: 'timed' as const,
  circuitRounds: 5,
  circuitWorkSeconds: 45,
  circuitRestSeconds: 15,
  // El 0 va a propósito: un `number` marcado `required` en PocketBase lo
  // rechaza, así que este campo también vigila que la migración no los marque.
  circuitRestBetweenExercises: 0,
  circuitRestBetweenRounds: 90,
}

async function saveCircuitProgram(): Promise<string | null> {
  mount()
  await act(async () => {
    editor.updateInfo({ name: 'Programa con circuito' })
  })
  await act(async () => {
    editor.updateDay(DAY_KEY, { type: 'circuit', ...CIRCUIT })
  })
  await act(async () => {
    editor.addExercise(DAY_KEY, exercise('burpees'))
  })
  let savedId: string | null = null
  await act(async () => {
    savedId = await editor.saveProgram('user_1')
  })
  return savedId
}

const savedDayConfig = () =>
  (pbStub.rows.program_day_config ?? []).find(
    r => r.day_id === 'mie' && r.phase_number === 1,
  )

describe('useProgramEditor — configuración de circuito en program_day_config (#601)', () => {
  beforeEach(() => {
    pbStub.reset()
    reportError.mockClear()
  })

  it('alguna migración declara los seis campos de circuito', () => {
    // Guardia directa sobre el esquema: sin esto, el resto de tests podrían
    // volverse verdes por accidente si el filtro dejara de filtrar.
    for (const field of [
      'circuit_mode',
      'circuit_rounds',
      'circuit_work_seconds',
      'circuit_rest_seconds',
      'circuit_rest_between_exercises',
      'circuit_rest_between_rounds',
    ]) {
      expect(
        pbStub.schemaFields.has(field),
        `ninguna migración de pb_migrations/ declara ${field} en program_day_config`,
      ).toBe(true)
    }
  })

  it('persiste los seis campos al guardar un día de tipo circuito', async () => {
    const savedId = await saveCircuitProgram()

    expect(savedId).toBeTruthy()
    expect(editor.state.error).toBeNull()
    expect(reportError).not.toHaveBeenCalled()

    const row = savedDayConfig()
    expect(row, 'no se guardó la fila de program_day_config del miércoles').toBeTruthy()
    expect(row).toMatchObject({
      day_type: 'circuit',
      circuit_mode: 'timed',
      circuit_rounds: 5,
      circuit_work_seconds: 45,
      circuit_rest_seconds: 15,
      circuit_rest_between_exercises: 0,
      circuit_rest_between_rounds: 90,
    })
  })

  it('recupera los mismos valores al recargar el editor', async () => {
    const savedId = await saveCircuitProgram()
    expect(savedId).toBeTruthy()

    // Editor nuevo: es el "reabrir el programa" del bug.
    mount()
    await act(async () => {
      await editor.loadProgram(savedId!)
    })

    expect(editor.state.error).toBeNull()
    const day = editor.state.days[DAY_KEY]
    expect(day.type).toBe('circuit')
    expect({
      circuitMode: day.circuitMode,
      circuitRounds: day.circuitRounds,
      circuitWorkSeconds: day.circuitWorkSeconds,
      circuitRestSeconds: day.circuitRestSeconds,
      circuitRestBetweenExercises: day.circuitRestBetweenExercises,
      circuitRestBetweenRounds: day.circuitRestBetweenRounds,
    }).toEqual(CIRCUIT)
  })

  it('deja los campos a cero cuando el día deja de ser de circuito', async () => {
    const savedId = await saveCircuitProgram()
    expect(savedId).toBeTruthy()

    await act(async () => {
      editor.updateDay(DAY_KEY, { type: 'push' })
    })
    await act(async () => {
      await editor.saveProgram('user_1')
    })

    // Que el guardado no falle es la mitad del test: con estos campos marcados
    // `required`, PocketBase rechazaría el 0 y el día no se podría guardar.
    expect(editor.state.error).toBeNull()
    expect(savedDayConfig()).toMatchObject({
      day_type: 'push',
      circuit_mode: '',
      circuit_rounds: 0,
      circuit_work_seconds: 0,
      circuit_rest_seconds: 0,
      circuit_rest_between_exercises: 0,
      circuit_rest_between_rounds: 0,
    })
  })
})
