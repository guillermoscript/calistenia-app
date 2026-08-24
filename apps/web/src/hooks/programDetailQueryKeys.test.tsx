/**
 * `usePrograms` y `useProgramDetail` NO comparten entrada de caché (#606).
 *
 * Los dos hooks describen el mismo programa pero cachean formas incompatibles:
 *
 *   usePrograms      → { phases, weekDays, workoutsMap, cardioDayConfigs }
 *   useProgramDetail → { program, days }
 *
 * Hasta #606 los dos usaban `qk.programs.detail(programId)`. Como
 * `WorkoutContext` monta `usePrograms` globalmente, abrir la ficha del programa
 * ACTIVO ponía a las dos queries sobre la misma entrada: la última en resolver
 * pisaba a la otra, y la pisada leía un objeto sin sus campos y caía a su
 * fallback en silencio (ficha sin programa / semana hardcodeada).
 *
 * Los hooks viven en `packages/core`, cuyos tests corren en node sin
 * testing-library; aquí sí se pueden montar (web tiene jsdom). Este es el único
 * sitio del monorepo donde se puede afirmar que conviven sin pisarse.
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// `vi.mock` se iza al principio del fichero, así que su factoría no puede leer
// constantes de módulo. Las fixtures viven en un bloque izado con ella.
const fx = vi.hoisted(() => {
  const USER_ID = 'u1'
  const PROGRAM_ID = 'prog-activo'

  const DAY_FIELDS = {
    day_id: 'lun', day_name: 'Lunes de empuje', day_focus: 'Pecho y tríceps',
    day_type: 'strength', day_color: '#333333',
  }

  return {
    USER_ID,
    PROGRAM_ID,
    // Las dos consultas apuntan al MISMO programa, que es la precondición del
    // bug: la ficha se abre sobre el programa que `usePrograms` tiene activo.
    // Lleva `expand.program` porque el programa está VIVO y eso es lo que
    // devuelve PocketBase: desde #605 `fetchActiveEnrollment` pide
    // `expand: 'program'` y trata una inscripción sin él como huérfana (su
    // programa fue borrado), es decir «sin programa activo».
    ENROLLMENT: {
      id: 'e1',
      program: PROGRAM_ID,
      expand: { program: { id: PROGRAM_ID, name: 'Programa en la ficha' } },
    },
    // Nombre distinto en el catálogo y en el `getOne` de la ficha: así se ve de
    // qué consulta viene cada dato, y no basta con que "haya algo" en la caché.
    CATALOG_ROW: { id: PROGRAM_ID, name: 'Programa en el catálogo', duration_weeks: 8 },
    PROGRAM_ROW: { id: PROGRAM_ID, name: 'Programa en la ficha', duration_weeks: 8, days_per_week: 1 },
    PHASE_ROW: {
      id: 'ph1', phase_number: 1, name: 'Fase alfa', weeks: 4,
      color: '#111111', bg_color: '#222222', sort_order: 1,
    },
    DAY_CONFIG_ROW: { id: 'dc1', phase_number: 1, sort_order: 1, ...DAY_FIELDS },
    EXERCISE_ROW: {
      id: 'ex1', phase_number: 1, ...DAY_FIELDS,
      exercise_id: 'flexiones', exercise_name: 'Flexiones', sets: 3, reps: '10',
      rest_seconds: 60, muscles: 'pecho', workout_title: 'Empuje', sort_order: 1, section: 'main',
    },
  }
})

const { USER_ID, PROGRAM_ID } = fx

vi.mock('@calistenia/core/lib/pocketbase', () => {
  const list = (items: unknown[]) => ({
    items, page: 1, perPage: items.length, totalItems: items.length, totalPages: 1,
  })

  const collections: Record<string, any> = {
    programs: {
      getList: async () => list([fx.CATALOG_ROW]),
      getOne: async () => fx.PROGRAM_ROW,
    },
    user_programs: {
      getFirstListItem: async () => fx.ENROLLMENT,
    },
    program_phases: {
      getList: async () => list([fx.PHASE_ROW]),
    },
    program_exercises: {
      getList: async () => list([fx.EXERCISE_ROW]),
      getFullList: async () => [fx.EXERCISE_ROW],
    },
    program_day_config: {
      getList: async () => list([fx.DAY_CONFIG_ROW]),
      getFullList: async () => [fx.DAY_CONFIG_ROW],
    },
  }

  return {
    pb: {
      filter: (expr: string) => expr,
      collection: (name: string) =>
        collections[name] ?? { getList: async () => list([]), getFullList: async () => [] },
      authStore: { model: { id: fx.USER_ID }, isValid: true, onChange: () => () => {} },
    },
    isPocketBaseAvailable: async () => true,
  }
})

import { usePrograms } from '@calistenia/core/hooks/usePrograms'
import { useProgramDetail } from '@calistenia/core/hooks/useProgramDetail'
import { qk } from '@calistenia/core/lib/query-keys'

function mountBoth() {
  // Un ÚNICO QueryClient para los dos hooks: es lo que hace la app real y sin
  // eso el test no puede reproducir la colisión de claves.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )

  const hook = renderHook(
    () => ({
      programs: usePrograms(USER_ID),
      detail: useProgramDetail(PROGRAM_ID),
    }),
    { wrapper },
  )

  return { qc, ...hook }
}

describe('usePrograms + useProgramDetail sobre el mismo programa (#606)', () => {
  it('cada hook recibe SU forma, no la del otro', async () => {
    const { result } = mountBoth()

    await waitFor(() => {
      expect(result.current.programs.programsReady).toBe(true)
      expect(result.current.detail.loading).toBe(false)
    })

    // — La forma de useProgramDetail: { program, days } —
    await waitFor(() => expect(result.current.detail.program).not.toBeNull())
    expect(result.current.detail.program?.name).toBe('Programa en la ficha')
    expect(result.current.detail.days).toEqual([
      { dayId: 'lun', name: 'Lunes de empuje', focus: 'Pecho y tríceps', type: 'strength', color: '#333333' },
    ])

    // — La forma de usePrograms: phases/weekDays/workoutsMap —
    // `phases` con el nombre de la fixture demuestra que salió de la consulta y
    // NO de FALLBACK_PHASES, que es donde caía cuando la otra query pisaba la
    // entrada. Esa caída era silenciosa: por eso el bug sobrevivió desde #474.
    await waitFor(() => expect(result.current.programs.phases[0]?.name).toBe('Fase alfa'))
    expect(result.current.programs.phases).toHaveLength(1)

    const lunes = result.current.programs.weekDays.find(d => d.id === 'lun')
    expect(lunes?.name).toBe('Lunes de empuje')
    expect(result.current.programs.getWorkout(1, 'lun')).not.toBeNull()

    // Y el catálogo sigue siendo el suyo, distinto del `getOne` de la ficha.
    expect(result.current.programs.activeProgram?.name).toBe('Programa en el catálogo')
  })

  it('conviven como DOS entradas de caché distintas', async () => {
    const { result, qc } = mountBoth()

    await waitFor(() => {
      expect(result.current.programs.programsReady).toBe(true)
      expect(result.current.detail.program).not.toBeNull()
    })

    const detail = qc.getQueryData<any>(qk.programs.detail(PROGRAM_ID))
    const detailView = qc.getQueryData<any>(qk.programs.detailView(PROGRAM_ID))

    // Las dos existen a la vez — con la clave compartida solo podía haber una.
    expect(detail).toBeDefined()
    expect(detailView).toBeDefined()
    expect(detail).not.toBe(detailView)

    // Y cada una tiene exactamente los campos de su hook, ninguno del otro.
    expect(Object.keys(detail).sort()).toEqual(['cardioDayConfigs', 'phases', 'weekDays', 'workoutsMap'])
    expect(Object.keys(detailView).sort()).toEqual(['days', 'program'])
  })

  it('invalidar por qk.programs.all alcanza a las dos entradas', async () => {
    const { result, qc } = mountBoth()

    await waitFor(() => {
      expect(result.current.programs.programsReady).toBe(true)
      expect(result.current.detail.program).not.toBeNull()
    })

    // Se pregunta al propio matcher de React Query a qué entradas llegaría cada
    // filtro, en vez de invalidar y mirar `stale`: las dos queries tienen
    // observadores montados, así que refetchean al instante y vuelven a estar
    // frescas antes de poder comprobarlo.
    const reached = (queryKey: readonly unknown[]) =>
      qc.getQueryCache().findAll({ queryKey }).map(q => q.queryKey)

    // Lo que hacen ahora `refreshPrograms` y `saveProgram`: llegan a las dos.
    expect(reached(qk.programs.all)).toEqual(
      expect.arrayContaining([qk.programs.detail(PROGRAM_ID), qk.programs.detailView(PROGRAM_ID)]),
    )

    // Y la regresión que hay que evitar: la clave literal que usaban antes
    // (`['programs','detail']`) alcanza a `detail` pero NO a `detailView`. Con
    // ella, guardar el programa dejaba la ficha con datos viejos.
    expect(reached(['programs', 'detail'])).toContainEqual(qk.programs.detail(PROGRAM_ID))
    expect(reached(['programs', 'detail'])).not.toContainEqual(qk.programs.detailView(PROGRAM_ID))
  })
})
