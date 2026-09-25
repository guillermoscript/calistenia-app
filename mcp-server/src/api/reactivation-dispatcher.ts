/**
 * reactivation-dispatcher.ts
 *
 * Push de recuperación MÁS ALLÁ del día 7 (#807). Complementa a
 * inactivity-dispatcher.ts (#695), que solo cubre la primera semana de quien
 * nunca entrenó (24h / 72h) y ahí se detiene.
 *
 * Dos poblaciones, con copy y campaña distintos:
 *   - `never_trained`: cuenta creada hace 7+ días y NINGUNA sesión. Los días
 *     de inactividad se cuentan desde `users.created`.
 *   - `trained_then_stopped`: entrenó alguna vez y lleva 7+ días sin hacerlo.
 *     Se cuenta desde `user_stats.last_workout_date` (día local, lo mantiene
 *     pb_hooks/utils/workout_stats.js). Este grupo no recibía ningún push.
 *
 * Tramos (`inactiveDays` = días enteros sin entrenar):
 *   - [7, 14)  → `inactivity_7d`, una vez por episodio
 *   - [14, 21) → `inactivity_14d`, una vez por episodio
 *   - lunes local, cualquier día de [7, 42) → `inactivity_new_start`, si no
 *     hubo NINGÚN push de la familia de inactividad en los 6 días anteriores
 *   - >= 42 → nada: seis semanas después, más pushes son ruido.
 *
 * Prioridad y topes:
 *   - Como mucho UN push de inactividad por usuario y día LOCAL, contando
 *     también los de 24h/72h de #695. Si en el mismo tick coinciden varios
 *     tramos gana el primero de la lista de arriba (7d > 14d > nuevo
 *     comienzo): los de 7d/14d son de una sola vez y caducan; el lunes vuelve.
 *   - Solo dentro de la ventana horaria local [9, 21) — la misma de #695.
 *   - «Una vez por episodio»: una marca solo cuenta si es posterior al ancla
 *     (el alta, o el día siguiente al último entreno). Quien vuelve a entrenar
 *     y luego vuelve a parar recibe otra vez el de 7d.
 *
 * Campañas (`data.campaign` de la notificación y del push, para OpenPanel):
 * `<kind>_<segment>`, p. ej. `inactivity_7d_never_trained` o
 * `inactivity_new_start_trained_then_stopped`. El `type` de la fila de
 * `notifications` es el `kind` a secas (dedupe y copy de la lista in-app).
 *
 * Dedupe e idempotencia: igual que inactivity-dispatcher.ts — la marca en
 * `notifications` se guarda ANTES de enviar, y el scheduler requiere una
 * sola instancia del API.
 */
import { getAdminPB } from "./admin-pb.js";
import { sendPushToUser, normalizePushLanguage, type LocalizedText } from "./push-sender.js";
import { localParts, safeTimeZone, pushAllowed } from "./reminder-dispatcher.js";
import {
  hasAnySession,
  resolveDayLabel,
  INACTIVITY_MIN_HOUR,
  INACTIVITY_MAX_HOUR,
} from "./inactivity-dispatcher.js";

// ─── Tipos y constantes ──────────────────────────────────────────────────────

export type ReactivationKind = "inactivity_7d" | "inactivity_14d" | "inactivity_new_start";
export type ReactivationSegment = "never_trained" | "trained_then_stopped";

/** Todos los `type` de notificación que cuentan para el tope de uno al día. */
export const INACTIVITY_FAMILY: readonly string[] = [
  "inactivity_24h",
  "inactivity_72h",
  "inactivity_7d",
  "inactivity_14d",
  "inactivity_new_start",
];

/** Días sin entrenar a partir de los que se deja de insistir. */
export const REACTIVATION_MAX_DAYS = 42;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Sin «nuevo comienzo» si hubo cualquier push de inactividad en estos días. */
const NEW_START_QUIET_MS = 6 * DAY_MS;
const MONDAY = 1;

/** Una marca ya guardada en `notifications`. */
export interface SentMark {
  type: string;
  sentAt: Date;
}

// ─── Lógica pura (testeable) ─────────────────────────────────────────────────

/** Días entre dos 'YYYY-MM-DD' (a - b), sin depender de la zona horaria. */
export function diffLocalDays(a: string, b: string): number {
  const toN = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  };
  return toN(a) - toN(b);
}

/** Nombre estable de la campaña, para agrupar en OpenPanel. */
export function reactivationCampaign(kind: ReactivationKind, segment: ReactivationSegment): string {
  return `${kind}_${segment}`;
}

/**
 * ¿Qué push de recuperación (si alguno) toca ahora?
 *
 * @param inactiveDays días enteros sin entrenar (desde el alta o desde el último entreno).
 * @param episodeStart ancla del episodio: las marcas anteriores son de un
 *   episodio pasado y no bloquean los tramos de este.
 * @param sent marcas de la familia de inactividad de este usuario (cualquier fecha).
 */
export function evaluateReactivation(input: {
  inactiveDays: number;
  episodeStart: Date;
  now: Date;
  timeZone: string;
  sent: readonly SentMark[];
}): ReactivationKind | null {
  const { inactiveDays, episodeStart, now, sent } = input;
  if (inactiveDays < 7 || inactiveDays >= REACTIVATION_MAX_DAYS) return null;

  const tz = safeTimeZone(input.timeZone);
  const local = localParts(now, tz);
  if (local.hour < INACTIVITY_MIN_HOUR || local.hour >= INACTIVITY_MAX_HOUR) return null;

  const family = sent.filter((s) => INACTIVITY_FAMILY.includes(s.type));
  // Tope: uno al día local, sea del tipo que sea (también 24h/72h de #695).
  if (family.some((s) => localParts(s.sentAt, tz).dateKey === local.dateKey)) return null;

  const episode = family.filter((s) => s.sentAt.getTime() >= episodeStart.getTime());
  const sentInEpisode = (kind: ReactivationKind) => episode.some((s) => s.type === kind);

  if (inactiveDays < 14 && !sentInEpisode("inactivity_7d")) return "inactivity_7d";
  if (inactiveDays >= 14 && inactiveDays < 21 && !sentInEpisode("inactivity_14d")) return "inactivity_14d";

  if (local.weekday === MONDAY) {
    const recent = family.some((s) => now.getTime() - s.sentAt.getTime() < NEW_START_QUIET_MS);
    if (!recent) return "inactivity_new_start";
  }
  return null;
}

/**
 * Copy bilingüe según tramo y comportamiento. `dayLabel` (el próximo día del
 * programa, ya localizado) solo se usa en el «nuevo comienzo».
 */
export function buildReactivationCopy(
  kind: ReactivationKind,
  segment: ReactivationSegment,
  dayLabel: string | null,
): { title: LocalizedText; body: LocalizedText } {
  const never = segment === "never_trained";

  if (kind === "inactivity_7d") {
    return never
      ? {
          title: { es: "Tu primera semana aún no ha empezado", en: "Your first week hasn't started yet" },
          body: {
            es: "Un entreno corto de 10 minutos basta para arrancar. Hoy es buen día.",
            en: "A short 10-minute workout is all it takes to start. Today is a good day.",
          },
        }
      : {
          title: { es: "Una semana sin entrenar", en: "A week without training" },
          body: {
            es: "Lo que ya has ganado sigue ahí. Una sesión hoy y retomas el ritmo.",
            en: "What you've built is still there. One session today and you're back in rhythm.",
          },
        };
  }

  if (kind === "inactivity_14d") {
    return never
      ? {
          title: { es: "Sigue siendo buen momento para empezar", en: "It's still a good time to start" },
          body: {
            es: "Sin presión: tu primer entreno dura unos minutos y se adapta a tu nivel.",
            en: "No pressure: your first workout takes a few minutes and adapts to your level.",
          },
        }
      : {
          title: { es: "¿Volvemos? Tu progreso te espera", en: "Coming back? Your progress is waiting" },
          body: {
            es: "Dos semanas no borran nada. Empieza suave: una sesión corta hoy.",
            en: "Two weeks don't erase anything. Ease back in with a short session today.",
          },
        };
  }

  if (never) {
    return {
      title: { es: "Nueva semana, primer entreno", en: "New week, first workout" },
      body: dayLabel
        ? { es: `Empieza hoy con ${dayLabel}. Unos minutos bastan.`, en: `Start today with ${dayLabel}. A few minutes is enough.` }
        : {
            es: "Los lunes son el mejor día para empezar. Unos minutos bastan.",
            en: "Mondays are the best day to start. A few minutes is enough.",
          },
    };
  }
  return {
    title: { es: "Nueva semana, nuevo comienzo", en: "New week, fresh start" },
    body: dayLabel
      ? {
          es: `Retoma con ${dayLabel}. Lo pasado no cuenta: empieza hoy.`,
          en: `Pick it back up with ${dayLabel}. The past doesn't count — start today.`,
        }
      : {
          es: "Lo pasado no cuenta. Empieza la semana con un entreno corto.",
          en: "The past doesn't count. Start the week with a short workout.",
        },
  };
}

/** `Date` → literal de filtro de PocketBase `YYYY-MM-DD HH:MM:SS.sssZ`. */
function pbDateTime(d: Date): string {
  return d.toISOString().replace("T", " ");
}

/** `Date` → 'YYYY-MM-DD' en UTC. */
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Acceso a datos ──────────────────────────────────────────────────────────

export interface ReactivationCandidate {
  userId: string;
  segment: ReactivationSegment;
  timezone?: string;
  /** Crudo de `users.language`. */
  language?: string;
  /** `users.created` (never_trained). */
  created?: string;
  /** `user_stats.last_workout_date`, 'YYYY-MM-DD' local (trained_then_stopped). */
  lastWorkoutDate?: string;
}

/**
 * «Nunca entrenó»: cuentas creadas hace entre 7 y 42 días. Que no tengan
 * sesiones se comprueba después, una a una (`hasAnySession`).
 */
export async function loadNeverTrainedCandidates(pb: any, now: Date): Promise<ReactivationCandidate[]> {
  const from = pbDateTime(new Date(now.getTime() - REACTIVATION_MAX_DAYS * DAY_MS));
  const to = pbDateTime(new Date(now.getTime() - 7 * DAY_MS));
  const rows = await pb.collection("users").getFullList({
    filter: pb.filter("created >= {:from} && created <= {:to}", { from, to }),
    fields: "id,timezone,created,language",
  });
  return rows.map((u: any) => ({
    userId: u.id,
    segment: "never_trained" as const,
    timezone: u.timezone,
    language: u.language,
    created: u.created,
  }));
}

/**
 * «Entrenó y paró»: `user_stats.last_workout_date` entre hace 43 y hace 6
 * días en UTC. El margen de un día a cada lado cubre los husos; el número
 * exacto de días se calcula después con el «hoy» local de cada usuario.
 */
export async function loadStoppedCandidates(pb: any, now: Date): Promise<ReactivationCandidate[]> {
  const from = utcDateKey(new Date(now.getTime() - (REACTIVATION_MAX_DAYS + 1) * DAY_MS));
  const to = utcDateKey(new Date(now.getTime() - 6 * DAY_MS));
  const rows = await pb.collection("user_stats").getFullList({
    filter: pb.filter("last_workout_date >= {:from} && last_workout_date <= {:to}", { from, to }),
    expand: "user",
    fields: "user,last_workout_date,expand.user.timezone,expand.user.language",
  });
  return rows
    .filter((r: any) => typeof r.last_workout_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.last_workout_date))
    .map((r: any) => ({
      userId: r.user,
      segment: "trained_then_stopped" as const,
      timezone: r.expand?.user?.timezone,
      language: r.expand?.user?.language,
      lastWorkoutDate: r.last_workout_date,
    }));
}

/** Marcas de la familia de inactividad ya guardadas para este usuario. */
async function loadSentMarks(pb: any, userId: string): Promise<SentMark[]> {
  try {
    const typeFilter = INACTIVITY_FAMILY.map((_, i) => `type = {:k${i}}`).join(" || ");
    const params: Record<string, string> = { uid: userId };
    INACTIVITY_FAMILY.forEach((k, i) => { params[`k${i}`] = k; });
    const rows = await pb.collection("notifications").getFullList({
      filter: pb.filter(`user = {:uid} && (${typeFilter})`, params),
      fields: "type,created",
    });
    return rows.map((r: any) => ({ type: r.type, sentAt: new Date(String(r.created).replace(" ", "T")) }));
  } catch (err) {
    console.error(`[reactivation] error cargando notificaciones previas de ${userId}:`, err);
    // Sin historial no se puede garantizar el tope diario: mejor no enviar.
    throw err;
  }
}

/**
 * Días sin entrenar y ancla del episodio de un candidato, con el «hoy» local.
 * `null` si faltan datos.
 */
export function inactivityOf(
  c: ReactivationCandidate,
  now: Date,
  todayLocal: string,
): { inactiveDays: number; episodeStart: Date } | null {
  if (c.segment === "never_trained") {
    if (!c.created) return null;
    const created = new Date(c.created.replace(" ", "T"));
    if (Number.isNaN(created.getTime())) return null;
    return { inactiveDays: Math.floor((now.getTime() - created.getTime()) / DAY_MS), episodeStart: created };
  }
  if (!c.lastWorkoutDate) return null;
  const [y, m, d] = c.lastWorkoutDate.split("-").map(Number);
  // El episodio empieza al día siguiente del último entreno: una marca de ese
  // mismo día es, por fuerza, del episodio anterior.
  return {
    inactiveDays: diffLocalDays(todayLocal, c.lastWorkoutDate),
    episodeStart: new Date(Date.UTC(y, m - 1, d + 1)),
  };
}

// ─── Despacho ────────────────────────────────────────────────────────────────

export interface ReactivationDispatchResult {
  candidates: number;
  sent: number;
  skipped: number;
  errors: number;
}

export async function dispatchReactivationPushes(
  pb: any,
  now: Date = new Date(),
): Promise<ReactivationDispatchResult> {
  const result: ReactivationDispatchResult = { candidates: 0, sent: 0, skipped: 0, errors: 0 };

  let candidates: ReactivationCandidate[];
  try {
    // «Entrenó y paró» primero: si un usuario saliera en las dos listas (p. ej.
    // borró sus sesiones pero `user_stats` aún recuerda el último día), gana
    // el dato de entreno.
    const stopped = await loadStoppedCandidates(pb, now);
    const seen = new Set(stopped.map((c) => c.userId));
    const never = (await loadNeverTrainedCandidates(pb, now)).filter((c) => !seen.has(c.userId));
    candidates = [...stopped, ...never];
  } catch (err) {
    console.error("[reactivation] error cargando candidatos:", err);
    result.errors++;
    return result;
  }

  result.candidates = candidates.length;

  for (const c of candidates) {
    try {
      const tz = safeTimeZone(c.timezone);
      const todayLocal = localParts(now, tz).dateKey;
      const inactivity = inactivityOf(c, now, todayLocal);
      if (!inactivity || inactivity.inactiveDays < 7 || inactivity.inactiveDays >= REACTIVATION_MAX_DAYS) {
        result.skipped++;
        continue;
      }
      if (!(await pushAllowed(pb, c.userId))) {
        result.skipped++;
        continue;
      }
      if (c.segment === "never_trained" && (await hasAnySession(pb, c.userId))) {
        result.skipped++;
        continue;
      }

      const sent = await loadSentMarks(pb, c.userId);
      const kind = evaluateReactivation({ ...inactivity, now, timeZone: tz, sent });
      if (!kind) {
        result.skipped++;
        continue;
      }

      const language = normalizePushLanguage(c.language);
      const dayLabel = kind === "inactivity_new_start"
        ? await resolveDayLabel(pb, c.userId, tz, todayLocal, language)
        : null;
      const { title, body } = buildReactivationCopy(kind, c.segment, dayLabel);
      const campaign = reactivationCampaign(kind, c.segment);

      // Marca de dedupe ANTES de enviar (mismo trade-off que #695).
      try {
        await pb.collection("notifications").create({
          user: c.userId,
          type: kind,
          actor: c.userId,
          reference_id: c.userId,
          reference_type: "user",
          read: false,
          data: { url: "/workout", campaign, segment: c.segment },
        });
      } catch (err) {
        console.error(`[reactivation] error creando marca de dedupe para ${c.userId}:`, err);
        result.errors++;
        continue;
      }

      await sendPushToUser(c.userId, { title, body, url: "/workout", campaign, language });
      result.sent++;
    } catch (err) {
      console.error(`[reactivation] error procesando usuario ${c.userId}:`, err);
      result.errors++;
    }
  }

  return result;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Tick cada 15 minutos, como el de #695. REQUIERE una sola instancia del API
 * (ver inactivity-dispatcher.ts).
 */
export function startReactivationScheduler(intervalMs = 15 * 60_000): void {
  if (timer) return;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const pb = await getAdminPB();
      const res = await dispatchReactivationPushes(pb);
      if (res.sent > 0 || res.errors > 0) {
        console.error(
          `[reactivation] candidatos=${res.candidates} enviados=${res.sent} saltados=${res.skipped} errores=${res.errors}`,
        );
      }
    } catch (err) {
      console.error("[reactivation] tick falló:", err);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  if (typeof timer === "object" && timer && "unref" in timer) {
    (timer as any).unref();
  }
  void tick();
  console.error("[reactivation] scheduler arrancado (tick de 15min)");
}

export function stopReactivationScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
