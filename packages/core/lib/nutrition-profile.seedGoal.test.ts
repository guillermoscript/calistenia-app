/**
 * Cobertura de `seedAutoNutritionGoal`: el puente que evita que el onboarding
 * pregunte peso/altura/edad/sexo y el wizard de `/nutrition` los vuelva a
 * pedir acto seguido.
 *
 * Importa además porque es el ÚNICO sitio donde edad y sexo se persisten:
 * `users` los borró por PII (migración 1781800000) y su hogar es la fila de
 * `nutrition_goals`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const getFirstListItem = vi.fn()
const create = vi.fn()

vi.mock('./pocketbase', () => ({
  pb: {
    filter: (s: string) => s,
    collection: () => ({
      getFirstListItem: (...a: unknown[]) => getFirstListItem(...a),
      create: (...a: unknown[]) => create(...a),
    }),
  },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

const storageSet = vi.fn()
vi.mock('../platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  storage: {
    getItem: vi.fn(() => null),
    setItem: (...a: unknown[]) => storageSet(...a),
    removeItem: vi.fn(),
  },
}))

import { seedAutoNutritionGoal } from './nutrition-profile'

const INPUT = {
  weight: 78,
  height: 180,
  age: 30,
  sex: 'male' as const,
  activityLevel: 'active' as const,
  goal: 'fat_loss' as const,
  pace: 'balanced' as const,
}

/** Ningún objetivo previo: PB responde 404 a la búsqueda. */
const noExistingGoal = () => getFirstListItem.mockRejectedValue(new Error('404'))

beforeEach(() => {
  getFirstListItem.mockReset()
  create.mockReset()
  storageSet.mockReset()
  create.mockResolvedValue({ id: 'goal1' })
})

describe('seedAutoNutritionGoal', () => {
  it('crea el objetivo con edad y sexo, que es lo que `users` ya no guarda', async () => {
    noExistingGoal()
    const goal = await seedAutoNutritionGoal('u1', INPUT)

    expect(create).toHaveBeenCalledTimes(1)
    const body = create.mock.calls[0][0] as Record<string, unknown>
    expect(body.age).toBe(30)
    expect(body.sex).toBe('male')
    expect(body.user).toBe('u1')
    expect(goal?.age).toBe(30)
    expect(goal?.sex).toBe('male')
  })

  it('marca el objetivo como `auto` para que se recalcule al cambiar el perfil', async () => {
    noExistingGoal()
    const goal = await seedAutoNutritionGoal('u1', INPUT)

    expect((create.mock.calls[0][0] as Record<string, unknown>).source).toBe('auto')
    expect(goal?.source).toBe('auto')
  })

  it('deriva calorías y macros reales, no ceros', async () => {
    noExistingGoal()
    const goal = await seedAutoNutritionGoal('u1', INPUT)

    // Valor de la fórmula (Mifflin-St Jeor → TDEE → déficit balanceado) para
    // este perfil concreto: si cambia, el usuario recién registrado vería otros
    // números, así que el test debe cantarlo.
    expect(goal?.dailyCalories).toBeGreaterThan(1500)
    expect(goal?.dailyCalories).toBeLessThan(3500)
    expect(goal?.dailyProtein).toBeGreaterThan(0)
    expect(goal?.dailyCarbs).toBeGreaterThan(0)
    expect(goal?.dailyFat).toBeGreaterThan(0)
    // Es 'fat_loss': el déficit tiene que dejarlo por debajo del TDEE.
    const maintenance = (await import('./nutritionGoal')).calculateMacros(
      78, 180, 30, 'male', 'active', 'maintain',
    )
    expect(goal!.dailyCalories).toBeLessThan(maintenance.dailyCalories)
  })

  it('no pisa un objetivo que ya existe — rehacer el onboarding es idempotente', async () => {
    getFirstListItem.mockResolvedValue({ id: 'existing', source: 'manual' })

    expect(await seedAutoNutritionGoal('u1', INPUT)).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('si la escritura falla devuelve null sin lanzar: no puede tumbar el onboarding', async () => {
    noExistingGoal()
    create.mockRejectedValue(new Error('500'))

    await expect(seedAutoNutritionGoal('u1', INPUT)).resolves.toBeNull()
  })

  it('deja el objetivo en localStorage para que `/nutrition` no parpadee al entrar', async () => {
    noExistingGoal()
    await seedAutoNutritionGoal('u1', INPUT)

    expect(storageSet).toHaveBeenCalledWith(
      'calistenia_nutrition_goals',
      expect.stringContaining('"source":"auto"'),
    )
  })
})
