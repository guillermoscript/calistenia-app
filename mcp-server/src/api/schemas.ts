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
    .describe('Tamaño de la porción estimada con precision realista. NUNCA uses valores redondeados a 50g (como 50g, 100g, 150g, 200g). Usa estimaciones visuales precisas como 175g, 185g, 220g, 135g, 280g. Para liquidos: 180ml, 330ml, etc. Para unidades: "1 unidad", "2 unidades".'),
  portionNote: z
    .string()
    .describe('Nota breve explicando como se estimo la porcion (ej: "filete mediano", "vaso estandar 330ml", "puñado grande", "plato hondo lleno")'),
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
