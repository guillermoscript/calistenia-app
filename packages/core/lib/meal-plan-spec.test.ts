import { describe, it, expect, vi, afterEach } from 'vitest'
import { setTimezone } from './dateUtils'
import {
  COVERED_KCAL_THRESHOLD,
  MAX_PENDING_JOBS,
  disabledReason,
  effectiveBase,
  planDates,
  resolveBudget,
  resolveDispatch,
  targetDateFor,
  type BlockerInput,
  type PlanBase,
  type PlanDates,
  type PlanHorizon,
} from './meal-plan-spec'
import type { DailyTotals, PantrySnapshotItem } from '../types'

afterEach(() => {
  vi.useRealTimers()
  setTimezone('UTC')
})

const GOALS: DailyTotals = { calories: 2400, protein: 180, carbs: 240, fat: 80 }
const ZERO: DailyTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }

const DATES: PlanDates = {
  today: '2026-07-30',
  tomorrow: '2026-07-31',
  weekStart: '2026-07-27',
}

const pantryItem = (over: Partial<PantrySnapshotItem> = {}): PantrySnapshotItem => ({
  name: 'Arroz',
  name_normalized: 'arroz',
  category: 'carbohidrato',
  quantity: 2,
  unit: 'kg',
  expiry_estimate: null,
  confidence: 'high',
  ...over,
})

const ITEMS = [pantryItem(), pantryItem({ name: 'Huevos', name_normalized: 'huevos', category: 'proteina', quantity: 12, unit: 'unidad' })]

// ── resolveBudget ────────────────────────────────────────────────────────────

describe('resolveBudget', () => {
  it('sin metas no hay presupuesto', () => {
    expect(resolveBudget({ horizon: 'today', goals: null, todayTotals: ZERO, loggedMealTypes: [] })).toBeNull()
  })

  it('HOY descuenta lo ya comido y se marca como restante', () => {
    const budget = resolveBudget({
      horizon: 'today',
      goals: GOALS,
      todayTotals: { calories: 900, protein: 70, carbs: 90, fat: 30 },
      loggedMealTypes: ['desayuno'],
    })
    expect(budget).toEqual({
      kind: 'remaining',
      calories: 1500,
      protein: 110,
      carbs: 150,
      fat: 50,
      loggedMealTypes: ['desayuno'],
    })
  })

  it('HOY nunca devuelve macros negativos si el usuario se pasó', () => {
    const budget = resolveBudget({
      horizon: 'today',
      goals: GOALS,
      todayTotals: { calories: 3000, protein: 200, carbs: 300, fat: 120 },
      loggedMealTypes: ['desayuno', 'almuerzo', 'cena'],
    })
    expect(budget).toMatchObject({ kind: 'remaining', calories: 0, protein: 0, carbs: 0, fat: 0 })
  })

  it.each(['tomorrow', 'week'] as const)(
    '%s planifica el día COMPLETO e ignora lo comido hoy',
    (horizon) => {
      const budget = resolveBudget({
        horizon,
        goals: GOALS,
        todayTotals: { calories: 2000, protein: 150, carbs: 200, fat: 70 },
        loggedMealTypes: ['desayuno', 'almuerzo'],
      })
      // Éste es el doble conteo que tenía la pantalla vieja: lo que comí HOY
      // no puede recortar el plan de MAÑANA.
      expect(budget).toEqual({
        kind: 'full',
        calories: 2400,
        protein: 180,
        carbs: 240,
        fat: 80,
        loggedMealTypes: [],
      })
    },
  )

  it('redondea macros fraccionarios (los goals calculados traen decimales)', () => {
    const budget = resolveBudget({
      horizon: 'today',
      goals: { calories: 2400.4, protein: 180.6, carbs: 240.5, fat: 80.2 },
      todayTotals: { calories: 900.2, protein: 70.1, carbs: 90.3, fat: 30.9 },
      loggedMealTypes: [],
    })
    expect(Object.values(budget!).every((v) => (typeof v === 'number' ? Number.isInteger(v) : true))).toBe(true)
  })
})

// ── effectiveBase ────────────────────────────────────────────────────────────

describe('effectiveBase', () => {
  it('sin despensa, "con lo que tengo" cae a "lo que compro"', () => {
    expect(effectiveBase('pantry', 0)).toBe('buy')
  })

  it('con despensa respeta lo pedido', () => {
    expect(effectiveBase('pantry', 3)).toBe('pantry')
    expect(effectiveBase('buy', 3)).toBe('buy')
    expect(effectiveBase('buy', 0)).toBe('buy')
  })
})

// ── planDates ────────────────────────────────────────────────────────────────

describe('planDates', () => {
  it('usa la fecha LOCAL del usuario, no UTC', () => {
    // 2026-07-31 03:30 UTC = 2026-07-30 23:30 en Caracas (UTC-4).
    // Con toISOString() el plan de "hoy" se archivaría con la fecha de mañana.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-31T03:30:00Z'))
    setTimezone('America/Caracas')

    const dates = planDates()
    expect(dates.today).toBe('2026-07-30')
    expect(dates.tomorrow).toBe('2026-07-31')
    expect(new Date('2026-07-31T03:30:00Z').toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('weekStart es el lunes de la semana en curso (day_index 0 = lunes)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T12:00:00Z')) // jueves
    setTimezone('UTC')
    expect(planDates().weekStart).toBe('2026-07-27') // lunes
  })

  it('tomorrow cruza fin de mes correctamente', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-31T12:00:00Z'))
    setTimezone('UTC')
    expect(planDates().tomorrow).toBe('2026-08-01')
  })
})

describe('targetDateFor', () => {
  it('today y week apuntan a hoy; tomorrow a mañana', () => {
    expect(targetDateFor('today', DATES)).toBe('2026-07-30')
    expect(targetDateFor('tomorrow', DATES)).toBe('2026-07-31')
    expect(targetDateFor('week', DATES)).toBe('2026-07-30')
  })
})

// ── resolveDispatch: la matriz 3×2 completa ──────────────────────────────────

describe('resolveDispatch', () => {
  const dispatch = (horizon: PlanHorizon, base: PlanBase, over: Partial<Parameters<typeof resolveDispatch>[0]> = {}) =>
    resolveDispatch({
      horizon,
      base,
      budget: resolveBudget({
        horizon,
        goals: GOALS,
        todayTotals: { calories: 900, protein: 70, carbs: 90, fat: 30 },
        loggedMealTypes: ['desayuno'],
      })!,
      goalType: 'muscle_gain',
      pantryItems: ITEMS,
      dates: DATES,
      ...over,
    })

  it('HOY + tengo → pantry-day síncrono, hoy, presupuesto RESTANTE', () => {
    const d = dispatch('today', 'pantry')
    expect(d.mode).toBe('sync')
    expect(d.endpoint).toBe('pantry-day')
    expect(d.body).toEqual({
      horizon: 'day',
      target_date: '2026-07-30',
      pantry_items: ITEMS,
      goals: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      budget_kind: 'remaining',
    })
  })

  it('HOY + compro → free-day síncrono conservando logged_meal_types', () => {
    const d = dispatch('today', 'buy')
    expect(d.mode).toBe('sync')
    expect(d.endpoint).toBe('free-day')
    expect(d.body).toEqual({
      remaining_calories: 1500,
      remaining_protein: 110,
      remaining_carbs: 150,
      remaining_fat: 50,
      logged_meal_types: ['desayuno'],
      pantry_items: ITEMS,
    })
  })

  it('MAÑANA + tengo → pantry-day con fecha de mañana y presupuesto COMPLETO', () => {
    const d = dispatch('tomorrow', 'pantry')
    expect(d.endpoint).toBe('pantry-day')
    expect(d.body).toMatchObject({
      target_date: '2026-07-31',
      budget_kind: 'full',
      goals: { calories: 2400, protein: 180, carbs: 240, fat: 80 },
    })
  })

  it('MAÑANA + compro → free-day con macros COMPLETOS y sin comidas registradas', () => {
    const d = dispatch('tomorrow', 'buy')
    expect(d.endpoint).toBe('free-day')
    // El endpoint no tiene target_date: la fecha la pone el cliente al persistir.
    expect(d.mode === 'sync' && d.targetDate).toBe('2026-07-31')
    expect(d.body).toEqual({
      remaining_calories: 2400,
      remaining_protein: 180,
      remaining_carbs: 240,
      remaining_fat: 80,
      logged_meal_types: [],
      pantry_items: ITEMS,
    })
  })

  it('SEMANA + tengo → job pantry-week desde el lunes', () => {
    const d = dispatch('week', 'pantry')
    expect(d.mode).toBe('job')
    expect(d.endpoint).toBe('pantry-week')
    expect(d.body).toEqual({
      week_start: '2026-07-27',
      pantry_items: ITEMS,
      goals: { calories: 2400, protein: 180, carbs: 240, fat: 80 },
    })
  })

  it('SEMANA + compro → job free-week con el objetivo del usuario', () => {
    const d = dispatch('week', 'buy')
    expect(d.mode).toBe('job')
    expect(d.endpoint).toBe('free-week')
    expect(d.body).toEqual({
      daily_calories: 2400,
      daily_protein: 180,
      daily_carbs: 240,
      daily_fat: 80,
      goal: 'muscle_gain',
      week_start: '2026-07-27',
      pantry_items: ITEMS,
    })
  })

  it('cada celda de la matriz produce un endpoint distinto (sin botones duplicados)', () => {
    const endpoints = (['today', 'tomorrow', 'week'] as const).flatMap((h) =>
      (['pantry', 'buy'] as const).map((b) => `${h}/${dispatch(h, b).endpoint}`),
    )
    expect(new Set(endpoints).size).toBe(6)
  })

  it('con despensa vacía NUNCA emite un endpoint pantry (esos 400 con items vacíos)', () => {
    for (const horizon of ['today', 'tomorrow', 'week'] as const) {
      const d = dispatch(horizon, 'pantry', { pantryItems: [] })
      expect(d.base).toBe('buy')
      expect(d.endpoint).not.toContain('pantry')
      expect((d.body as { pantry_items: unknown[] }).pantry_items).toEqual([])
    }
  })

  it('los planes libres mandan la despensa solo para etiquetar, sin restringir', () => {
    // Mismo inventario en ambas bases: en 'buy' viaja como contexto de
    // etiquetado (from: pantry|buy), no como restricción.
    expect((dispatch('today', 'buy').body as { pantry_items: unknown[] }).pantry_items).toEqual(ITEMS)
    expect((dispatch('week', 'buy').body as { pantry_items: unknown[] }).pantry_items).toEqual(ITEMS)
  })
})

// ── disabledReason ───────────────────────────────────────────────────────────

describe('disabledReason', () => {
  const base = (over: Partial<BlockerInput> = {}): BlockerInput => ({
    horizon: 'today',
    base: 'buy',
    budget: { kind: 'remaining', calories: 1500, protein: 110, carbs: 150, fat: 50, loggedMealTypes: [] },
    pantryCount: 3,
    planJobPending: false,
    pendingJobs: 0,
    ...over,
  })

  it('todo en orden → sin bloqueo', () => {
    expect(disabledReason(base())).toBeNull()
  })

  it('sin metas gana sobre cualquier otro motivo', () => {
    expect(
      disabledReason(base({ budget: null, horizon: 'week', planJobPending: true, pendingJobs: 9, pantryCount: 0, base: 'pantry' })),
    ).toBe('noGoals')
  })

  it('job de plan en vuelo gana sobre cola llena', () => {
    expect(disabledReason(base({ horizon: 'week', planJobPending: true, pendingJobs: MAX_PENDING_JOBS }))).toBe('jobPending')
  })

  it('cola llena bloquea el semanal', () => {
    expect(disabledReason(base({ horizon: 'week', pendingJobs: MAX_PENDING_JOBS }))).toBe('queueFull')
  })

  it('la cola de jobs NO bloquea los planes de día (son síncronos)', () => {
    for (const horizon of ['today', 'tomorrow'] as const) {
      expect(disabledReason(base({ horizon, planJobPending: true, pendingJobs: 99 }))).toBeNull()
    }
  })

  it('día ya cubierto bloquea solo HOY', () => {
    const covered = { kind: 'remaining' as const, calories: COVERED_KCAL_THRESHOLD, protein: 0, carbs: 0, fat: 0, loggedMealTypes: [] }
    expect(disabledReason(base({ horizon: 'today', budget: covered }))).toBe('todayCovered')
    // Mañana siempre trae presupuesto 'full', así que nunca se marca cubierto.
    expect(disabledReason(base({ horizon: 'tomorrow', budget: { ...covered, kind: 'full' } }))).toBeNull()
  })

  it('51 kcal restantes todavía valen un plan', () => {
    const budget = { kind: 'remaining' as const, calories: COVERED_KCAL_THRESHOLD + 1, protein: 5, carbs: 5, fat: 2, loggedMealTypes: [] }
    expect(disabledReason(base({ budget }))).toBeNull()
  })

  it('día cubierto gana sobre despensa vacía', () => {
    const covered = { kind: 'remaining' as const, calories: 0, protein: 0, carbs: 0, fat: 0, loggedMealTypes: [] }
    expect(disabledReason(base({ budget: covered, base: 'pantry', pantryCount: 0 }))).toBe('todayCovered')
  })

  it('despensa vacía bloquea solo si el usuario pidió "con lo que tengo"', () => {
    expect(disabledReason(base({ horizon: 'tomorrow', base: 'pantry', pantryCount: 0 }))).toBe('emptyPantry')
    expect(disabledReason(base({ horizon: 'tomorrow', base: 'buy', pantryCount: 0 }))).toBeNull()
  })
})
