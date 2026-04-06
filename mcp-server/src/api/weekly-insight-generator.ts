import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel, type Tier } from "./model-resolver.js";
import { getPromptWithMeta } from "./prompts.js";

const PatternSchema = z.object({
  type: z.string().describe("Tipo de patrón: 'positive' o 'negative'"),
  message: z.string().describe("Descripción del patrón detectado"),
});

const WeeklyInsightSchema = z.object({
  overall_score: z.enum(["A", "B", "C", "D", "E"]).describe("Score general de la semana"),
  patterns: z.array(PatternSchema).describe("Patrones detectados (positivos y negativos)"),
  highlights: z.array(z.string()).describe("Mejores momentos de la semana"),
  concerns: z.array(z.string()).describe("Áreas de preocupación"),
  coach_message: z.string().describe("Mensaje motivacional o de alerta del coach"),
  comparison: z.string().optional().describe("Comparación con semana anterior si se proporcionó"),
});

interface WeeklyInsightInput {
  meals: {
    mealType: string;
    foods: string;
    totalCalories: number;
    qualityScore?: string;
    loggedAt: string;
  }[];
  goal?: string;
  previousWeekScore?: string;
  tier: Tier;
}

export async function generateWeeklyInsight({
  meals,
  goal,
  previousWeekScore,
  tier,
}: WeeklyInsightInput) {
  const { model, name: modelName } = resolveModel(tier);
  const { prompt: systemPrompt } = await getPromptWithMeta("weekly-insight-generator");

  let userText = `Analiza las comidas de esta semana y genera un resumen con insights:\n\n`;

  // Group meals by day
  const byDay = new Map<string, typeof meals>();
  for (const m of meals) {
    const day = m.loggedAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(m);
  }

  for (const [day, dayMeals] of [...byDay.entries()].sort()) {
    userText += `### ${day}\n`;
    for (const m of dayMeals) {
      const score = m.qualityScore ? ` [Score: ${m.qualityScore}]` : "";
      userText += `- ${m.mealType}: ${m.foods} (${m.totalCalories}kcal)${score}\n`;
    }
    userText += "\n";
  }

  if (goal) userText += `\nObjetivo del usuario: ${goal}`;
  if (previousWeekScore) userText += `\nScore de la semana anterior: ${previousWeekScore}`;

  const { object } = await generateObject({
    model,
    schema: WeeklyInsightSchema,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    experimental_telemetry: {
      isEnabled: true,
      functionId: "weekly-insight-generator",
      metadata: { tier, modelName },
    },
  });

  return {
    ...object,
    model_used: modelName,
  };
}
