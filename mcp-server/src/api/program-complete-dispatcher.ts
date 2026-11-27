/**
 * program-complete-dispatcher.ts
 *
 * Push «terminaste tu programa, ¿qué sigue?» (#940). Quien acaba un programa y
 * no elige nada se queda con el inicio en «programa terminado»; si en unos días
 * no vuelve, es probable que no vuelva nunca. Este aviso sale UNA vez.
 *
 * Reglas, en el mismo molde que challenge-reminder-dispatcher.ts:
 *   - Candidatas: inscripción actual (`user_programs.is_current = true`) que no
 *     esté abandonada. El cierre a `status: completed` lo hace el cliente al
 *     abrir la app (#941), así que quien no la abre sigue en `active`: el final
 *     se CALCULA igual que en core (`computeProgramProgress`): día de
 *     `started_at` + (duration_weeks + extended_weeks) × 7 − 1.
 *   - Se avisa cuando han pasado entre PROGRAM_NUDGE_MIN_DAYS y
 *     PROGRAM_NUDGE_MAX_DAYS días desde ese final (día local del usuario).
 *   - Hora LOCAL (`users.timezone`), ventana [MIN_HOUR, MAX_HOUR).
 *   - Una vez por inscripción y vuelta: la marca lleva `reference_id` = la
 *     inscripción, y solo cuenta si es posterior al `started_at` actual
 *     («Repetir» (#939) y «Extender» (#938) reabren la misma fila).
 *   - Respeta `notification_prefs`: `push_enabled` y la categoría
 *     `own_milestones` (opt-out: solo un `false` explícito suprime).
 *   - Tope de UN push diario con la familia `inactivity_*` y `challenge_reminder`
 *     (`DAILY_CAP_TYPES`, que ya incluye este tipo: los demás ceden también).
 *   - Dedupe: marca en `notifications` creada ANTES de enviar. Una sola
 *     instancia del API.
 *
 * Copy bilingüe `{es,en}` (#804).
 */
import { getAdminPB } from "./admin-pb.js";
import { sendPushToUser, normalizePushLanguage, type LocalizedText } from "./push-sender.js";
import { localParts, safeTimeZone, loadTimezones } from "./reminder-dispatcher.js";
import { DAILY_CAP_TYPES, PROGRAM_COMPLETE_NUDGE_TYPE } from "./reactivation-dispatcher.js";

export { PROGRAM_COMPLETE_NUDGE_TYPE };

// ─── Constantes ──────────────────────────────────────────────────────────────

export const PROGRAM_NUDGE_MIN_HOUR = 17;
export const PROGRAM_NUDGE_MAX_HOUR = 20;
/** Días después del último día del programa (el día siguiente al final es el 1). */
export const PROGRAM_NUDGE_MIN_DAYS = 3;
/** Pasada esta ventana ya no se insiste: el inicio le ofrece entrenar igualmente. */
export const PROGRAM_NUDGE_MAX_DAYS = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Lógica pura (testeable) ─────────────────────────────────────────────────

const toDayNumber = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
const fromDayNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/**
 * Día de `started_at`. Se escribe con `nowLocalForPB()` (hora de pared, #916),
 * así que el día son los 10 primeros caracteres, como en core.
 */
export function startDayOf(startedAt: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(startedAt ?? "").trim());
  return m ? m[1] : null;
}

/** Último día del programa, o null si no hay inicio o duración. */
export function programEndDay(startedAt: string, durationWeeks: number, extendedWeeks: number): string | null {
  const start = startDayOf(startedAt);
  const base = Number.isFinite(durationWeeks) ? Math.max(0, Math.floor(durationWeeks)) : 0;
  if (!start || base <= 0) return null;
  const extra = Number.isFinite(extendedWeeks) ? Math.max(0, Math.floor(extendedWeeks)) : 0;
  return fromDayNumber(toDayNumber(start) + (base + extra) * 7 - 1);
}

export interface ProgramNudgeCandidate {
  userId: string;
  enrollmentId: string;
  programId: string;
  programName: string;
  startedAt: string;
  durationWeeks: number;
  extendedWeeks: number;
  cycle: number;
}

export type ProgramNudgeSkipReason =
  | "no_end"
  | "outside_hours"
  | "outside_window"
  | "already_sent"
  | "daily_cap";

export function evaluateProgramNudge(input: {
  candidate: Pick<ProgramNudgeCandidate, "startedAt" | "durationWeeks" | "extendedWeeks" | "enrollmentId">;
  now: Date;
  timeZone: string;
  /** Marcas de DAILY_CAP_TYPES de este usuario (incluye las de este aviso). */
  sent: ReadonlyArray<{ type: string; sentAt: Date; referenceId?: string }>;
}): { send: true; daysLate: number } | { send: false; reason: ProgramNudgeSkipReason } {
  const { candidate: c } = input;
  const end = programEndDay(c.startedAt, c.durationWeeks, c.extendedWeeks);
  if (!end) return { send: false, reason: "no_end" };

  const tz = safeTimeZone(input.timeZone);
  const local = localParts(input.now, tz);
  if (local.hour < PROGRAM_NUDGE_MIN_HOUR || local.hour >= PROGRAM_NUDGE_MAX_HOUR) {
    return { send: false, reason: "outside_hours" };
  }

  const daysLate = toDayNumber(local.dateKey) - toDayNumber(end);
  if (daysLate < PROGRAM_NUDGE_MIN_DAYS || daysLate > PROGRAM_NUDGE_MAX_DAYS) {
    return { send: false, reason: "outside_window" };
  }

  // Una vez por vuelta: solo cuenta la marca de ESTA inscripción posterior al
  // inicio actual (repetir/extender reabren la misma fila).
  const start = startDayOf(c.startedAt)!;
  const already = input.sent.some((s) =>
    s.type === PROGRAM_COMPLETE_NUDGE_TYPE
    && s.referenceId === c.enrollmentId
    && localParts(s.sentAt, tz).dateKey >= start,
  );
  if (already) return { send: false, reason: "already_sent" };

  const today = input.sent.filter((s) => localParts(s.sentAt, tz).dateKey === local.dateKey);
  if (today.some((s) => DAILY_CAP_TYPES.includes(s.type))) return { send: false, reason: "daily_cap" };

  return { send: true, daysLate };
}

export function buildProgramNudgeCopy(programName: string): { title: LocalizedText; body: LocalizedText } {
  const name = programName.trim();
  return {
    title: name
      ? { es: `Terminaste ${name}`, en: `You finished ${name}` }
      : { es: "Terminaste tu programa", en: "You finished your program" },
    body: {
      es: "¿Qué sigue? Elige el próximo programa, repítelo o entrena libre hoy.",
      en: "What's next? Pick your next program, repeat it or train freely today.",
    },
  };
}

// ─── Acceso a datos ──────────────────────────────────────────────────────────

export async function loadProgramNudgeCandidates(pb: any): Promise<ProgramNudgeCandidate[]> {
  const rows = await pb.collection("user_programs").getFullList({
    filter: 'is_current = true && status != "abandoned"',
    expand: "program",
    fields: "id,user,program,started_at,extended_weeks,cycle,expand.program.id,expand.program.name,expand.program.duration_weeks",
  });
  const out: ProgramNudgeCandidate[] = [];
  for (const r of rows) {
    const p = r.expand?.program;
    if (!p) continue;
    out.push({
      userId: r.user,
      enrollmentId: r.id,
      programId: p.id ?? r.program,
      programName: String(p.name ?? ""),
      startedAt: String(r.started_at ?? ""),
      durationWeeks: Number(p.duration_weeks) || 0,
      extendedWeeks: Number(r.extended_weeks) || 0,
      cycle: Number(r.cycle) || 0,
    });
  }
  return out;
}

/** Opt-out: sin registro → sí; un `false` en el maestro o en `own_milestones` suprime. */
export async function programNudgeAllowed(pb: any, userId: string): Promise<boolean> {
  try {
    const recs = await pb.collection("notification_prefs").getList(1, 1, {
      filter: pb.filter("user = {:uid}", { uid: userId }),
    });
    const rec = recs.items[0] as any;
    if (!rec) return true;
    return rec.push_enabled !== false && rec.own_milestones !== false;
  } catch {
    return true;
  }
}

/** Marcas del tope diario + las de este aviso desde que empezó la vuelta. */
async function loadMarks(pb: any, userId: string, since: string) {
  const types = [...new Set([...DAILY_CAP_TYPES, PROGRAM_COMPLETE_NUDGE_TYPE])];
  const params: Record<string, string> = { uid: userId, since: `${since} 00:00:00` };
  types.forEach((k, i) => { params[`k${i}`] = k; });
  const rows = await pb.collection("notifications").getFullList({
    filter: pb.filter(
      `user = {:uid} && created >= {:since} && (${types.map((_, i) => `type = {:k${i}}`).join(" || ")})`,
      params,
    ),
    fields: "type,created,reference_id",
  });
  return rows.map((r: any) => ({
    type: String(r.type),
    sentAt: new Date(String(r.created).replace(" ", "T")),
    referenceId: r.reference_id ? String(r.reference_id) : undefined,
  }));
}

// ─── Despacho ────────────────────────────────────────────────────────────────

export interface ProgramNudgeResult {
  candidates: number;
  sent: number;
  skipped: number;
  errors: number;
}

export async function dispatchProgramCompleteNudges(pb: any, now: Date = new Date()): Promise<ProgramNudgeResult> {
  const result: ProgramNudgeResult = { candidates: 0, sent: 0, skipped: 0, errors: 0 };

  let candidates: ProgramNudgeCandidate[];
  try {
    candidates = await loadProgramNudgeCandidates(pb);
  } catch (err) {
    console.error("[program-nudge] error cargando candidatos:", err);
    result.errors++;
    return result;
  }
  result.candidates = candidates.length;
  if (candidates.length === 0) return result;

  const timezones = await loadTimezones(pb, [...new Set(candidates.map((c) => c.userId))]);
  const handled = new Set<string>();

  for (const c of candidates) {
    if (handled.has(c.userId)) { result.skipped++; continue; }
    try {
      const tz = timezones.get(c.userId) ?? "UTC";
      // Filtro barato (sin marcas): hora y ventana de días.
      const cheap = evaluateProgramNudge({ candidate: c, now, timeZone: tz, sent: [] });
      if (!cheap.send) { result.skipped++; continue; }
      if (!(await programNudgeAllowed(pb, c.userId))) { result.skipped++; continue; }

      // Sin historial no se garantiza el «una vez»: si lanza, cae en el catch.
      const sent = await loadMarks(pb, c.userId, startDayOf(c.startedAt)!);
      const verdict = evaluateProgramNudge({ candidate: c, now, timeZone: tz, sent });
      if (!verdict.send) { result.skipped++; continue; }

      const language = normalizePushLanguage(
        (await pb.collection("users").getOne(c.userId, { fields: "language" }).catch(() => null))?.language,
      );
      const { title, body } = buildProgramNudgeCopy(c.programName);
      const campaign = PROGRAM_COMPLETE_NUDGE_TYPE;

      try {
        await pb.collection("notifications").create({
          user: c.userId,
          type: PROGRAM_COMPLETE_NUDGE_TYPE,
          actor: c.userId,
          reference_id: c.enrollmentId,
          reference_type: "user_program",
          read: false,
          data: { url: "/", campaign, program: c.programName, programId: c.programId, cycle: c.cycle, daysLate: verdict.daysLate },
        });
      } catch (err) {
        console.error(`[program-nudge] error creando marca de dedupe para ${c.userId}:`, err);
        result.errors++;
        continue;
      }
      handled.add(c.userId);

      await sendPushToUser(c.userId, { title, body, url: "/", campaign, language });
      result.sent++;
    } catch (err) {
      console.error(`[program-nudge] error procesando ${c.userId}/${c.enrollmentId}:`, err);
      result.errors++;
    }
  }

  return result;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/** Tick cada 15 minutos (ventana de 3 h). REQUIERE una sola instancia del API. */
export function startProgramCompleteScheduler(intervalMs = 15 * 60_000): void {
  if (timer) return;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const pb = await getAdminPB();
      const res = await dispatchProgramCompleteNudges(pb);
      if (res.sent > 0 || res.errors > 0) {
        console.error(
          `[program-nudge] candidatos=${res.candidates} enviados=${res.sent} saltados=${res.skipped} errores=${res.errors}`,
        );
      }
    } catch (err) {
      console.error("[program-nudge] tick falló:", err);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  if (typeof timer === "object" && timer && "unref" in timer) {
    (timer as any).unref();
  }
  void tick();
  console.error("[program-nudge] scheduler arrancado (tick de 15min)");
}

export function stopProgramCompleteScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
