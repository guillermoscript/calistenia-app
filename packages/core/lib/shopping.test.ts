import { describe, it, expect } from 'vitest'
import {
  normalizeQty,
  convertQty,
  roundQty,
  formatQty,
  addDaysISO,
  unitCost,
  estimateItemPrice,
  buildShoppingList,
  nextPurchaseInfo,
  buildCycleShoppingList,
  computeRecipeCost,
  shoppingTotals,
  formatMoney,
} from './shopping'
import type { PantryItem, RecipeIngredient, ShoppingListItem } from '../types'

let seq = 0
function pi(over: Partial<PantryItem>): PantryItem {
  return {
    id: `it${++seq}`, name: 'x', nameNormalized: 'x', category: 'otro',
    quantity: null, unit: null, priceTotal: null, currency: 'USD',
    priceSource: null, purchaseDate: null, expiryEstimate: null,
    confidence: 'high', status: 'active', source: 'manual',
    ...over,
  }
}
function ing(over: Partial<RecipeIngredient>): RecipeIngredient {
  return { name: 'x', name_normalized: 'x', qty: null, unit: null, from: 'buy', ...over }
}
function mk(): ShoppingListItem {
  return {
    name: 'x', name_normalized: 'x', qty: 1, unit: 'unidad', est_price: null,
    currency: 'USD', checked: false, actual_price: null, reasons: ['plan'],
    incompatible_have: null,
  }
}

describe('normalizeQty', () => {
  it('convierte kg→g y l→ml', () => {
    expect(normalizeQty(2, 'kg')).toEqual({ qty: 2000, baseUnit: 'g' })
    expect(normalizeQty(1.5, 'l')).toEqual({ qty: 1500, baseUnit: 'ml' })
  })
  it('deja g/ml/unidad/paquete igual', () => {
    expect(normalizeQty(200, 'g')).toEqual({ qty: 200, baseUnit: 'g' })
    expect(normalizeQty(4, 'unidad')).toEqual({ qty: 4, baseUnit: 'unidad' })
    expect(normalizeQty(2, 'paquete')).toEqual({ qty: 2, baseUnit: 'paquete' })
  })
})

describe('roundQty', () => {
  it('mata colas IEEE a 3 decimales', () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3)
    expect(roundQty(1.2000000000000002)).toBe(1.2)
    expect(roundQty(0.125)).toBe(0.125)
  })
  it('el diff del plan sale sin colas de float', () => {
    const out = buildShoppingList(
      [ing({ name_normalized: 'arroz', qty: 2, unit: 'kg' })],
      [pi({ nameNormalized: 'arroz', quantity: 300.00000000000006, unit: 'g' })],
    )
    expect(out[0].qty).toBe(1700)
  })
})

describe('convertQty', () => {
  it('convierte dentro de la misma dimensión', () => {
    expect(convertQty(1500, 'g', 'kg')).toBe(1.5)
    expect(convertQty(2, 'kg', 'g')).toBe(2000)
    expect(convertQty(500, 'ml', 'l')).toBe(0.5)
    expect(convertQty(3, 'unidad', 'unidad')).toBe(3)
  })
  it('null entre dimensiones incompatibles', () => {
    expect(convertQty(200, 'g', 'unidad')).toBeNull()
    expect(convertQty(1, 'paquete', 'kg')).toBeNull()
  })
})

describe('formatQty', () => {
  it('humaniza ≥1000 en base metrica', () => {
    expect(formatQty(1500, 'g')).toBe('1.5 kg')
    expect(formatQty(2000, 'ml')).toBe('2 l')
    expect(formatQty(300, 'g')).toBe('300 g')
    expect(formatQty(3, 'unidad')).toBe('3 unidad')
    expect(formatQty(null, 'g')).toBe('')
  })
})

describe('addDaysISO', () => {
  it('suma días tz-aware (sin UTC drift)', () => {
    expect(addDaysISO('2026-07-06', 7)).toBe('2026-07-13')
    expect(addDaysISO('2026-07-06', -14)).toBe('2026-06-22')
    expect(addDaysISO('2026-12-30', 5)).toBe('2027-01-04')
  })
})

describe('unitCost', () => {
  it('price_total / qty en unidad base', () => {
    const item = pi({ nameNormalized: 'pollo', quantity: 2, unit: 'kg', priceTotal: 8 })
    expect(unitCost(item)).toEqual({ costPerBase: 0.004, currency: 'USD', baseUnit: 'g' })
  })
  it('null si falta precio, qty o unidad, o qty ≤ 0', () => {
    expect(unitCost(pi({ quantity: 2, unit: 'kg' }))).toBeNull()
    expect(unitCost(pi({ priceTotal: 8, unit: 'kg' }))).toBeNull()
    expect(unitCost(pi({ priceTotal: 8, quantity: 0, unit: 'kg' }))).toBeNull()
    expect(unitCost(pi({ priceTotal: 8, quantity: 2 }))).toBeNull()
  })
})

describe('estimateItemPrice', () => {
  const hist = [
    pi({ nameNormalized: 'pollo', quantity: 2, unit: 'kg', priceTotal: 8, purchaseDate: '2026-07-01', status: 'depleted' }),
    pi({ nameNormalized: 'pollo', quantity: 1, unit: 'kg', priceTotal: 5, purchaseDate: '2026-06-01', status: 'depleted' }),
  ]
  it('usa el precio unitario de la compra más reciente compatible', () => {
    // 0.004 $/g × 500 g = 2
    expect(estimateItemPrice('pollo', 500, 'g', hist)).toBe(2)
  })
  it('null si no hay histórico compatible (unidad no convertible o sin precio)', () => {
    expect(estimateItemPrice('pollo', 2, 'unidad', hist)).toBeNull()
    expect(estimateItemPrice('tomate', 200, 'g', hist)).toBeNull()
    expect(estimateItemPrice('pollo', null, 'g', hist)).toBeNull()
  })
})

describe('buildShoppingList', () => {
  it('merge: 3 recetas piden pollo → UNA línea con qty sumada − despensa', () => {
    const plan = [
      ing({ name: 'Pollo', name_normalized: 'pollo', qty: 300, unit: 'g' }),
      ing({ name: 'Pollo', name_normalized: 'pollo', qty: 0.5, unit: 'kg' }),
      ing({ name: 'Pollo', name_normalized: 'pollo', qty: 400, unit: 'g' }),
    ]
    const pantry = [pi({ nameNormalized: 'pollo', quantity: 200, unit: 'g' })]
    const out = buildShoppingList(plan, pantry)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ name_normalized: 'pollo', qty: 1000, unit: 'g', reasons: ['plan'] })
  })

  it('despensa cubre todo → lista vacía', () => {
    const plan = [ing({ name_normalized: 'arroz', qty: 1, unit: 'kg' })]
    const pantry = [pi({ nameNormalized: 'arroz', quantity: 2, unit: 'kg' })]
    expect(buildShoppingList(plan, pantry)).toEqual([])
  })

  it('unidades incompatibles → línea separada con incompatible_have (no asume conversión)', () => {
    const plan = [ing({ name: 'Tomate', name_normalized: 'tomate', qty: 200, unit: 'g' })]
    const pantry = [pi({ nameNormalized: 'tomate', quantity: 4, unit: 'unidad' })]
    const out = buildShoppingList(plan, pantry)
    expect(out).toHaveLength(1)
    expect(out[0].qty).toBe(200)
    expect(out[0].incompatible_have).toEqual({ qty: 4, unit: 'unidad' })
  })

  it('items depleted/discarded no cuentan como disponibles', () => {
    const plan = [ing({ name_normalized: 'arroz', qty: 500, unit: 'g' })]
    const pantry = [pi({ nameNormalized: 'arroz', quantity: 2, unit: 'kg', status: 'depleted' })]
    expect(buildShoppingList(plan, pantry)[0].qty).toBe(500)
  })

  it('ingrediente sin qty: se compra solo si NO hay nada del item', () => {
    const plan = [
      ing({ name_normalized: 'oregano', qty: null }),
      ing({ name_normalized: 'sal', qty: null }),
    ]
    const pantry = [pi({ nameNormalized: 'sal', quantity: 1, unit: 'paquete' })]
    const out = buildShoppingList(plan, pantry)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ name_normalized: 'oregano', qty: null })
  })
})

describe('nextPurchaseInfo', () => {
  it('próxima compra = última + cadencia', () => {
    expect(nextPurchaseInfo('2026-07-01', 7, '2026-07-06')).toEqual({ nextDate: '2026-07-08', daysLeft: 2 })
  })
  it('vencida → hoy, daysLeft 0', () => {
    expect(nextPurchaseInfo('2026-06-01', 7, '2026-07-06')).toEqual({ nextDate: '2026-07-06', daysLeft: 0 })
  })
  it('sin compra previa → hoy + cadencia', () => {
    expect(nextPurchaseInfo(null, 7, '2026-07-06')).toEqual({ nextDate: '2026-07-13', daysLeft: 7 })
  })
})

describe('buildCycleShoppingList', () => {
  const today = '2026-07-06'
  it('VENCE: activo que expira dentro del horizonte entra con razón vence', () => {
    const out = buildCycleShoppingList({
      planIngredients: [],
      pantryItems: [pi({ name: 'Yogur', nameNormalized: 'yogur', quantity: 500, unit: 'ml', expiryEstimate: '2026-07-08' })],
      horizonDays: 7,
      today,
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ name_normalized: 'yogur', qty: 500, unit: 'ml', reasons: ['vence'] })
  })
  it('activo que expira DESPUÉS del horizonte no entra', () => {
    const out = buildCycleShoppingList({
      planIngredients: [],
      pantryItems: [pi({ nameNormalized: 'yogur', quantity: 500, unit: 'ml', expiryEstimate: '2026-08-01' })],
      horizonDays: 7,
      today,
    })
    expect(out).toEqual([])
  })
  it('SE ACABÓ: depleted dentro de la ventana entra con qty null', () => {
    const out = buildCycleShoppingList({
      planIngredients: [],
      pantryItems: [pi({ nameNormalized: 'huevos', status: 'depleted', updated: '2026-07-03 10:00:00.000Z' })],
      horizonDays: 7,
      today,
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ name_normalized: 'huevos', qty: null, reasons: ['se_acabo'] })
  })
  it('depleted viejo (fuera de ventana 14d) no entra', () => {
    const out = buildCycleShoppingList({
      planIngredients: [],
      pantryItems: [pi({ nameNormalized: 'huevos', status: 'depleted', updated: '2026-05-01 10:00:00.000Z' })],
      horizonDays: 7,
      today,
    })
    expect(out).toEqual([])
  })
  it('razones se fusionan en la misma línea del plan', () => {
    const out = buildCycleShoppingList({
      planIngredients: [ing({ name: 'Yogur', name_normalized: 'yogur', qty: 1000, unit: 'ml' })],
      pantryItems: [pi({ nameNormalized: 'yogur', quantity: 200, unit: 'ml', expiryEstimate: '2026-07-07' })],
      horizonDays: 7,
      today,
    })
    expect(out).toHaveLength(1)
    expect(out[0].reasons.sort()).toEqual(['plan', 'vence'])
  })
  it('vence cae en la línea de unidad compatible, no en otra línea del mismo nombre', () => {
    const out = buildCycleShoppingList({
      planIngredients: [
        ing({ name: 'Huevo', name_normalized: 'huevo', qty: 6, unit: 'unidad' }),
        ing({ name: 'Huevo', name_normalized: 'huevo', qty: 1, unit: 'paquete' }),
      ],
      pantryItems: [
        pi({ nameNormalized: 'huevo', quantity: 2, unit: 'unidad', expiryEstimate: '2026-07-07' }),
      ],
      horizonDays: 7,
      today,
    })
    const porUnidad = out.find((it) => it.unit === 'unidad')
    const porPaquete = out.find((it) => it.unit === 'paquete')
    expect(porUnidad?.reasons.sort()).toEqual(['plan', 'vence'])
    expect(porPaquete?.reasons).toEqual(['plan'])
  })
  it('est_price se llena desde el histórico', () => {
    const out = buildCycleShoppingList({
      planIngredients: [ing({ name_normalized: 'pollo', qty: 1, unit: 'kg' })],
      pantryItems: [pi({ nameNormalized: 'pollo', quantity: 2, unit: 'kg', priceTotal: 8, purchaseDate: '2026-07-01', status: 'depleted', updated: '2026-05-01 00:00:00.000Z' })],
      horizonDays: 7,
      today,
    })
    expect(out[0].est_price).toBe(4)
  })
})

describe('computeRecipeCost', () => {
  const pantry = [
    pi({ nameNormalized: 'pollo', quantity: 2, unit: 'kg', priceTotal: 8, priceSource: 'real', purchaseDate: '2026-07-01' }),
    pi({ nameNormalized: 'arroz', quantity: 1, unit: 'kg', priceTotal: 2, priceSource: 'estimada', purchaseDate: '2026-07-01' }),
    pi({ nameNormalized: 'tomate', quantity: 4, unit: 'unidad' }), // sin precio
  ]
  it('mezcla real/estimada/sin_precio; criterio de aceptación pollo $8/2kg', () => {
    const r = computeRecipeCost(
      [
        ing({ name: 'Pollo', name_normalized: 'pollo', qty: 500, unit: 'g' }),   // 2.00 real
        ing({ name: 'Arroz', name_normalized: 'arroz', qty: 200, unit: 'g' }),   // 0.40 estimada
        ing({ name: 'Tomate', name_normalized: 'tomate', qty: 2, unit: 'unidad' }), // sin precio
      ],
      pantry,
      2,
    )
    expect(r.total).toBeCloseTo(2.4, 10)
    expect(r.perServing).toBeCloseTo(1.2, 10)
    expect(r.hasEstimates).toBe(true)
    expect(r.breakdown).toEqual([
      { name: 'Pollo', cost: 2, source: 'real' },
      { name: 'Arroz', cost: expect.closeTo(0.4, 10), source: 'estimada' },
      { name: 'Tomate', cost: null, source: 'sin_precio' },
    ])
  })
  it('todo real → hasEstimates false (UI sin ~)', () => {
    const r = computeRecipeCost([ing({ name_normalized: 'pollo', qty: 1, unit: 'kg' })], pantry, 1)
    expect(r).toMatchObject({ total: 4, perServing: 4, hasEstimates: false })
  })
  it('real + sin_precio (sin ningún estimada) → hasEstimates true: total incompleto lleva ~', () => {
    const r = computeRecipeCost(
      [
        ing({ name_normalized: 'pollo', qty: 1, unit: 'kg' }),
        ing({ name: 'Sal', name_normalized: 'sal', qty: 5, unit: 'g' }),
      ],
      pantry,
      1,
    )
    expect(r.total).toBe(4)
    expect(r.hasEstimates).toBe(true)
    expect(r.breakdown[1].source).toBe('sin_precio')
  })
  it('estFallback aplica cuando no hay match y marca estimada', () => {
    const r = computeRecipeCost(
      [ing({ name: 'Curry', name_normalized: 'curry', qty: 10, unit: 'g' })],
      pantry,
      1,
      { curry: 1.5 },
    )
    expect(r.total).toBe(1.5)
    expect(r.hasEstimates).toBe(true)
    expect(r.breakdown[0].source).toBe('estimada')
  })
  it('prefiere precio real sobre estimado aunque sea más viejo', () => {
    const twoPrices = [
      pi({ nameNormalized: 'pollo', quantity: 1, unit: 'kg', priceTotal: 9, priceSource: 'estimada', purchaseDate: '2026-07-05' }),
      pi({ nameNormalized: 'pollo', quantity: 2, unit: 'kg', priceTotal: 8, priceSource: 'real', purchaseDate: '2026-07-01' }),
    ]
    const r = computeRecipeCost([ing({ name_normalized: 'pollo', qty: 1, unit: 'kg' })], twoPrices, 1)
    expect(r.total).toBe(4)
    expect(r.breakdown[0].source).toBe('real')
  })
})

describe('shoppingTotals + formatMoney', () => {
  it('actual solo suma checked; usa actual_price ?? est_price', () => {
    const items = [
      { ...mk(), est_price: 3, checked: true, actual_price: 3.5 },
      { ...mk(), est_price: 2, checked: true, actual_price: null },
      { ...mk(), est_price: 4, checked: false, actual_price: null },
    ]
    expect(shoppingTotals(items)).toEqual({ est: 9, actual: 5.5 })
  })
  it('formatMoney redondea a 2 decimales SOLO al presentar', () => {
    expect(formatMoney(1.005 + 1.005)).toBe('2.01')
    expect(formatMoney(4)).toBe('4.00')
  })
})
