import { z } from 'zod'

export const FoodItemSchema = z.object({
  name: z.string().describe('Nombre del alimento en español'),
  portion: z.string().describe('Tamaño de la porción estimada (ej: "150g", "1 unidad", "200ml")'),
  calories: z.number().describe('Calorías estimadas (kcal)'),
  protein: z.number().describe('Proteína estimada (g)'),
  carbs: z.number().describe('Carbohidratos estimados (g)'),
  fat: z.number().describe('Grasa estimada (g)'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Confianza en la identificación del alimento'),
})

export const MealAnalysisSchema = z.object({
  foods: z.array(FoodItemSchema).describe('Lista de alimentos detectados en la imagen'),
  totals: z.object({
    calories: z.number().describe('Suma total de calorías (kcal)'),
    protein: z.number().describe('Suma total de proteína (g)'),
    carbs: z.number().describe('Suma total de carbohidratos (g)'),
    fat: z.number().describe('Suma total de grasa (g)'),
  }).describe('Totales nutricionales sumados de todos los alimentos'),
  meal_description: z.string().describe('Breve descripción de la comida en español (1-2 oraciones)'),
})
