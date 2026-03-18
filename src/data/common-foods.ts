import type { FoodItem } from '../types'

/**
 * Base de alimentos comunes con macros por 100g.
 * portionAmount es la porción típica de consumo.
 */
export const COMMON_FOODS: FoodItem[] = [
  // ─── Proteinas ────────────────────────────────────────────────────────────
  { name: 'Pechuga de pollo', portionAmount: 150, portionUnit: 'g', unitWeightInGrams: 1, calories: 248, protein: 46.5, carbs: 0, fat: 5.4, baseCal100: 165, baseProt100: 31, baseCarbs100: 0, baseFat100: 3.6, category: 'proteinas' },
  { name: 'Huevo entero', portionAmount: 1, portionUnit: 'unidad', unitWeightInGrams: 60, calories: 93, protein: 7.8, carbs: 0.7, fat: 6.3, baseCal100: 155, baseProt100: 13, baseCarbs100: 1.1, baseFat100: 10.6, category: 'proteinas' },
  { name: 'Clara de huevo', portionAmount: 1, portionUnit: 'unidad', unitWeightInGrams: 33, calories: 17, protein: 3.6, carbs: 0.2, fat: 0.1, baseCal100: 52, baseProt100: 11, baseCarbs100: 0.7, baseFat100: 0.2, category: 'proteinas' },
  { name: 'Atún en lata (agua)', portionAmount: 100, portionUnit: 'g', unitWeightInGrams: 1, calories: 116, protein: 25.5, carbs: 0, fat: 1, baseCal100: 116, baseProt100: 25.5, baseCarbs100: 0, baseFat100: 1, category: 'proteinas' },
  { name: 'Salmón', portionAmount: 150, portionUnit: 'g', unitWeightInGrams: 1, calories: 312, protein: 30, carbs: 0, fat: 21, baseCal100: 208, baseProt100: 20, baseCarbs100: 0, baseFat100: 14, category: 'proteinas' },
  { name: 'Carne molida (90/10)', portionAmount: 150, portionUnit: 'g', unitWeightInGrams: 1, calories: 259, protein: 39, carbs: 0, fat: 10.5, baseCal100: 173, baseProt100: 26, baseCarbs100: 0, baseFat100: 7, category: 'proteinas' },
  { name: 'Pechuga de pavo', portionAmount: 150, portionUnit: 'g', unitWeightInGrams: 1, calories: 180, protein: 37.5, carbs: 0, fat: 3, baseCal100: 120, baseProt100: 25, baseCarbs100: 0, baseFat100: 2, category: 'proteinas' },
  { name: 'Whey protein (scoop)', portionAmount: 1, portionUnit: 'unidad', unitWeightInGrams: 30, calories: 120, protein: 24, carbs: 3, fat: 1.5, baseCal100: 400, baseProt100: 80, baseCarbs100: 10, baseFat100: 5, category: 'proteinas' },

  // ─── Carbohidratos ────────────────────────────────────────────────────────
  { name: 'Arroz blanco (cocido)', portionAmount: 200, portionUnit: 'g', unitWeightInGrams: 1, calories: 260, protein: 5.4, carbs: 56.4, fat: 0.6, baseCal100: 130, baseProt100: 2.7, baseCarbs100: 28.2, baseFat100: 0.3, category: 'carbohidratos' },
  { name: 'Arroz integral (cocido)', portionAmount: 200, portionUnit: 'g', unitWeightInGrams: 1, calories: 248, protein: 5.2, carbs: 51.6, fat: 1.8, baseCal100: 124, baseProt100: 2.6, baseCarbs100: 25.8, baseFat100: 0.9, category: 'carbohidratos' },
  { name: 'Pasta (cocida)', portionAmount: 200, portionUnit: 'g', unitWeightInGrams: 1, calories: 262, protein: 9.4, carbs: 50.6, fat: 1.8, baseCal100: 131, baseProt100: 4.7, baseCarbs100: 25.3, baseFat100: 0.9, category: 'carbohidratos' },
  { name: 'Pan integral (rebanada)', portionAmount: 1, portionUnit: 'unidad', unitWeightInGrams: 40, calories: 100, protein: 4.4, carbs: 17.6, fat: 1.6, baseCal100: 250, baseProt100: 11, baseCarbs100: 44, baseFat100: 4, category: 'carbohidratos' },
  { name: 'Avena', portionAmount: 50, portionUnit: 'g', unitWeightInGrams: 1, calories: 190, protein: 6.5, carbs: 33.5, fat: 3.5, baseCal100: 379, baseProt100: 13, baseCarbs100: 67, baseFat100: 7, category: 'carbohidratos' },
  { name: 'Papa (cocida)', portionAmount: 200, portionUnit: 'g', unitWeightInGrams: 1, calories: 174, protein: 4, carbs: 40, fat: 0.2, baseCal100: 87, baseProt100: 2, baseCarbs100: 20, baseFat100: 0.1, category: 'carbohidratos' },
  { name: 'Batata / Camote', portionAmount: 200, portionUnit: 'g', unitWeightInGrams: 1, calories: 172, protein: 3.2, carbs: 40.2, fat: 0.2, baseCal100: 86, baseProt100: 1.6, baseCarbs100: 20.1, baseFat100: 0.1, category: 'carbohidratos' },
  { name: 'Tortilla de maíz', portionAmount: 1, portionUnit: 'unidad', unitWeightInGrams: 30, calories: 63, protein: 1.5, carbs: 13.2, fat: 0.6, baseCal100: 210, baseProt100: 5, baseCarbs100: 44, baseFat100: 2, category: 'carbohidratos' },

  // ─── Frutas ───────────────────────────────────────────────────────────────
  { name: 'Plátano / Banana', portionAmount: 1, portionUnit: 'unidad', unitWeightInGrams: 120, calories: 107, protein: 1.3, carbs: 27.4, fat: 0.4, baseCal100: 89, baseProt100: 1.1, baseCarbs100: 22.8, baseFat100: 0.3, category: 'frutas' },
  { name: 'Manzana', portionAmount: 1, portionUnit: 'unidad', unitWeightInGrams: 180, calories: 94, protein: 0.5, carbs: 24.8, fat: 0.4, baseCal100: 52, baseProt100: 0.3, baseCarbs100: 13.8, baseFat100: 0.2, category: 'frutas' },
  { name: 'Fresas', portionAmount: 150, portionUnit: 'g', unitWeightInGrams: 1, calories: 48, protein: 1, carbs: 11.6, fat: 0.5, baseCal100: 32, baseProt100: 0.7, baseCarbs100: 7.7, baseFat100: 0.3, category: 'frutas' },
  { name: 'Arándanos', portionAmount: 100, portionUnit: 'g', unitWeightInGrams: 1, calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3, baseCal100: 57, baseProt100: 0.7, baseCarbs100: 14.5, baseFat100: 0.3, category: 'frutas' },

  // ─── Verduras ─────────────────────────────────────────────────────────────
  { name: 'Brócoli', portionAmount: 150, portionUnit: 'g', unitWeightInGrams: 1, calories: 51, protein: 4.2, carbs: 10, fat: 0.6, baseCal100: 34, baseProt100: 2.8, baseCarbs100: 6.6, baseFat100: 0.4, category: 'verduras' },
  { name: 'Espinacas', portionAmount: 100, portionUnit: 'g', unitWeightInGrams: 1, calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, baseCal100: 23, baseProt100: 2.9, baseCarbs100: 3.6, baseFat100: 0.4, category: 'verduras' },
  { name: 'Tomate', portionAmount: 1, portionUnit: 'unidad', unitWeightInGrams: 150, calories: 27, protein: 1.3, carbs: 5.9, fat: 0.3, baseCal100: 18, baseProt100: 0.9, baseCarbs100: 3.9, baseFat100: 0.2, category: 'verduras' },
  { name: 'Aguacate', portionAmount: 1, portionUnit: 'unidad', unitWeightInGrams: 150, calories: 240, protein: 3, carbs: 12.8, fat: 22, baseCal100: 160, baseProt100: 2, baseCarbs100: 8.5, baseFat100: 14.7, category: 'grasas' },

  // ─── Lácteos ──────────────────────────────────────────────────────────────
  { name: 'Leche entera', portionAmount: 250, portionUnit: 'ml', unitWeightInGrams: 1, calories: 150, protein: 8, carbs: 12, fat: 8, baseCal100: 60, baseProt100: 3.2, baseCarbs100: 4.8, baseFat100: 3.2, category: 'lacteos' },
  { name: 'Yogur griego natural', portionAmount: 170, portionUnit: 'g', unitWeightInGrams: 1, calories: 170, protein: 17, carbs: 10, fat: 6.5, baseCal100: 100, baseProt100: 10, baseCarbs100: 5.9, baseFat100: 3.8, category: 'lacteos' },
  { name: 'Queso cottage', portionAmount: 100, portionUnit: 'g', unitWeightInGrams: 1, calories: 98, protein: 11, carbs: 3.4, fat: 4.3, baseCal100: 98, baseProt100: 11, baseCarbs100: 3.4, baseFat100: 4.3, category: 'lacteos' },

  // ─── Grasas ───────────────────────────────────────────────────────────────
  { name: 'Aceite de oliva', portionAmount: 15, portionUnit: 'ml', unitWeightInGrams: 1, calories: 119, protein: 0, carbs: 0, fat: 13.5, baseCal100: 796, baseProt100: 0, baseCarbs100: 0, baseFat100: 90, category: 'grasas' },
  { name: 'Mantequilla de maní', portionAmount: 30, portionUnit: 'g', unitWeightInGrams: 1, calories: 188, protein: 7, carbs: 6.3, fat: 16, baseCal100: 627, baseProt100: 23.3, baseCarbs100: 21, baseFat100: 53.3, category: 'grasas' },
  { name: 'Almendras', portionAmount: 30, portionUnit: 'g', unitWeightInGrams: 1, calories: 173, protein: 6.3, carbs: 6.5, fat: 15, baseCal100: 576, baseProt100: 21, baseCarbs100: 21.6, baseFat100: 50, category: 'grasas' },

  // ─── Legumbres ────────────────────────────────────────────────────────────
  { name: 'Lentejas (cocidas)', portionAmount: 200, portionUnit: 'g', unitWeightInGrams: 1, calories: 230, protein: 18, carbs: 40, fat: 0.8, baseCal100: 116, baseProt100: 9, baseCarbs100: 20, baseFat100: 0.4, category: 'legumbres' },
  { name: 'Garbanzos (cocidos)', portionAmount: 200, portionUnit: 'g', unitWeightInGrams: 1, calories: 328, protein: 17.8, carbs: 54.4, fat: 5.2, baseCal100: 164, baseProt100: 8.9, baseCarbs100: 27.2, baseFat100: 2.6, category: 'legumbres' },
  { name: 'Frijoles negros (cocidos)', portionAmount: 200, portionUnit: 'g', unitWeightInGrams: 1, calories: 264, protein: 17.6, carbs: 47, fat: 0.9, baseCal100: 132, baseProt100: 8.8, baseCarbs100: 23.5, baseFat100: 0.5, category: 'legumbres' },
]

/** Search foods by name (case-insensitive, accent-insensitive) */
export function searchCommonFoods(query: string): FoodItem[] {
  if (!query || query.length < 2) return []
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const q = normalize(query)
  return COMMON_FOODS.filter(f => normalize(f.name).includes(q))
}

/** Get foods by category */
export function getFoodsByCategory(category: string): FoodItem[] {
  return COMMON_FOODS.filter(f => f.category === category)
}
