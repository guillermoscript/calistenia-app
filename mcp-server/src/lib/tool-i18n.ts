/**
 * i18n for tool-generated text (factors, recommendations, summaries) that ends
 * up rendered in widgets or chat. This is separate from `i18n.ts`, which only
 * localizes PocketBase translatable JSON fields.
 *
 * Locale source: the MCP transport does not currently carry a user locale, so
 * `pickLocale()` reads an optional `language` field off the user's settings
 * record (not yet a column — falls back gracefully) and defaults to Spanish,
 * the app's primary language. When a locale signal is wired (a settings column
 * or a tool arg), every catalog below starts switching automatically.
 */
export type Locale = "es" | "en";

/** Resolve the locale for tool output. Defaults to 'es' (app default). */
export function pickLocale(settings: Record<string, unknown> | null | undefined): Locale {
  const raw = (settings?.language ?? settings?.locale) as string | undefined;
  return raw?.toLowerCase().startsWith("en") ? "en" : "es";
}

type ReadinessCatalog = {
  lumbarPain: (s: number) => string;
  lumbarDiscomfort: (s: number) => string;
  lumbarHealthy: (s: number) => string;
  poorSleep: string;
  noLumbarCheck: string;
  trainedToday: string;
  oneDayRest: string;
  wellRested: string;
  goalMet: (done: number, goal: number) => string;
  goalAtRisk: (remaining: number, daysLeft: number) => string;
  goalOnTrack: (done: number, goal: number, remaining: number) => string;
  recFull: string;
  recModerate: string;
  recLight: string;
  recRest: string;
  // summary (chat markdown)
  hReadiness: string;
  hFactors: string;
  hTodayStats: string;
  statLine: (day: string, done: number, goal: string) => string;
  daysSinceLine: (n: string) => string;
  alreadyTrained: string;
  hScheduled: (title: string) => string;
  scheduledFocus: (focus: string, count: number) => string;
  andMore: (n: number) => string;
  never: string;
};

export const readiness: Record<Locale, ReadinessCatalog> = {
  es: {
    lumbarPain: (s) => `🔴 Dolor lumbar (${s}/5) — considera descansar o movilidad suave`,
    lumbarDiscomfort: (s) => `🟡 Molestia lumbar (${s}/5) — reduce la intensidad si lo necesitas`,
    lumbarHealthy: (s) => `🟢 Lumbar saludable (${s}/5)`,
    poorSleep: "😴 Dormiste mal anoche — espera un rendimiento reducido",
    noLumbarCheck: "⚪ Sin chequeo lumbar reciente — considera hacer uno",
    trainedToday: "⚡ Ya entrenaste hoy — una doble sesión aumentará la fatiga",
    oneDayRest: "✅ 1 día desde el último entreno — buena ventana de recuperación",
    wellRested: "🔄 4+ días desde el último entreno — estás descansado, dale",
    goalMet: (done, goal) => `🎯 ¡Meta semanal cumplida! (${done}/${goal}) — la sesión extra es un bonus`,
    goalAtRisk: (rem, days) => `⚠️ Necesitas ${rem} sesión(es) más en ${days} día(s) para la meta — prioriza entrenar`,
    goalOnTrack: (done, goal, rem) => `📊 ${done}/${goal} meta semanal — faltan ${rem}, vas bien`,
    recFull: "¡Estás listo! Intensidad completa.",
    recModerate: "Entrena con intensidad moderada. Escucha a tu cuerpo.",
    recLight: "Considera una sesión más ligera o recuperación activa (movilidad, estiramientos).",
    recRest: "Mejor descansa hoy. Enfócate en recuperación, sueño y nutrición.",
    hReadiness: "Estado",
    hFactors: "Factores",
    hTodayStats: "Datos de hoy",
    statLine: (day, done, goal) => `- Día: ${day} | Semana: ${done}/${goal} sesiones`,
    daysSinceLine: (n) => `- Días desde el último entreno: ${n}`,
    alreadyTrained: "- ✅ Ya entrenaste hoy",
    hScheduled: (title) => `Programado: ${title}`,
    scheduledFocus: (focus, count) => `*${focus}* — ${count} ejercicios`,
    andMore: (n) => `_... y ${n} más_`,
    never: "nunca",
  },
  en: {
    lumbarPain: (s) => `🔴 Lumbar pain (${s}/5) — consider rest or light mobility`,
    lumbarDiscomfort: (s) => `🟡 Lumbar discomfort (${s}/5) — reduce intensity if needed`,
    lumbarHealthy: (s) => `🟢 Lumbar healthy (${s}/5)`,
    poorSleep: "😴 Poor sleep last night — expect reduced performance",
    noLumbarCheck: "⚪ No recent lumbar check — consider doing one",
    trainedToday: "⚡ Already trained today — double session will increase fatigue",
    oneDayRest: "✅ 1 day since last workout — good recovery window",
    wellRested: "🔄 4+ days since last workout — you're well rested, go for it",
    goalMet: (done, goal) => `🎯 Weekly goal met! (${done}/${goal}) — extra session is bonus`,
    goalAtRisk: (rem, days) => `⚠️ Need ${rem} more session(s) in ${days} day(s) to hit goal — prioritize training`,
    goalOnTrack: (done, goal, rem) => `📊 ${done}/${goal} weekly goal — ${rem} to go, on track`,
    recFull: "You're good to go! Full intensity.",
    recModerate: "Train with moderate intensity. Listen to your body.",
    recLight: "Consider a lighter session or active recovery (mobility, stretching).",
    recRest: "Rest day recommended. Focus on recovery, sleep, and nutrition.",
    hReadiness: "Readiness",
    hFactors: "Factors",
    hTodayStats: "Today's Stats",
    statLine: (day, done, goal) => `- Day: ${day} | Week: ${done}/${goal} sessions`,
    daysSinceLine: (n) => `- Days since last workout: ${n}`,
    alreadyTrained: "- ✅ Already trained today",
    hScheduled: (title) => `Scheduled: ${title}`,
    scheduledFocus: (focus, count) => `*${focus}* — ${count} exercises`,
    andMore: (n) => `_... and ${n} more_`,
    never: "never",
  },
};
