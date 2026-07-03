import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel, type Tier } from "./model-resolver.js";
import { getPromptWithMeta } from "./prompts.js";

// ── Output schema ────────────────────────────────────────────────────────────
// Framed as OBSERVED PATTERNS, never medical advice/diagnosis. See the
// "cross-metric-insight" prompt (Langfuse + FALLBACKS) for the safety framing.

const CorrelationSchema = z.object({
  observation: z
    .string()
    .describe("Patrón observado en lenguaje llano (ej: 'los días con <6h de sueño entrenaste menos'). Correlación, NO causa ni diagnóstico."),
  metrics: z
    .array(z.string())
    .describe("Métricas involucradas, ej: ['sueño','entrenamiento']"),
  strength: z
    .enum(["weak", "moderate", "strong"])
    .describe("Cuán marcado APARECE el patrón en los datos (no implica causalidad)"),
  lag: z
    .enum(["same_day", "next_day"])
    .optional()
    .describe("'next_day' si el patrón es un efecto retardado (ej: sueño de anoche → entreno de hoy); 'same_day' o ausente si es del mismo día"),
});

const CrossInsightSchema = z.object({
  headline: z.string().describe("Titular corto y neutral del resumen del periodo"),
  correlations: z
    .array(CorrelationSchema)
    .describe("Patrones cruzados entre métricas (correlación, no causa)"),
  wins: z.array(z.string()).describe("Cosas que el usuario hizo bien en el periodo"),
  watchouts: z
    .array(z.string())
    .describe("Señales a vigilar, enmarcadas como observaciones — NUNCA consejo médico ni diagnóstico"),
  suggestion: z
    .string()
    .describe("UNA sola sugerencia accionable, suave y opcional"),
  period: z.string().describe("Descripción del periodo analizado, ej: 'últimos 7 días'"),
});

export type CrossInsight = z.infer<typeof CrossInsightSchema>;

// ── Input (the compact rollup from packages/core buildInsightContext) ─────────
// Typed locally to avoid a cross-package import; matches InsightContext's JSON shape.

interface InsightDayRow {
  date: string;
  workouts?: number;
  workoutMinutes?: number;
  cardioSessions?: number;
  cardioKm?: number;
  cardioMinutes?: number;
  circuitSessions?: number;
  meals?: number;
  calories?: number;
  waterMl?: number;
  sleepMinutes?: number;
  sleepQuality?: number;
  weightKg?: number;
  steps?: number;
  restingHr?: number;
  hrvMs?: number;
  vo2max?: number;
}

interface InsightSummary {
  days: number;
  daysWithAnyData: number;
  workouts: { total: number; daysTrained: number };
  cardio: { sessions: number; totalKm: number; totalMinutes: number };
  circuits: { sessions: number };
  nutrition: { daysLogged: number; avgCalories: number | null; avgMeals: number | null };
  water: { daysLogged: number; avgMl: number | null };
  sleep: { daysLogged: number; avgMinutes: number | null; avgQuality: number | null };
  weight: { firstKg: number | null; lastKg: number | null; deltaKg: number | null };
  watch: { available: boolean; avgSteps: number | null; avgRestingHr: number | null; avgHrvMs: number | null };
  streaks: { currentTrainingStreak: number; longestTrainingStreak: number };
}

export interface InsightContext {
  period: { type: "weekly" | "monthly"; days: number; start: string; end: string };
  rows: InsightDayRow[];
  summary: InsightSummary;
  watchAvailable: boolean;
}

interface CrossInsightInput {
  context: InsightContext;
  tier: Tier;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const n1 = (v: number | null | undefined): string =>
  v == null ? "?" : Math.round(v * 10) / 10 + "";
const n0 = (v: number | null | undefined): string =>
  v == null ? "?" : Math.round(v) + "";

function buildUserText(ctx: InsightContext): string {
  const { period, summary: s, rows, watchAvailable } = ctx;
  const label = period.type === "weekly" ? "últimos 7 días" : "últimos 30 días";

  const lines: string[] = [];
  lines.push(
    `Periodo: ${label} (${period.start} a ${period.end}). Días con algún registro: ${s.daysWithAnyData}/${s.days}.`,
  );
  lines.push("");
  lines.push("## Resumen agregado");
  lines.push(`- Fuerza: ${s.workouts.total} entrenos en ${s.workouts.daysTrained} días. Racha actual ${s.streaks.currentTrainingStreak}, máxima ${s.streaks.longestTrainingStreak}.`);
  lines.push(`- Cardio: ${s.cardio.sessions} sesiones, ${n1(s.cardio.totalKm)} km, ${n0(s.cardio.totalMinutes)} min.`);
  lines.push(`- Circuitos: ${s.circuits.sessions} sesiones.`);
  lines.push(`- Nutrición: registrada ${s.nutrition.daysLogged} días · ~${n0(s.nutrition.avgCalories)} kcal/día · ~${n1(s.nutrition.avgMeals)} comidas/día.`);
  lines.push(`- Agua: registrada ${s.water.daysLogged} días · ~${n0(s.water.avgMl)} ml/día.`);
  lines.push(`- Sueño: registrado ${s.sleep.daysLogged} días · ~${n0(s.sleep.avgMinutes)} min/noche · calidad ~${n1(s.sleep.avgQuality)}/5.`);
  lines.push(`- Peso: ${n1(s.weight.firstKg)} kg → ${n1(s.weight.lastKg)} kg (Δ ${s.weight.deltaKg == null ? "?" : n1(s.weight.deltaKg)} kg).`);
  if (watchAvailable) {
    lines.push(`- Reloj: ~${n0(s.watch.avgSteps)} pasos/día · FC reposo ~${n0(s.watch.avgRestingHr)} bpm · HRV ~${n0(s.watch.avgHrvMs)} ms.`);
  } else {
    lines.push(`- Reloj: sin datos (no hay reloj conectado). NO inventes correlaciones de pasos/FC/HRV.`);
  }

  const covMin = period.days <= 7 ? 4 : 10;
  const lowCoverage: Array<{ label: string; count: number }> = [
    { label: "sueño", count: s.sleep.daysLogged },
    { label: "agua", count: s.water.daysLogged },
    { label: "nutrición", count: s.nutrition.daysLogged },
    { label: "fuerza", count: s.workouts.daysTrained },
    { label: "cardio", count: s.cardio.sessions },
    { label: "circuitos", count: s.circuits.sessions },
  ].filter((d) => d.count > 0 && d.count < covMin);

  if (lowCoverage.length) {
    lines.push("");
    lines.push('## Cobertura insuficiente (NO afirmes patrones que dependan de estas métricas — di "pocos datos de X")');
    for (const d of lowCoverage) {
      lines.push(`- ${d.label}: ${d.count}/${period.days} días`);
    }
  }

  lines.push("");
  lines.push("## Detalle por día (solo días con datos)");
  for (const r of rows) {
    const parts: string[] = [];
    if (r.workouts) parts.push(`fuerza ${r.workouts}${r.workoutMinutes ? `(${r.workoutMinutes}min)` : ""}`);
    if (r.cardioSessions) parts.push(`cardio ${n1(r.cardioKm)}km/${n0(r.cardioMinutes)}min`);
    if (r.circuitSessions) parts.push(`circuito ${r.circuitSessions}`);
    if (r.calories != null || r.meals != null) parts.push(`nutrición ${n0(r.calories)}kcal/${n0(r.meals)}comidas`);
    if (r.waterMl != null) parts.push(`agua ${n0(r.waterMl)}ml`);
    if (r.sleepMinutes != null) parts.push(`sueño ${n0(r.sleepMinutes)}min${r.sleepQuality != null ? `(cal ${n1(r.sleepQuality)})` : ""}`);
    if (r.weightKg != null) parts.push(`peso ${n1(r.weightKg)}kg`);
    if (r.steps != null) parts.push(`${n0(r.steps)}pasos`);
    if (r.restingHr != null) parts.push(`FC ${n0(r.restingHr)}`);
    if (r.hrvMs != null) parts.push(`HRV ${n0(r.hrvMs)}`);
    if (parts.length) lines.push(`- ${r.date}: ${parts.join(", ")}`);
  }

  return lines.join("\n");
}

// ── Generator ────────────────────────────────────────────────────────────────

export async function generateCrossInsight({ context, tier }: CrossInsightInput) {
  const { model, name: modelName } = resolveModel(tier);
  const { prompt: systemPrompt } = await getPromptWithMeta("cross-metric-insight");

  const userText = buildUserText(context);

  const { object } = await generateObject({
    model,
    schema: CrossInsightSchema,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    experimental_telemetry: {
      isEnabled: true,
      functionId: "cross-insight-generator",
      metadata: { tier, modelName, periodType: context.period.type },
    },
  });

  return {
    ...object,
    model_used: modelName,
  };
}
