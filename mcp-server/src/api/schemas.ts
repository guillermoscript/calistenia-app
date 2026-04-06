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
  portionGrams: z
    .number()
    .describe('Peso total estimado de la porción en GRAMOS (número). Ej: para "175g" → 175, para "1 unidad" de huevo → 60, para "250ml" de leche → 250. NUNCA uses valores redondeados a 50 (50, 100, 150, 200). Usa estimaciones precisas como 175, 185, 220, 135.'),
  portionNote: z
    .string()
    .describe('Nota breve explicando como se estimo la porcion (ej: "filete mediano", "vaso estandar 330ml", "puñado grande", "plato hondo lleno")'),
  calories: z.number().describe("Calorías estimadas para la porción indicada (kcal)"),
  protein: z.number().describe("Proteína estimada para la porción indicada (g)"),
  carbs: z.number().describe("Carbohidratos estimados para la porción indicada (g)"),
  fat: z.number().describe("Grasa estimada para la porción indicada (g)"),
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

export const QualityAlternativeSchema = z.object({
  name: z.string().describe("Nombre del alimento alternativo sugerido"),
  portionNote: z.string().describe("Nota de porción sugerida (ej: '150g de pechuga a la plancha')"),
});

export const QualityBlockSchema = z.object({
  score: z
    .enum(["A", "B", "C", "D", "E"])
    .describe("Score de calidad nutricional de la comida COMPLETA (no por ingrediente). A=excelente, B=bueno, C=aceptable, D=pobre, E=malo"),
  breakdown: z
    .object({
      positives: z.array(z.string()).describe("Aspectos positivos de la comida (ej: 'Alto en proteína', 'Buena fuente de fibra')"),
      negatives: z.array(z.string()).describe("Aspectos negativos (ej: 'Exceso de azúcares simples', 'Bajo en micronutrientes')"),
      summary: z.string().describe("Resumen de una línea del porqué del score"),
    })
    .describe("Desglose de por qué la comida recibió ese score"),
  message: z
    .string()
    .describe("Mensaje contextual considerando la hora, el objetivo del usuario, y patrones recientes. Ajusta el tono: suave si es un caso aislado, más directo si hay patrón repetido de mala alimentación. Si la comida es buena, felicita."),
  suggestion: z
    .object({
      text: z.string().describe("Sugerencia de mejora (ej: 'Prueba cambiar las papas fritas por batata al horno')"),
      alternatives: z.array(QualityAlternativeSchema).describe("Alimentos alternativos sugeridos, preferiblemente del historial del usuario"),
    })
    .nullable()
    .describe("Sugerencia con alternativas si score < B. null si score es A o B."),
});

const BaseMealAnalysisSchema = z.object({
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

export const MealAnalysisSchema = BaseMealAnalysisSchema.extend({
  quality: QualityBlockSchema.optional().describe("Evaluación de calidad nutricional de la comida completa. Incluir siempre que se proporcione contexto del usuario."),
});
