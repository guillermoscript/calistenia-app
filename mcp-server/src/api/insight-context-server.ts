/**
 * insight-context-server.ts — server-side (cron-triggered) FAITHFUL port of
 * packages/core/lib/buildInsightContext.ts + packages/core/lib/monthActivity.ts
 * for the weekly cross-metric insight cron (issue #127).
 *
 * The client version relies on a module-level timezone singleton
 * (packages/core/lib/dateUtils.ts `_tz`, set via setTimezone() on login) which
 * does not exist in this server process — the cron handles many users, each
 * with their own timezone, in the same process, so `tz` must be an EXPLICIT
 * parameter threaded through every date helper instead.
 *
 * Reads are done as a single window (7 or 30 days) rather than the client's
 * month-by-month loop (monthsInRange/fetchMonthActivity), since a superuser
 * PocketBase client on the server has no auto-cancel-by-identical-request
 * behavior to work around when reads run sequentially — but sequencing is
 * still preserved between "current" and "previous" windows because that
 * gotcha is about identical concurrent requests to PocketBase in general, not
 * something specific to the browser SDK. See buildInsightContext.ts comments.
 *
 * Resilient: every source degrades to "no data" on failure — never throws.
 */

import type PocketBase from "pocketbase";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import type { InsightContext } from "./cross-insight-generator.js";

// cross-insight-generator.ts declares InsightDayRow/InsightSummary as LOCAL
// (non-exported) interfaces — only InsightContext is exported. Re-declared
// here verbatim (structural typing makes them interchangeable with the
// InsightContext.rows/summary/previousSummary fields at the return site).

export interface InsightDayRow {
  date: string; // YYYY-MM-DD local
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
  awakenings?: number;
  caffeine?: boolean;
  screenBeforeBed?: boolean;
  stressLevel?: number;
  bedtime?: string; // "HH:MM"
  weightKg?: number;
  steps?: number;
  restingHr?: number;
  hrvMs?: number;
  vo2max?: number;
}

export interface InsightSummary {
  days: number;
  daysWithAnyData: number;
  workouts: { total: number; daysTrained: number };
  cardio: { sessions: number; totalKm: number; totalMinutes: number };
  circuits: { sessions: number };
  nutrition: { daysLogged: number; avgCalories: number | null; avgMeals: number | null };
  water: { daysLogged: number; avgMl: number | null };
  sleep: {
    daysLogged: number;
    avgMinutes: number | null;
    avgQuality: number | null;
    avgAwakenings: number;
    pctCaffeine: number;
    pctScreenBeforeBed: number;
    avgStress: number;
    bedtimeConsistencyMin: number;
  };
  weight: { firstKg: number | null; lastKg: number | null; deltaKg: number | null };
  watch: { available: boolean; avgSteps: number | null; avgRestingHr: number | null; avgHrvMs: number | null };
  streaks: { currentTrainingStreak: number; longestTrainingStreak: number };
}

dayjs.extend(utc);
dayjs.extend(timezone);

// ─── Timezone-parameterized date helpers ────────────────────────────────────
// Mirror packages/core/lib/dateUtils.ts exactly, except `tz` is an explicit
// argument instead of the module-level `_tz` singleton.

const todayStr = (tz: string): string => dayjs().tz(tz).format("YYYY-MM-DD");

const addDays = (dateStr: string, offset: number, tz: string): string =>
  dayjs.tz(dateStr, tz).add(offset, "day").format("YYYY-MM-DD");

const utcToLocalDate = (utcTimestamp: string, tz: string): string =>
  dayjs.utc(utcTimestamp).tz(tz).format("YYYY-MM-DD");

const localMidnightAsUTC = (dateStr: string, tz: string): string =>
  dayjs.tz(dateStr, tz).utc().format("YYYY-MM-DD HH:mm:ss");

const diffDays = (a: string, b: string, tz: string): number =>
  dayjs.tz(a, tz).diff(dayjs.tz(b, tz), "day");

// PB `date` fields (sleep_entries/weight_entries/daily_health_cache) serialize
// as "YYYY-MM-DD 00:00:00.000Z" — take the local-date prefix, same as
// monthActivity.ts `dateKey`.
const dateKey = (raw: string): string => (raw || "").split(" ")[0].split("T")[0];

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

// ─── Sleep-stat helpers (verbatim inline mirror of packages/core/lib/sleepStats.ts
// — this file avoids a cross-package import, see header comment; keep these in
// sync with that file if the math ever changes) ─────────────────────────────

/**
 * Convierte un bedtime "HH:MM" a minutos desde medianoche, tratando las horas
 * de madrugada (0-11) como "día siguiente" (ej. "01:00" -> 25*60) para que una
 * mezcla de bedtimes tipo 23:30 y 00:45 no vea una dispersión espuria de ~23h.
 * Devuelve null si el string no tiene forma "HH:MM" parseable.
 */
function bedtimeToMinutes(bedtime: string): number | null {
  const parts = (bedtime || "").split(":").map(Number);
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  const [h, m] = parts;
  return h < 12 ? (h + 24) * 60 + m : h * 60 + m;
}

/**
 * Desviación estándar (poblacional, /n) en minutos de un conjunto de bedtimes
 * "HH:MM". Con 0 o 1 muestra válida no hay dispersión que calcular -> 0.
 */
function bedtimeConsistencyMinutes(bedtimes: string[]): number {
  const minutes = bedtimes.map(bedtimeToMinutes).filter((n): n is number => n !== null);
  if (minutes.length < 2) return 0;
  const mean = minutes.reduce((s, v) => s + v, 0) / minutes.length;
  const variance = minutes.reduce((s, v) => s + (v - mean) ** 2, 0) / minutes.length;
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

/**
 * Porcentaje (0-100) de flags booleanos en `true`, ignorando entradas
 * `undefined` (días sin ese dato). Sin entradas definidas -> 0.
 */
function pctTrue(flags: Array<boolean | undefined>): number {
  const defined = flags.filter((f): f is boolean => f !== undefined);
  if (defined.length === 0) return 0;
  const trueCount = defined.filter(Boolean).length;
  return Math.round((trueCount / defined.length) * 100);
}

/**
 * Media de valores numéricos, ignorando entradas `undefined`. Sin entradas
 * definidas -> 0 (no `null`, para que encaje directo en un campo `number`).
 */
function avgDefined(values: Array<number | undefined>): number {
  const defined = values.filter((v): v is number => v !== undefined);
  if (defined.length === 0) return 0;
  return Math.round((defined.reduce((s, v) => s + v, 0) / defined.length) * 10) / 10;
}

// ─── Minimal shapes (only the fields buildDayRows actually reads) ───────────
// packages/core's MonthActivity carries measurements/photos/lumbar too, but
// buildDayRows never reads them, so they're omitted here (client comment:
// "Los entrenamientos NO se incluyen aquí" / measurements+photos+lumbar are
// calendar-only and unused by the insight rollup).

interface DayNutritionSummary {
  meals: number;
  calories: number;
}

interface DayWaterSummary {
  totalMl: number;
}

interface CardioSessionLite {
  started_at: string;
  distance_km?: number;
  duration_seconds?: number;
}

interface CircuitSessionLite {
  started_at: string;
}

interface SleepEntryLite {
  duration_minutes?: number;
  quality?: number;
  awakenings?: number;
  caffeine?: boolean;
  screen_before_bed?: boolean;
  stress_level?: number;
  bedtime?: string;
}

interface WeightEntryLite {
  weight_kg: number;
}

interface MergedActivity {
  cardio: CardioSessionLite[];
  circuits: CircuitSessionLite[];
  nutritionByDate: Record<string, DayNutritionSummary>;
  waterByDate: Record<string, DayWaterSummary>;
  sleepByDate: Record<string, SleepEntryLite>;
  weightByDate: Record<string, WeightEntryLite>;
}

function emptyMergedActivity(): MergedActivity {
  return {
    cardio: [],
    circuits: [],
    nutritionByDate: {},
    waterByDate: {},
    sleepByDate: {},
    weightByDate: {},
  };
}

// Forma mínima de un registro `sessions` (entrenamiento de fuerza) — igual que
// SessionLite en buildInsightContext.ts.
interface SessionLite {
  id: string;
  completed_at?: string;
  created?: string;
  duration_seconds?: number;
}

// ─── Pure helpers (verbatim port of buildDayRows/summarizeRows/previousWindow,
// with tz threaded through every date-utils call) ───────────────────────────

/**
 * Ventana [start, end] INMEDIATAMENTE anterior a una de `days` días que
 * empieza en `start` (misma longitud, sin solape). Pura y testeable sin PB.
 * Verbatim port of buildInsightContext.ts previousWindow, tz explicit.
 */
export function previousWindow(start: string, days: number, tz: string): { start: string; end: string } {
  const end = addDays(start, -1, tz);
  return { start: addDays(end, -(days - 1), tz), end };
}

/**
 * Construye las filas por día a partir de una MergedActivity ya combinada más
 * fuerza/reloj (ya agrupados por fecha), recortando a [start, end]. Pura: no
 * toca PB, solo agrupa datos ya obtenidos. Verbatim port of buildDayRows.
 */
function buildDayRows(
  merged: MergedActivity,
  strengthByDate: Record<string, { workouts: number; workoutMinutes: number }>,
  watchByDate: Record<string, { steps?: number; restingHr?: number; hrvMs?: number; vo2max?: number }>,
  start: string,
  end: string,
  tz: string,
): InsightDayRow[] {
  const inRange = (date: string): boolean => date >= start && date <= end;
  const map = new Map<string, InsightDayRow>();
  const ensure = (date: string): InsightDayRow => {
    let row = map.get(date);
    if (!row) {
      row = { date };
      map.set(date, row);
    }
    return row;
  };

  // Cardio: puede haber varias sesiones el mismo día → sumamos segundos aparte
  // y redondeamos una sola vez al final (evita arrastre de redondeo).
  const cardioSeconds = new Map<string, number>();
  for (const c of merged.cardio) {
    const date = utcToLocalDate(c.started_at, tz);
    if (!date || !inRange(date)) continue;
    const row = ensure(date);
    row.cardioSessions = (row.cardioSessions ?? 0) + 1;
    row.cardioKm = round2((row.cardioKm ?? 0) + (c.distance_km || 0));
    cardioSeconds.set(date, (cardioSeconds.get(date) ?? 0) + (c.duration_seconds || 0));
  }
  for (const [date, seconds] of cardioSeconds) {
    const row = map.get(date);
    if (row) row.cardioMinutes = Math.round(seconds / 60);
  }

  for (const c of merged.circuits) {
    const date = utcToLocalDate(c.started_at, tz);
    if (!date || !inRange(date)) continue;
    ensure(date).circuitSessions = (map.get(date)!.circuitSessions ?? 0) + 1;
  }

  for (const [date, n] of Object.entries(merged.nutritionByDate)) {
    if (!inRange(date)) continue;
    const row = ensure(date);
    row.meals = n.meals;
    row.calories = n.calories;
  }

  for (const [date, w] of Object.entries(merged.waterByDate)) {
    if (!inRange(date)) continue;
    ensure(date).waterMl = w.totalMl;
  }

  for (const [date, s] of Object.entries(merged.sleepByDate)) {
    if (!inRange(date)) continue;
    const row = ensure(date);
    row.sleepMinutes = s.duration_minutes;
    row.sleepQuality = s.quality;
    row.awakenings = s.awakenings;
    row.caffeine = s.caffeine;
    row.screenBeforeBed = s.screen_before_bed;
    row.stressLevel = s.stress_level;
    row.bedtime = s.bedtime;
  }

  for (const [date, w] of Object.entries(merged.weightByDate)) {
    if (!inRange(date)) continue;
    ensure(date).weightKg = w.weight_kg;
  }

  for (const [date, s] of Object.entries(strengthByDate)) {
    if (!inRange(date)) continue;
    const row = ensure(date);
    row.workouts = s.workouts;
    row.workoutMinutes = s.workoutMinutes;
  }

  for (const [date, w] of Object.entries(watchByDate)) {
    if (!inRange(date)) continue;
    const row = ensure(date);
    if (w.steps !== undefined) row.steps = w.steps;
    if (w.restingHr !== undefined) row.restingHr = w.restingHr;
    if (w.hrvMs !== undefined) row.hrvMs = w.hrvMs;
    if (w.vo2max !== undefined) row.vo2max = w.vo2max;
  }

  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Calcula el resumen agregado a partir de las filas por día. Pura: no toca PB.
 * Verbatim port of summarizeRows, tz explicit (only used by diffDays/addDays
 * for streak math).
 */
function summarizeRows(
  rows: InsightDayRow[],
  days: number,
  end: string,
  watchAvailable: boolean,
  tz: string,
): InsightSummary {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const sum = (get: (r: InsightDayRow) => number | undefined): number =>
    sorted.reduce((acc, r) => acc + (get(r) ?? 0), 0);
  const countDefined = (get: (r: InsightDayRow) => number | undefined): number =>
    sorted.filter((r) => get(r) !== undefined).length;

  const workoutsTotal = sum((r) => r.workouts);
  const daysTrained = sorted.filter((r) => (r.workouts ?? 0) > 0).length;

  const cardioSessions = sum((r) => r.cardioSessions);
  const cardioKm = round2(sum((r) => r.cardioKm));
  const cardioMinutes = sum((r) => r.cardioMinutes);

  const circuitSessions = sum((r) => r.circuitSessions);

  const nutritionDays = countDefined((r) => r.meals);
  const caloriesTotal = sum((r) => r.calories);
  const mealsTotal = sum((r) => r.meals);

  const waterDays = countDefined((r) => r.waterMl);
  const waterTotal = sum((r) => r.waterMl);

  const sleepDays = countDefined((r) => r.sleepMinutes);
  const sleepMinutesTotal = sum((r) => r.sleepMinutes);
  const sleepQualityDays = countDefined((r) => r.sleepQuality);
  const sleepQualityTotal = sum((r) => r.sleepQuality);
  const avgAwakenings = avgDefined(sorted.map((r) => r.awakenings));
  const pctCaffeine = pctTrue(sorted.map((r) => r.caffeine));
  const pctScreenBeforeBed = pctTrue(sorted.map((r) => r.screenBeforeBed));
  const avgStress = avgDefined(sorted.map((r) => r.stressLevel));
  const bedtimeConsistencyMin = bedtimeConsistencyMinutes(
    sorted.map((r) => r.bedtime).filter((b): b is string => b !== undefined),
  );

  const weightRows = sorted.filter((r) => r.weightKg !== undefined);
  const firstKg = weightRows.length > 0 ? weightRows[0].weightKg! : null;
  const lastKg = weightRows.length > 0 ? weightRows[weightRows.length - 1].weightKg! : null;
  const deltaKg = firstKg !== null && lastKg !== null ? round2(lastKg - firstKg) : null;

  const stepsDays = countDefined((r) => r.steps);
  const hrDays = countDefined((r) => r.restingHr);
  const hrvDays = countDefined((r) => r.hrvMs);

  // Racha más larga: mayor tramo de días consecutivos (calendario) con entrenamiento.
  const workoutDates = sorted.filter((r) => (r.workouts ?? 0) > 0).map((r) => r.date);
  let longestTrainingStreak = 0;
  let run = 0;
  for (let i = 0; i < workoutDates.length; i++) {
    run = i === 0 || diffDays(workoutDates[i], workoutDates[i - 1], tz) === 1 ? run + 1 : 1;
    longestTrainingStreak = Math.max(longestTrainingStreak, run);
  }

  // Racha actual: retrocede día a día desde `end`, tope en la longitud de la ventana.
  const workoutSet = new Set(workoutDates);
  let currentTrainingStreak = 0;
  for (let k = 0; k < days; k++) {
    if (!workoutSet.has(addDays(end, -k, tz))) break;
    currentTrainingStreak += 1;
  }

  return {
    days,
    daysWithAnyData: sorted.length,
    workouts: { total: workoutsTotal, daysTrained },
    cardio: { sessions: cardioSessions, totalKm: cardioKm, totalMinutes: cardioMinutes },
    circuits: { sessions: circuitSessions },
    nutrition: {
      daysLogged: nutritionDays,
      avgCalories: nutritionDays > 0 ? Math.round(caloriesTotal / nutritionDays) : null,
      avgMeals: nutritionDays > 0 ? round1(mealsTotal / nutritionDays) : null,
    },
    water: { daysLogged: waterDays, avgMl: waterDays > 0 ? Math.round(waterTotal / waterDays) : null },
    sleep: {
      daysLogged: sleepDays,
      avgMinutes: sleepDays > 0 ? Math.round(sleepMinutesTotal / sleepDays) : null,
      avgQuality: sleepQualityDays > 0 ? round1(sleepQualityTotal / sleepQualityDays) : null,
      avgAwakenings,
      pctCaffeine,
      pctScreenBeforeBed,
      avgStress,
      bedtimeConsistencyMin,
    },
    weight: { firstKg, lastKg, deltaKg },
    watch: {
      available: watchAvailable,
      avgSteps: watchAvailable && stepsDays > 0 ? Math.round(sum((r) => r.steps) / stepsDays) : null,
      avgRestingHr: watchAvailable && hrDays > 0 ? Math.round(sum((r) => r.restingHr) / hrDays) : null,
      avgHrvMs: watchAvailable && hrvDays > 0 ? round1(sum((r) => r.hrvMs) / hrDays) : null,
    },
    streaks: { currentTrainingStreak, longestTrainingStreak },
  };
}

// ─── Orchestration (PB reads, superuser client) ─────────────────────────────

/**
 * Agrega toda la actividad de `userId` dentro de [start, end] (una ventana de
 * `days` días) desde PB: calendario (cardio/circuitos/nutrición/agua/sueño/
 * peso), entrenamientos de fuerza y reloj. Cada fuente degrada a "sin datos"
 * si falla — nunca lanza. Single-window read (no month-loop): a superuser
 * client on the server doesn't need the client's month-by-month
 * fetchMonthActivity split, so one ranged query per collection suffices for a
 * 7/30-day window.
 */
async function fetchWindow(
  pb: PocketBase,
  userId: string,
  tz: string,
  start: string,
  end: string,
  days: number,
): Promise<{ rows: InsightDayRow[]; summary: InsightSummary; watchAvailable: boolean }> {
  const merged = emptyMergedActivity();

  const pbStart = localMidnightAsUTC(start, tz);
  const pbEndExclusive = localMidnightAsUTC(addDays(end, 1, tz), tz);

  // 1. cardio_sessions
  try {
    const items = await pb.collection("cardio_sessions").getFullList({
      filter: pb.filter("user = {:uid} && started_at >= {:start} && started_at < {:end}", {
        uid: userId,
        start: pbStart,
        end: pbEndExclusive,
      }),
      fields: "id,activity_type,distance_km,duration_seconds,started_at,finished_at,note",
    });
    merged.cardio = items as unknown as CardioSessionLite[];
  } catch (err) {
    console.warn("insight-context-server: cardio fetch failed", err);
  }

  // 2. circuit_sessions
  try {
    const items = await pb.collection("circuit_sessions").getFullList({
      filter: pb.filter("user = {:uid} && started_at >= {:start} && started_at < {:end}", {
        uid: userId,
        start: pbStart,
        end: pbEndExclusive,
      }),
      fields: "id,circuit_name,mode,rounds_completed,rounds_target,duration_seconds,started_at,finished_at,note",
    });
    merged.circuits = items as unknown as CircuitSessionLite[];
  } catch (err) {
    console.warn("insight-context-server: circuit fetch failed", err);
  }

  // 3. nutrition_entries
  try {
    const items = await pb.collection("nutrition_entries").getFullList({
      filter: pb.filter("user = {:uid} && logged_at >= {:start} && logged_at < {:end}", {
        uid: userId,
        start: pbStart,
        end: pbEndExclusive,
      }),
      fields: "id,logged_at,total_calories",
    });
    for (const item of items as unknown as Array<{ logged_at: string; total_calories?: number }>) {
      const date = utcToLocalDate(item.logged_at || "", tz);
      if (!date || date === "Invalid Date") continue;
      const cur = merged.nutritionByDate[date] || (merged.nutritionByDate[date] = { meals: 0, calories: 0 });
      cur.meals++;
      cur.calories += item.total_calories || 0;
    }
  } catch (err) {
    console.warn("insight-context-server: nutrition fetch failed", err);
  }

  // 4. water_entries
  try {
    const items = await pb.collection("water_entries").getFullList({
      filter: pb.filter("user = {:uid} && logged_at >= {:start} && logged_at < {:end}", {
        uid: userId,
        start: pbStart,
        end: pbEndExclusive,
      }),
      fields: "id,logged_at,amount_ml",
    });
    for (const item of items as unknown as Array<{ logged_at: string; amount_ml?: number }>) {
      const date = utcToLocalDate(item.logged_at || "", tz);
      if (!date || date === "Invalid Date") continue;
      const cur = merged.waterByDate[date] || (merged.waterByDate[date] = { totalMl: 0 });
      cur.totalMl += item.amount_ml || 0;
    }
  } catch (err) {
    console.warn("insight-context-server: water fetch failed", err);
  }

  // 5. sleep_entries (date field, lexicographic YYYY-MM-DD range)
  try {
    const items = await pb.collection("sleep_entries").getFullList({
      filter: pb.filter("user = {:uid} && date >= {:start} && date <= {:end}", {
        uid: userId,
        start,
        end,
      }),
      fields: "id,date,quality,duration_minutes,bedtime,wake_time,awakenings,caffeine,screen_before_bed,stress_level",
    });
    for (const raw of items as unknown as Array<{
      date: string;
      quality?: number;
      duration_minutes?: number;
      awakenings?: number;
      caffeine?: boolean;
      screen_before_bed?: boolean;
      stress_level?: number;
      bedtime?: string;
    }>) {
      const date = dateKey(raw.date);
      if (!date) continue;
      merged.sleepByDate[date] = {
        duration_minutes: raw.duration_minutes,
        quality: raw.quality,
        awakenings: raw.awakenings,
        caffeine: raw.caffeine,
        screen_before_bed: raw.screen_before_bed,
        stress_level: raw.stress_level,
        bedtime: raw.bedtime,
      };
    }
  } catch (err) {
    console.warn("insight-context-server: sleep fetch failed", err);
  }

  // 6. weight_entries (date field, lexicographic YYYY-MM-DD range)
  try {
    const items = await pb.collection("weight_entries").getFullList({
      filter: pb.filter("user = {:uid} && date >= {:start} && date <= {:end}", {
        uid: userId,
        start,
        end,
      }),
      fields: "id,date,weight_kg,note",
    });
    for (const raw of items as unknown as Array<{ date: string; weight_kg: number }>) {
      const date = dateKey(raw.date);
      if (!date) continue;
      merged.weightByDate[date] = { weight_kg: raw.weight_kg };
    }
  } catch (err) {
    console.warn("insight-context-server: weight fetch failed", err);
  }

  // 7. sessions (STRENGTH) — fetchMonthActivity excludes these on purpose;
  // same `user` field and same date (completed_at || created) as buildInsightContext.ts.
  const strengthByDate: Record<string, { workouts: number; workoutMinutes: number }> = {};
  try {
    const sessions = (await pb.collection("sessions").getFullList({
      filter: pb.filter("user = {:uid} && completed_at >= {:start} && completed_at < {:end}", {
        uid: userId,
        start: pbStart,
        end: pbEndExclusive,
      }),
      fields: "id,completed_at,created,duration_seconds",
    })) as unknown as SessionLite[];

    const seconds: Record<string, number> = {};
    for (const s of sessions) {
      const date = utcToLocalDate(s.completed_at || s.created || "", tz);
      if (!date) continue;
      const cur = strengthByDate[date] || (strengthByDate[date] = { workouts: 0, workoutMinutes: 0 });
      cur.workouts += 1;
      seconds[date] = (seconds[date] ?? 0) + (s.duration_seconds || 0);
    }
    for (const [date, secs] of Object.entries(seconds)) {
      strengthByDate[date].workoutMinutes = Math.round(secs / 60);
    }
  } catch (err) {
    console.warn("insight-context-server: sessions fetch failed", err);
  }

  // 8. daily_health_cache (WATCH) — Android-only, can be entirely absent.
  const watchByDate: Record<string, { steps?: number; restingHr?: number; hrvMs?: number; vo2max?: number }> = {};
  let watchAvailable = false;
  try {
    const healthRows = (await pb.collection("daily_health_cache").getFullList({
      filter: pb.filter("user = {:uid} && date >= {:start} && date <= {:end}", { uid: userId, start, end }),
    })) as unknown as Array<{ date: string; steps?: number; resting_hr?: number; hrv_ms?: number; vo2max?: number }>;

    if (healthRows.length > 0) {
      watchAvailable = true;
      for (const r of healthRows) {
        if (!r.date) continue;
        watchByDate[r.date] = { steps: r.steps, restingHr: r.resting_hr, hrvMs: r.hrv_ms, vo2max: r.vo2max };
      }
    }
  } catch (err) {
    console.warn("insight-context-server: daily_health_cache fetch failed", err);
  }

  const rows = buildDayRows(merged, strengthByDate, watchByDate, start, end, tz);
  const summary = summarizeRows(rows, days, end, watchAvailable, tz);

  return { rows, summary, watchAvailable };
}

/**
 * Server-side (cron) equivalent of packages/core/lib/buildInsightContext.ts
 * `buildInsightContext`. `tz` is explicit (caller passes `user.timezone ||
 * 'UTC'`) instead of relying on a login-time-set module singleton, since the
 * cron processes many users' timezones in one process.
 */
export async function buildInsightContextServer(
  pb: PocketBase,
  userId: string,
  tz: string,
  days: 7 | 30,
  withPrevious: boolean,
): Promise<InsightContext> {
  const end = todayStr(tz);
  const start = addDays(end, -(days - 1), tz);
  const period: InsightContext["period"] = { type: days === 7 ? "weekly" : "monthly", days, start, end };

  const current = await fetchWindow(pb, userId, tz, start, end, days);

  let previousSummary: InsightSummary | undefined;
  if (withPrevious) {
    const prev = previousWindow(start, days, tz);
    try {
      // SEQUENTIAL after the current window fully resolves — mirrors
      // buildInsightContext.ts's warning about concurrent PB reads.
      const prevWindow = await fetchWindow(pb, userId, tz, prev.start, prev.end, days);
      previousSummary = prevWindow.summary;
    } catch (err) {
      console.warn("insight-context-server: previous window fetch failed", err);
    }
  }

  let primaryGoal: string | undefined;
  try {
    const user = await pb.collection("users").getOne(userId, { fields: "primary_goal" });
    primaryGoal = (user as { primary_goal?: string }).primary_goal || undefined;
  } catch (err) {
    console.warn("insight-context-server: user primary_goal fetch failed", err);
  }

  return {
    period,
    rows: current.rows,
    summary: current.summary,
    watchAvailable: current.watchAvailable,
    ...(previousSummary ? { previousSummary } : {}),
    ...(primaryGoal ? { primaryGoal } : {}),
  };
}
