/**
 * challenge-reminder-dispatcher.ts
 *
 * Aviso diario de los retos en solitario (#805): quien se unió a un reto de
 * catálogo (`challenges.preset_key != ''`: primera dominada, 100 flexiones,
 * constancia…) y hoy todavía no ha entrenado recibe UN push al final del día.
 *
 * Reglas, en el mismo molde que reminder-dispatcher.ts / reactivation-dispatcher.ts:
 *   - Hora LOCAL del usuario (`users.timezone`, nunca la del servidor), dentro
 *     de la ventana [CHALLENGE_REMINDER_MIN_HOUR, CHALLENGE_REMINDER_MAX_HOUR).
 *     Es de tarde a propósito: si ya entrenó hoy no hace falta avisar, y a las
 *     19:00 todavía queda margen para hacerlo.
 *   - «Ya entrenó hoy» = `user_stats.last_workout_date` (día local, lo mantiene
 *     pb_hooks/utils/workout_stats.js para sesiones, cardio y circuitos) es hoy.
 *   - No avisa de un reto ya completado (puntuación >= meta) ni fuera de su
 *     ventana de fechas, ni pasados CHALLENGE_REMINDER_MAX_DAYS desde el inicio:
 *     un reto de 180/365 días no merece un push diario durante meses.
 *   - Respeta `notification_prefs`: interruptor maestro `push_enabled` Y la
 *     categoría `challenges` (opt-out: solo un `false` explícito suprime).
 *   - Tope: como mucho UN push diario entre este aviso y la familia
 *     `inactivity_*` (la regla de #807). Si hoy ya salió uno de la familia, el
 *     aviso del reto cede. A la inversa, reactivation-dispatcher cuenta
 *     `challenge_reminder` en su tope; el 24h/72h de #695 no lo mira (límite
 *     conocido: solo afecta a cuentas de menos de 7 días sin ningún entreno).
 *   - Un solo aviso por usuario y día aunque esté en varios retos: gana el
 *     primero que siga pendiente.
 *   - Dedupe: marca en `notifications` (`type = challenge_reminder`) creada
 *     ANTES de enviar, igual que #695/#807. Requiere una sola instancia del API.
 *
 * Copy bilingüe `{es,en}` (#804): el idioma se resuelve por destinatario en
 * push-sender.ts.
 */
import { getAdminPB } from "./admin-pb.js";
import { sendPushToUser, normalizePushLanguage, type LocalizedText } from "./push-sender.js";
import { localParts, safeTimeZone, loadTimezones } from "./reminder-dispatcher.js";
import { INACTIVITY_FAMILY } from "./reactivation-dispatcher.js";
import { scoreParticipant, type ScorableChallenge } from "./challenge-score-server.js";

// ─── Constantes ──────────────────────────────────────────────────────────────

export const CHALLENGE_REMINDER_TYPE = "challenge_reminder";
export const CHALLENGE_REMINDER_MIN_HOUR = 19;
export const CHALLENGE_REMINDER_MAX_HOUR = 21;
/** Días desde el inicio del reto durante los que se avisa (el inicio es el día 0). */
export const CHALLENGE_REMINDER_MAX_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Lógica pura (testeable) ─────────────────────────────────────────────────

/** Días entre dos 'YYYY-MM-DD' (a - b), sin depender de la zona horaria. */
function diffDays(a: string, b: string): number {
  const toN = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  };
  return toN(a) - toN(b);
}

/** `challenge_participants` con el reto expandido, ya normalizado. */
export interface ReminderCandidate {
  userId: string;
  challengeId: string;
  presetKey: string;
  title: string;
  metric: string;
  exerciseSlug: string;
  startsAt: string;
  endsAt: string;
  goal: number;
}

/**
 * ¿Entra `todayLocal` en el periodo de avisos de este reto? Dentro de las fechas
 * del reto Y en los primeros CHALLENGE_REMINDER_MAX_DAYS días desde el inicio.
 */
export function isWithinReminderPeriod(c: Pick<ReminderCandidate, "startsAt" | "endsAt">, todayLocal: string): boolean {
  const start = c.startsAt.slice(0, 10);
  const end = c.endsAt.slice(0, 10);
  if (todayLocal < start || todayLocal > end) return false;
  return diffDays(todayLocal, start) < CHALLENGE_REMINDER_MAX_DAYS;
}

export type SkipReason =
  | "outside_hours"
  | "outside_period"
  | "trained_today"
  | "completed"
  | "already_sent_today"
  | "inactivity_sent_today";

/**
 * Decide si toca avisar. Todo lo que necesita ya viene resuelto (hora local,
 * último entreno, puntuación, marcas), así que es puro.
 */
export function evaluateChallengeReminder(input: {
  candidate: Pick<ReminderCandidate, "startsAt" | "endsAt" | "goal">;
  now: Date;
  timeZone: string;
  /** `user_stats.last_workout_date` ('YYYY-MM-DD' local) o null. */
  lastWorkoutDate: string | null;
  score: number;
  /** Marcas de `challenge_reminder` + familia `inactivity_*` de este usuario. */
  sent: ReadonlyArray<{ type: string; sentAt: Date }>;
}): { send: true } | { send: false; reason: SkipReason } {
  const tz = safeTimeZone(input.timeZone);
  const local = localParts(input.now, tz);

  if (local.hour < CHALLENGE_REMINDER_MIN_HOUR || local.hour >= CHALLENGE_REMINDER_MAX_HOUR) {
    return { send: false, reason: "outside_hours" };
  }
  if (!isWithinReminderPeriod(input.candidate, local.dateKey)) {
    return { send: false, reason: "outside_period" };
  }
  if (input.lastWorkoutDate === local.dateKey) return { send: false, reason: "trained_today" };
  if (input.candidate.goal > 0 && input.score >= input.candidate.goal) {
    return { send: false, reason: "completed" };
  }

  const today = input.sent.filter((s) => localParts(s.sentAt, tz).dateKey === local.dateKey);
  if (today.some((s) => s.type === CHALLENGE_REMINDER_TYPE)) {
    return { send: false, reason: "already_sent_today" };
  }
  if (today.some((s) => INACTIVITY_FAMILY.includes(s.type))) {
    return { send: false, reason: "inactivity_sent_today" };
  }
  return { send: true };
}

/** Copy bilingüe por reto. `score`/`goal` solo se usan donde dan información. */
export function buildChallengeReminderCopy(
  presetKey: string,
  score: number,
  goal: number,
): { title: LocalizedText; body: LocalizedText } {
  const done = Math.max(0, Math.round(score));
  switch (presetKey) {
    case "first_pullup":
      return {
        title: { es: "Tu primera dominada te espera", en: "Your first pull-up is waiting" },
        body: {
          es: "Hoy toca practicar: unas series con barra o con goma te acercan.",
          en: "Practice today: a few sets on the bar or with a band get you closer.",
        },
      };
    case "pushup_builder":
      return {
        title: { es: "Reto de push-ups", en: "Push-up challenge" },
        body: {
          es: `Llevas ${done}/${goal} push-ups. Unas series hoy y sigues en camino.`,
          en: `You're at ${done}/${goal} push-ups. A few sets today keep you on track.`,
        },
      };
    default:
      return {
        title: { es: "Tu reto de hoy", en: "Today's challenge" },
        body: {
          es: "Todavía no has entrenado hoy. Una sesión corta y sigues en el reto.",
          en: "You haven't trained yet today. A short session keeps you in the challenge.",
        },
      };
  }
}

export function challengeReminderCampaign(presetKey: string): string {
  return `${CHALLENGE_REMINDER_TYPE}_${presetKey}`;
}

// ─── Acceso a datos ──────────────────────────────────────────────────────────

/** Participantes de retos de catálogo ACTIVOS, con el reto expandido. */
export async function loadReminderCandidates(pb: any): Promise<ReminderCandidate[]> {
  const rows = await pb.collection("challenge_participants").getFullList({
    filter: 'challenge.status = "active" && challenge.preset_key != ""',
    expand: "challenge",
  });
  const out: ReminderCandidate[] = [];
  for (const r of rows) {
    const ch = r.expand?.challenge;
    if (!ch || !ch.preset_key) continue;
    out.push({
      userId: r.user,
      challengeId: ch.id,
      presetKey: ch.preset_key,
      title: ch.title ?? "",
      metric: ch.metric ?? "",
      exerciseSlug: ch.exercise_slug ?? "",
      startsAt: String(ch.starts_at ?? ""),
      endsAt: String(ch.ends_at ?? ""),
      goal: Number(ch.goal) || 0,
    });
  }
  return out;
}

/**
 * ¿Permite el usuario este push? Modelo opt-out: sin registro → sí; solo un
 * `false` explícito en el interruptor maestro O en la categoría `challenges`
 * suprime. (`pushAllowed` de reminder-dispatcher solo mira el maestro.)
 */
export async function challengePushAllowed(pb: any, userId: string): Promise<boolean> {
  try {
    const recs = await pb.collection("notification_prefs").getList(1, 1, {
      filter: pb.filter("user = {:uid}", { uid: userId }),
    });
    const rec = recs.items[0] as any;
    if (!rec) return true;
    return rec.push_enabled !== false && rec.challenges !== false;
  } catch {
    return true;
  }
}

async function loadLastWorkoutDate(pb: any, userId: string): Promise<string | null> {
  const res = await pb.collection("user_stats").getList(1, 1, {
    filter: pb.filter("user = {:uid}", { uid: userId }),
    fields: "last_workout_date",
  });
  const d = (res.items[0] as any)?.last_workout_date;
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
}

/** Marcas recientes (48 h bastan para cubrir «hoy» en cualquier huso). */
async function loadRecentMarks(pb: any, userId: string, now: Date) {
  const types = [CHALLENGE_REMINDER_TYPE, ...INACTIVITY_FAMILY];
  const params: Record<string, string> = {
    uid: userId,
    since: new Date(now.getTime() - 2 * DAY_MS).toISOString().replace("T", " "),
  };
  types.forEach((k, i) => { params[`k${i}`] = k; });
  const rows = await pb.collection("notifications").getFullList({
    filter: pb.filter(
      `user = {:uid} && created >= {:since} && (${types.map((_, i) => `type = {:k${i}}`).join(" || ")})`,
      params,
    ),
    fields: "type,created",
  });
  return rows.map((r: any) => ({ type: String(r.type), sentAt: new Date(String(r.created).replace(" ", "T")) }));
}

// ─── Despacho ────────────────────────────────────────────────────────────────

export interface ChallengeReminderResult {
  candidates: number;
  sent: number;
  skipped: number;
  errors: number;
}

export async function dispatchChallengeReminders(
  pb: any,
  now: Date = new Date(),
): Promise<ChallengeReminderResult> {
  const result: ChallengeReminderResult = { candidates: 0, sent: 0, skipped: 0, errors: 0 };

  let candidates: ReminderCandidate[];
  try {
    candidates = await loadReminderCandidates(pb);
  } catch (err) {
    console.error("[challenge-reminder] error cargando candidatos:", err);
    result.errors++;
    return result;
  }
  result.candidates = candidates.length;
  if (candidates.length === 0) return result;

  const userIds = [...new Set(candidates.map((c) => c.userId))];
  const timezones = await loadTimezones(pb, userIds);
  const handled = new Set<string>(); // un aviso por usuario y tick

  for (const c of candidates) {
    if (handled.has(c.userId)) {
      result.skipped++;
      continue;
    }
    try {
      const tz = timezones.get(c.userId) ?? "UTC";
      const local = localParts(now, tz);
      // Filtro barato primero (hora y periodo) para no leer BD de quien no toca.
      if (
        local.hour < CHALLENGE_REMINDER_MIN_HOUR ||
        local.hour >= CHALLENGE_REMINDER_MAX_HOUR ||
        !isWithinReminderPeriod(c, local.dateKey)
      ) {
        result.skipped++;
        continue;
      }
      if (!(await challengePushAllowed(pb, c.userId))) {
        result.skipped++;
        continue;
      }

      const lastWorkoutDate = await loadLastWorkoutDate(pb, c.userId);
      const scorable: ScorableChallenge = {
        id: c.challengeId,
        metric: c.metric,
        exercise_slug: c.exerciseSlug,
        starts_at: c.startsAt,
        ends_at: c.endsAt,
      };
      const score = await scoreParticipant(pb, c.userId, scorable, tz);
      // Sin historial no se puede garantizar el tope diario: `loadRecentMarks`
      // lanza y el usuario cae en el catch (mejor no enviar que duplicar).
      const sent = await loadRecentMarks(pb, c.userId, now);

      const verdict = evaluateChallengeReminder({
        candidate: c,
        now,
        timeZone: tz,
        lastWorkoutDate,
        score,
        sent,
      });
      if (!verdict.send) {
        result.skipped++;
        continue;
      }

      const language = normalizePushLanguage(
        (await pb.collection("users").getOne(c.userId, { fields: "language" }).catch(() => null))?.language,
      );
      const { title, body } = buildChallengeReminderCopy(c.presetKey, score, c.goal);
      const campaign = challengeReminderCampaign(c.presetKey);

      // Marca de dedupe ANTES de enviar (mismo trade-off que #695/#807).
      try {
        await pb.collection("notifications").create({
          user: c.userId,
          type: CHALLENGE_REMINDER_TYPE,
          actor: c.userId,
          reference_id: c.challengeId,
          reference_type: "challenge",
          read: false,
          data: { url: "/workout", campaign, challengeTitle: c.title, presetKey: c.presetKey },
        });
      } catch (err) {
        console.error(`[challenge-reminder] error creando marca de dedupe para ${c.userId}:`, err);
        result.errors++;
        continue;
      }
      handled.add(c.userId);

      await sendPushToUser(c.userId, { title, body, url: "/workout", campaign, language });
      result.sent++;
    } catch (err) {
      console.error(`[challenge-reminder] error procesando ${c.userId}/${c.challengeId}:`, err);
      result.errors++;
    }
  }

  return result;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/** Tick cada 15 minutos (ventana de 2 h). REQUIERE una sola instancia del API. */
export function startChallengeReminderScheduler(intervalMs = 15 * 60_000): void {
  if (timer) return;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const pb = await getAdminPB();
      const res = await dispatchChallengeReminders(pb);
      if (res.sent > 0 || res.errors > 0) {
        console.error(
          `[challenge-reminder] candidatos=${res.candidates} enviados=${res.sent} saltados=${res.skipped} errores=${res.errors}`,
        );
      }
    } catch (err) {
      console.error("[challenge-reminder] tick falló:", err);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  if (typeof timer === "object" && timer && "unref" in timer) {
    (timer as any).unref();
  }
  void tick();
  console.error("[challenge-reminder] scheduler arrancado (tick de 15min)");
}

export function stopChallengeReminderScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
