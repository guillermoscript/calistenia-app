/**
 * Regresión de #565: barrido de auto-cancelación del SDK de PocketBase.
 *
 * La clave de cancelación por defecto es método+ruta (la query string no
 * cuenta), así que dos lecturas concurrentes de la misma colección se abortan
 * entre sí salvo que pasen `requestKey`. Los grupos de este test son los que
 * el issue marca como deterministas: la pantalla de nutrición monta
 * `useBodyProfile` + `useUserCurrency` a la vez (dos `getOne` del mismo
 * usuario y un `getFirstListItem` de `nutrition_goals`), la despensa monta
 * `usePantryItems` + `usePantryHistory` lado a lado, y `fetchMonthActivity`
 * lanza nueve lecturas en un `Promise.allSettled`.
 *
 * Reusa el emulador de #536 (`pbAutoCancelStub`): si alguien quita los
 * `requestKey: null`, `stub.aborted` deja de estar vacío y los hooks vuelven
 * a degradar en silencio a «sin datos».
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
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
    files: { getURL: () => 'http://pb.test/file' },
  },
  isPocketBaseAvailable: () => Promise.resolve(true),
}))

import { useBodyProfile } from '@calistenia/core/hooks/useBodyProfile'
import { useUserCurrency } from '@calistenia/core/hooks/useUserCurrency'
import { usePantryItems, usePantryHistory } from '@calistenia/core/hooks/usePantry'
import { fetchMonthActivity } from '@calistenia/core/lib/monthActivity'

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('auto-cancelación de PocketBase — barrido #565', () => {
  beforeEach(() => {
    pbStub.reset()
  })

  it('users + nutrition_goals: useBodyProfile y useUserCurrency montados a la vez sobreviven', async () => {
    pbStub.rows.users = [
      { id: 'user1', height: 180, weight: 75, default_currency: 'VES', currency_rates: { VES: 140 } },
    ]
    pbStub.rows.nutrition_goals = [{ id: 'goals1', user: 'user1', sex: 'male' }]

    const { result } = renderHook(
      () => ({
        body: useBodyProfile('user1'),
        currency: useUserCurrency('user1'),
      }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => {
      expect(result.current.body.isReady).toBe(true)
      expect(result.current.currency.prefs.defaultCurrency).toBe('VES')
    })

    // El bug dejaba el perfil en {} (cada catch degradaba el aborto a undefined).
    expect(result.current.body.profile).toEqual({ heightCm: 180, weightKg: 75, sex: 'male' })
    expect(result.current.currency.prefs.rates).toEqual({ VES: 140 })
    expect(pbStub.aborted).toEqual([])
  })

  it('pantry_items: usePantryItems y usePantryHistory lado a lado sobreviven', async () => {
    pbStub.rows.pantry_items = [
      { id: 'p1', user: 'user1', name: 'Pollo', name_normalized: 'pollo', status: 'active' },
      { id: 'p2', user: 'user1', name: 'Arroz', name_normalized: 'arroz', status: 'consumed' },
    ]

    const { result } = renderHook(
      () => ({
        items: usePantryItems('user1'),
        history: usePantryHistory('user1'),
      }),
      { wrapper: makeWrapper() },
    )

    await waitFor(() => {
      expect(result.current.items.isSuccess).toBe(true)
      expect(result.current.history.isSuccess).toBe(true)
    })

    expect(result.current.items.data?.map((i) => i.id)).toEqual(['p1', 'p2'])
    expect(result.current.history.data?.map((i) => i.id)).toEqual(['p1', 'p2'])
    expect(pbStub.aborted).toEqual([])
  })

  it('monthActivity: sobrevive a otras lecturas de las mismas colecciones en la misma pantalla', async () => {
    const at = '2026-08-10 12:00:00.000Z'
    pbStub.rows.cardio_sessions = [{ id: 'c1', started_at: at, distance_km: 5, duration_seconds: 1800, activity_type: 'running' }]
    pbStub.rows.circuit_sessions = [{ id: 'ci1', started_at: at, total_rounds: 3, duration_seconds: 600 }]
    pbStub.rows.nutrition_entries = [{ id: 'n1', logged_at: at, calories: 500 }]
    pbStub.rows.water_entries = [{ id: 'w1', logged_at: at, amount_ml: 250 }]
    pbStub.rows.sleep_entries = [{ id: 's1', date: '2026-08-10 00:00:00.000Z', duration_minutes: 480, quality: 4 }]
    pbStub.rows.weight_entries = [{ id: 'we1', date: '2026-08-10 00:00:00.000Z', weight_kg: 75 }]
    pbStub.rows.body_measurements = [{ id: 'bm1', date: '2026-08-10 00:00:00.000Z', waist: 80 }]
    pbStub.rows.body_photos = [{ id: 'bp1', date: '2026-08-10 00:00:00.000Z', photo: 'x.jpg' }]
    pbStub.rows.lumbar_checks = [{ id: 'l1', date: '2026-08-10 00:00:00.000Z', pain_level: 2 }]

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // Las nueve colecciones son distintas entre sí, así que el `allSettled`
      // no se pisa solo: lo que lo mataba eran los hooks vecinos del calendario
      // (useSleep, useWeight, useBodyMeasurements…) lanzando la MISMA ruta con
      // la clave por defecto un tick después. Se emulan con lecturas crudas.
      const siblings = ['sleep_entries', 'weight_entries', 'body_measurements', 'circuit_sessions', 'nutrition_entries']
      const [month] = await Promise.all([
        fetchMonthActivity('user1', 2026, 7),
        ...siblings.map((c) => pbStub.collection(c).getFullList()),
      ])
      // Cada fuente abortada se registraba como warning y quedaba vacía.
      expect(pbStub.aborted).toEqual([])
      expect(warn).not.toHaveBeenCalled()
      expect(month.cardio).toHaveLength(1)
      expect(month.circuits).toHaveLength(1)
      expect(Object.keys(month.nutritionByDate)).toHaveLength(1)
      expect(Object.keys(month.waterByDate)).toHaveLength(1)
      expect(Object.keys(month.sleepByDate)).toHaveLength(1)
      expect(Object.keys(month.weightByDate)).toHaveLength(1)
    } finally {
      warn.mockRestore()
    }
  })
})
