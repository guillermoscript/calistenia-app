import { z } from "zod";

export const FOOD_CATEGORIES = [
  "proteinas",
  "carbohidratos",
  "frutas",
  "verduras",
  "lacteos",
  "grasas",
  "legumbres",
  "bebidas",
  "procesados",
  "otros",
] as const;

export const FoodItemSchema = z.object({
  name: z.string().describe("Nombre del alimento en español, en singular y forma canónica (ej: 'Pechuga de pollo', 'Arroz blanco cocido')"),
  portion: z
    .string()
    .describe('Tamaño de la porción estimada (ej: "150g", "1 unidad", "200ml")'),
  calories: z.number().describe("Calorías estimadas (kcal)"),
  protein: z.number().describe("Proteína estimada (g)"),
  carbs: z.number().describe("Carbohidratos estimados (g)"),
  fat: z.number().describe("Grasa estimada (g)"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("Confianza en la identificación del alimento"),
  category: z
    .enum(FOOD_CATEGORIES)
    .describe("Categoría nutricional del alimento"),
  tags: z
    .array(z.string())
    .describe("Alias y términos relacionados en minúsculas para facilitar búsqueda (ej: ['pollo', 'ave', 'carne blanca'])"),
});

export const MealAnalysisSchema = z.object({
  foods: z
    .array(FoodItemSchema)
    .describe("Lista de alimentos detectados en la imagen"),
  totals: z
    .object({
      calories: z.number().describe("Suma total de calorías (kcal)"),
      protein: z.number().describe("Suma total de proteína (g)"),
      carbs: z.number().describe("Suma total de carbohidratos (g)"),
      fat: z.number().describe("Suma total de grasa (g)"),
    })
    .describe("Totales nutricionales sumados de todos los alimentos"),
  meal_description: z
    .string()
    .describe("Breve descripción de la comida en español (1-2 oraciones)"),
});
