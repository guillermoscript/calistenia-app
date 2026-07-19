import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel, type Tier } from "./model-resolver.js";
import { getPromptWithMeta } from "./prompts.js";

// ── Output schema ────────────────────────────────────────────────────────────
// Framed as OBSERVED PATTERNS, never medical advice/diagnosis. See the
// "sleep-pattern-summary" prompt (Langfuse + FALLBACKS) for the safety framing.
// MUST match packages/core SleepInsightPayload EXACTLY (shared contract, #244).

const SleepInsightSchema = z.object({
  headline: z.string().describe("1 frase resumen del patrón de sueño (español)"),
  avgDurationMin: z.number().describe("Media de minutos dormidos en la ventana (usa el dato agregado provisto)"),
  avgQuality: z.number().describe("Media de calidad 1-5 (usa el dato agregado provisto)"),
  bedtimeConsistency: z
    .enum(["consistent", "variable", "irregular"])
    .describe("Consistencia del horario de acostarse según la desviación estándar provista"),
  patterns: z
    .array(z.string())
    .describe("2-4 observaciones cruzando duración/calidad con despertares/cafeína/pantalla/estrés. Correlación, NO causa ni diagnóstico."),
  suggestion: z.string().describe("UNA sola sugerencia accionable, suave y opcional"),
  trend: z
    .enum(["improving", "declining", "stable"])
    .describe("Tendencia vs el periodo anterior si hay datos; 'stable' si no hay comparación clara"),
});

export type SleepInsight = z.infer<typeof SleepInsightSchema>;

// ── Input (the compact rollup from packages/core buildInsightContext) ─────────
// Typed locally to avoid a cross-package import; matches InsightContext's JSON
// shape (only the fields the sleep summary actually reads).

interface InsightDayRow {
  date: string;
  sleepMinutes?: number;
  sleepQuality?: number;
  awakenings?: number;
  caffeine?: boolean;
  screenBeforeBed?: boolean;
  stressLevel?: number;
  bedtime?: string;
}

interface InsightSummarySleep {
  daysLogged: number;
  avgMinutes: number | null;
  avgQuality: number | null;
  avgAwakenings: number;
  pctCaffeine: number;
  pctScreenBeforeBed: number;
  avgStress: number;
  bedtimeConsistencyMin: number;
}

interface InsightSummary {
  days: number;
  daysWithAnyData: number;
  sleep: InsightSummarySleep;
}

export interface InsightContext {
  period: { type: "weekly" | "monthly"; days: number; start: string; end: string };
  rows: InsightDayRow[];
  summary: InsightSummary;
  previousSummary?: InsightSummary;
}

interface SleepInsightInput {
  context: InsightContext;
  tier: Tier;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const n1 = (v: number | null | undefined): string =>
  v == null ? "?" : Math.round(v * 10) / 10 + "";
const n0 = (v: number | null | undefined): string =>
  v == null ? "?" : Math.round(v) + "";

function buildSleepUserText(ctx: InsightContext): string {
  const { period, summary: s, rows } = ctx;
  const label = period.type === "weekly" ? "últimos 7 días" : "últimos 30 días";
  const sleep = s.sleep;

  const lines: string[] = [];
  lines.push(
    `Periodo: ${label} (${period.start} a ${period.end}). Noches con registro de sueño: ${sleep.daysLogged}/${period.days}.`,
  );
  lines.push("");
  lines.push("## Resumen de sueño");
  lines.push(`- Duración media: ~${n0(sleep.avgMinutes)} min/noche.`);
  lines.push(`- Calidad media: ~${n1(sleep.avgQuality)}/5.`);
  lines.push(`- Despertares promedio: ~${n1(sleep.avgAwakenings)} por noche.`);
  lines.push(`- % de noches con cafeína registrada: ${sleep.pctCaffeine}%.`);
  lines.push(`- % de noches con pantalla antes de dormir: ${sleep.pctScreenBeforeBed}%.`);
  lines.push(`- Estrés medio antes de dormir: ~${n1(sleep.avgStress)}/5 (0 si no se registró en el periodo).`);
  lines.push(
    `- Consistencia del horario de acostarse (desviación estándar): ${sleep.bedtimeConsistencyMin} min (menor = más consistente; ~0-20min consistente, ~20-60min variable, >60min irregular).`,
  );

  const covMin = period.days <= 7 ? 4 : 10;
  if (sleep.daysLogged < covMin) {
    lines.push("");
    lines.push(
      `## Cobertura insuficiente: solo ${sleep.daysLogged}/${period.days} noches registradas. NO afirmes patrones fuertes — dilo con honestidad y sugiere seguir registrando.`,
    );
  }

  if (ctx.previousSummary) {
    const p = ctx.previousSummary.sleep;
    lines.push("");
    lines.push("## Periodo anterior (para comparar — NO inventes una tendencia fuerte con un solo periodo previo)");
    lines.push(
      `- Registrado ${p.daysLogged} noches · ~${n0(p.avgMinutes)} min/noche · calidad ~${n1(p.avgQuality)}/5 · consistencia ${p.bedtimeConsistencyMin} min.`,
    );
  }

  lines.push("");
  lines.push("## Detalle por noche (solo noches con datos de sueño)");
  for (const r of rows) {
    if (r.sleepMinutes == null && r.sleepQuality == null) continue;
    const parts: string[] = [];
    if (r.sleepMinutes != null) parts.push(`${n0(r.sleepMinutes)}min`);
    if (r.sleepQuality != null) parts.push(`calidad ${n1(r.sleepQuality)}`);
    if (r.bedtime) parts.push(`acostada ${r.bedtime}`);
    if (r.awakenings != null) parts.push(`${r.awakenings} despertares`);
    if (r.caffeine) parts.push("cafeína");
    if (r.screenBeforeBed) parts.push("pantalla antes de dormir");
    if (r.stressLevel != null) parts.push(`estrés ${r.stressLevel}`);
    lines.push(`- ${r.date}: ${parts.join(", ")}`);
  }

  return lines.join("\n");
}

// ── Generator ────────────────────────────────────────────────────────────────

export async function generateSleepInsight({ context, tier }: SleepInsightInput) {
  const { model, name: modelName } = resolveModel(tier);
  const { prompt: systemPrompt } = await getPromptWithMeta("sleep-pattern-summary");

  const userText = buildSleepUserText(context);

  const { object } = await generateObject({
    model,
    schema: SleepInsightSchema,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    experimental_telemetry: {
      isEnabled: true,
      functionId: "sleep-insight-generator",
      metadata: { tier, modelName, periodType: context.period.type },
    },
  });

  return {
    ...object,
    model_used: modelName,
  };
}
