import { describe, it, expect } from 'vitest'
import {
  buyIngredientCount,
  buyIngredientNames,
  collectPlanIngredients,
  planDateKey,
  planSources,
} from './plan-shopping'
import type { MealDayPlan, Recipe, RecipeIngredient, WeeklyPlanDay, WeeklyPlannedMeal } from '../types'

const TODAY = '2026-07-30'

const ing = (over: Partial<RecipeIngredient> = {}): RecipeIngredient => ({
  name: 'Pollo',
  name_normalized: 'pollo',
  qty: 200,
  unit: 'g',
  from: 'buy',
  ...over,
})

const recipe = (ingredients: RecipeIngredient[]): Recipe => ({
  steps: ['cocinar'],
  ingredients,
  prep_minutes: 20,
  servings: 1,
})

const meal = (over: Partial<WeeklyPlannedMeal> = {}): WeeklyPlannedMeal => ({
  id: 'm1',
  meal_type: 'almuerzo',
  label: 'Pollo con arroz',
  description: '',
  calories: 500,
  protein: 40,
  carbs: 50,
  fat: 12,
  logged: false,
  recipe: recipe([ing()]),
  ...over,
})

const dayPlan = (over: Partial<MealDayPlan> = {}): MealDayPlan => ({
  id: 'dp1',
  user: 'u1',
  target_date: TODAY,
  source: 'buy',
  macro_basis: 'remaining',
  status: 'active',
  goal_snapshot: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
  pantry_snapshot: [],
  meals: [meal()],
  notes: '',
  ai_model: 'gpt',
  ...over,
})

const weekDay = (over: Partial<WeeklyPlanDay> = {}): WeeklyPlanDay => ({
  id: 'wd1',
  plan: 'p1',
  user: 'u1',
  date: `${TODAY} 00:00:00.000Z`,
  day_index: 3,
  meals: [meal({ id: 'wm1' })],
  notes: '',
  ...over,
})

describe('planDateKey', () => {
  it('recorta el timestamp de PocketBase al día', () => {
    expect(planDateKey('2026-07-30 00:00:00.000Z')).toBe('2026-07-30')
    expect(planDateKey('2026-07-30')).toBe('2026-07-30')
    expect(planDateKey(null)).toBe('')
    expect(planDateKey(undefined)).toBe('')
  })
})

describe('planSources', () => {
  it('junta plan semanal y planes de día', () => {
    const sources = planSources(
      [dayPlan({ target_date: '2026-07-31' })],
      [weekDay({ date: '2026-07-29 00:00:00.000Z', day_index: 2 })],
    )
    expect(sources.map((s) => s.date)).toEqual(['2026-07-29', '2026-07-31'])
  })

  it('si un día tiene ambos, gana el plan de día (más reciente y específico)', () => {
    const sources = planSources(
      [dayPlan({ meals: [meal({ id: 'gana', label: 'Del plan de día' })] })],
      [weekDay()],
    )
    expect(sources).toHaveLength(1)
    expect((sources[0].meals[0] as WeeklyPlannedMeal).id).toBe('gana')
  })

  it('ignora planes de día archivados', () => {
    expect(planSources([dayPlan({ status: 'archived' })], [])).toEqual([])
  })

  it('ignora filas sin fecha utilizable', () => {
    expect(planSources([dayPlan({ target_date: '' })], [weekDay({ date: '' })])).toEqual([])
  })

  it('tolera meals nulo (planes viejos o a medio escribir)', () => {
    const sources = planSources(
      [dayPlan({ meals: null as unknown as WeeklyPlannedMeal[] })],
      [],
    )
    expect(sources[0].meals).toEqual([])
  })
})

describe('collectPlanIngredients', () => {
  it('devuelve los ingredientes de los días de hoy en adelante', () => {
    const sources = planSources(
      [
        dayPlan({ id: 'a', target_date: TODAY, meals: [meal({ recipe: recipe([ing({ name_normalized: 'hoy' })]) })] }),
        dayPlan({ id: 'b', target_date: '2026-07-31', meals: [meal({ recipe: recipe([ing({ name_normalized: 'manana' })]) })] }),
      ],
      [],
    )
    expect(collectPlanIngredients(sources, TODAY).map((i) => i.name_normalized)).toEqual(['hoy', 'manana'])
  })

  it('descarta los días pasados: no se compra para ayer', () => {
    const sources = planSources([dayPlan({ target_date: '2026-07-29' })], [])
    expect(collectPlanIngredients(sources, TODAY)).toEqual([])
  })

  it('descarta las comidas ya registradas', () => {
    const sources = planSources(
      [dayPlan({ meals: [meal({ id: 'x', logged: true }), meal({ id: 'y', recipe: recipe([ing({ name_normalized: 'pendiente' })]) })] })],
      [],
    )
    expect(collectPlanIngredients(sources, TODAY).map((i) => i.name_normalized)).toEqual(['pendiente'])
  })

  it('incluye los ingredientes from:pantry — el diff contra despensa es de buildShoppingList', () => {
    const sources = planSources(
      [dayPlan({ meals: [meal({ recipe: recipe([ing({ name_normalized: 'arroz', from: 'pantry' }), ing()]) })] })],
      [],
    )
    expect(collectPlanIngredients(sources, TODAY).map((i) => i.from)).toEqual(['pantry', 'buy'])
  })

  it('tolera comidas sin receta (planes anteriores a #171 F2)', () => {
    const sources = planSources([dayPlan({ meals: [meal({ recipe: null })] })], [])
    expect(collectPlanIngredients(sources, TODAY)).toEqual([])
  })

  it('descarta ingredientes sin name_normalized (no se puede matchear nada)', () => {
    const sources = planSources(
      [dayPlan({ meals: [meal({ recipe: recipe([ing({ name_normalized: '' }), ing()]) })] })],
      [],
    )
    expect(collectPlanIngredients(sources, TODAY)).toHaveLength(1)
  })

  it('el plan semanal sigue aportando ingredientes (no se rompe lo que ya funcionaba)', () => {
    const sources = planSources([], [weekDay({ date: '2026-08-01 00:00:00.000Z' })])
    expect(collectPlanIngredients(sources, TODAY)).toHaveLength(1)
  })
})

describe('buyIngredientNames', () => {
  it('cuenta solo los from:buy y deduplica por nombre normalizado', () => {
    const sources = planSources(
      [
        dayPlan({ id: 'a', target_date: TODAY, meals: [meal({ recipe: recipe([ing(), ing({ name_normalized: 'arroz', from: 'pantry' })]) })] }),
        dayPlan({ id: 'b', target_date: '2026-07-31', meals: [meal({ recipe: recipe([ing(), ing({ name_normalized: 'huevos' })]) })] }),
      ],
      [],
    )
    expect(buyIngredientNames(sources, TODAY).sort()).toEqual(['huevos', 'pollo'])
    expect(buyIngredientCount(sources, TODAY)).toBe(2)
  })

  it('un plan hecho solo con la despensa no manda nada a comprar', () => {
    const sources = planSources(
      [dayPlan({ source: 'pantry', meals: [meal({ recipe: recipe([ing({ from: 'pantry' })]) })] })],
      [],
    )
    expect(buyIngredientCount(sources, TODAY)).toBe(0)
  })
})
