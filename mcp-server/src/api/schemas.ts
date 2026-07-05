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
  quality: QualityBlockSchema.nullable().describe("Evaluación de calidad nutricional de la comida completa. Incluir cuando se proporcione contexto del usuario, null si no hay contexto."),
});

// ── Pantry parser (despensa F1, issue #170) ─────────────────────────────────

export const PANTRY_CATEGORIES = [
  "proteina", "vegetal", "fruta", "carbohidrato", "lacteo",
  "grasa", "condimento", "bebida", "otro",
] as const;

export const PANTRY_UNITS = ["g", "kg", "ml", "l", "unidad", "paquete"] as const;

// ⚠️ OpenAI strict mode: SIEMPRE .nullable(), NUNCA .optional()
export const PantryParsedItemSchema = z.object({
  name: z.string().describe("Nombre tal como lo dijo el usuario, ej: 'pechuga de pollo'"),
  name_normalized: z
    .string()
    .describe("lowercase, sin acentos, singular; para matching contra el inventario"),
  category: z.enum(PANTRY_CATEGORIES).describe("Categoría del alimento"),
  quantity: z.number().nullable().describe("Cantidad; null si no se puede inferir"),
  unit: z.enum(PANTRY_UNITS).nullable().describe("Unidad; null si no se puede inferir"),
  price_total: z.number().nullable().describe("Precio TOTAL pagado si se mencionó; null si no"),
  expiry_days: z
    .number()
    .nullable()
    .describe("Días estimados hasta vencer según la categoría; null si desconocido"),
  confidence: z.enum(["high", "med", "low"]).describe("Qué tan segura es la extracción"),
});

export const PantryParseSchema = z.object({
  intent: z
    .enum(["add", "consume", "discard", "query", "unknown"])
    .describe("Qué quiere hacer el usuario con su despensa"),
  items: z.array(PantryParsedItemSchema).describe("Items mencionados en el mensaje"),
  reply: z.string().describe("Respuesta corta y natural en español para mostrar en el chat"),
});

// ─── Despensa F2: plan pantry-aware (#171) ───────────────────────────────────

export const RecipeIngredientSchema = z.object({
  name: z.string().describe("Ingrediente tal como se usa en la receta"),
  name_normalized: z.string().describe("minúsculas, sin acentos"),
  qty: z.number().nullable().describe("Cantidad que usa la receta; null si es al gusto"),
  unit: z.enum(PANTRY_UNITS).nullable(),
  from: z.enum(["pantry", "buy"]).describe("pantry = está en el inventario listado; buy = falta comprarlo"),
});

export const RecipeSchema = z.object({
  steps: z.array(z.string()).describe("Pasos de preparación en orden, imperativo, concisos"),
  ingredients: z.array(RecipeIngredientSchema),
  prep_minutes: z.number().nullable(),
});

export const HowManyMealsSchema = z.object({
  total_meals: z.number().describe("Total de comidas completas posibles con el inventario actual"),
  days_covered: z.number().describe("Días aproximados que cubre (3-4 comidas/día)"),
  breakdown: z.array(
    z.object({
      meal_label: z.string(),
      times_possible: z.number(),
      limiting_ingredient: z.string().describe("Qué ingrediente limita, ej: 'te limita el pollo'"),
    })
  ),
  summary: z.string().describe("1-2 frases en español"),
});
