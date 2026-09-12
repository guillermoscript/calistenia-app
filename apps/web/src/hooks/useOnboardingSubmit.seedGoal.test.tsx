/**
 * El onboarding preguntaba peso, altura, edad y sexo, y al entrar en
 * `/nutrition` el wizard los pedía otra vez desde cero. Peso y altura estaban
 * guardados (el wizard simplemente no los leía a tiempo), pero edad y sexo se
 * tiraban de verdad: `users` los borró por PII (migración 1781800000) y nadie
 * los escribía en su sitio, la fila de `nutrition_goals`.
 *
 * Aquí se cubre el puente: al guardar las metas ya está todo lo que necesita la
 * fórmula, así que el objetivo se siembra y `/nutrition` no vuelve a preguntar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const update = vi.fn().mockResolvedValue({})
const create = vi.fn().mockResolvedValue({ id: 'goal1' })
const getFirstListItem = vi.fn()

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    baseUrl: 'http://pb.test',
    filter: (expr: string) => expr,
    collection: (name: string) => ({
      update: (...a: unknown[]) => update(name, ...a),
      create: (...a: unknown[]) => create(name, ...a),
      getFirstListItem: (...a: unknown[]) => getFirstListItem(name, ...a),
    }),
  },
  isPocketBaseAvailable: () => Promise.resolve(true),
}))

vi.mock('@calistenia/core/lib/analytics', () => ({
  op: { track: vi.fn() },
  trackCanonicalEvent: vi.fn(),
  CANONICAL_ANALYTICS_EVENTS: {},
}))

import { useOnboardingSubmit } from '@calistenia/core/hooks/useOnboardingSubmit'
import type { BasicsValues, GoalsValues } from '@calistenia/core/types/onboarding'

type Submit = ReturnType<typeof useOnboardingSubmit>
let submit: Submit

function Harness() {
  submit = useOnboardingSubmit({ userId: 'u1', captureException: vi.fn() })
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

const BASICS: BasicsValues = { weight: '78', height: '180', age: '30', sex: 'male' }
const GOALS: GoalsValues = {
  primary_goal: 'perder_grasa',
  goal_weight: '72',
  waist: '',
  activity_level: 'active',
  pace: 'balanced',
}

/** Filas creadas en una colección concreta durante el test. */
const createdIn = (collection: string) =>
  create.mock.calls.filter(c => c[0] === collection).map(c => c[1] as Record<string, unknown>)

beforeEach(() => {
  update.mockClear()
  create.mockClear()
  getFirstListItem.mockReset()
  // Usuario nuevo: todavía no tiene objetivo de nutrición.
  getFirstListItem.mockRejectedValue(new Error('404'))
})

describe('useOnboardingSubmit — siembra del objetivo de nutrición', () => {
  it('guarda edad y sexo en `nutrition_goals`, que es lo único que los conserva', async () => {
    mount()
    await act(async () => { await submit.saveGoals(GOALS, BASICS) })

    const goals = createdIn('nutrition_goals')
    expect(goals).toHaveLength(1)
    expect(goals[0].age).toBe(30)
    expect(goals[0].sex).toBe('male')
  })

  it('siembra el objetivo completo, para que `/nutrition` no pregunte nada', async () => {
    mount()
    await act(async () => { await submit.saveGoals(GOALS, BASICS) })

    const [goal] = createdIn('nutrition_goals')
    expect(goal.weight).toBe(78)
    expect(goal.height).toBe(180)
    expect(goal.activity_level).toBe('moderate') // 'active' del onboarding → escala de 5 de nutrición
    expect(goal.goal).toBe('fat_loss')
    expect(goal.source).toBe('auto')
    expect(goal.daily_calories).toBeGreaterThan(0)
  })

  it('sin los básicos no siembra: el wizard sigue siendo el camino', async () => {
    mount()
    await act(async () => { await submit.saveGoals(GOALS) })

    expect(createdIn('nutrition_goals')).toHaveLength(0)
  })

  it('con un paso omitido (falta el sexo) no inventa un objetivo a medias', async () => {
    mount()
    await act(async () => { await submit.saveGoals(GOALS, { ...BASICS, sex: '' }) })

    expect(createdIn('nutrition_goals')).toHaveLength(0)
  })

  it('sin nivel de actividad tampoco siembra: la fórmula lo necesita', async () => {
    mount()
    await act(async () => { await submit.saveGoals({ ...GOALS, activity_level: '' }, BASICS) })

    expect(createdIn('nutrition_goals')).toHaveLength(0)
  })

  it('si la siembra falla, el paso de metas sigue dando OK y el flujo avanza', async () => {
    create.mockImplementation((name: string) =>
      name === 'nutrition_goals' ? Promise.reject(new Error('500')) : Promise.resolve({ id: 'x' }),
    )
    mount()

    let ok: boolean | undefined
    await act(async () => { ok = await submit.saveGoals(GOALS, BASICS) })

    expect(ok).toBe(true)
    // Y lo importante del paso —el perfil de metas en `users`— sí se guardó.
    expect(update).toHaveBeenCalledWith('users', 'u1', expect.objectContaining({ primary_goal: 'perder_grasa' }))
  })

  it('no pisa el objetivo de quien ya lo tenía (onboarding rehecho)', async () => {
    getFirstListItem.mockResolvedValue({ id: 'existing', source: 'manual' })
    mount()
    await act(async () => { await submit.saveGoals(GOALS, BASICS) })

    expect(createdIn('nutrition_goals')).toHaveLength(0)
  })
})
