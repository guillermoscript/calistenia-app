/**
 * inactivity-dispatcher.ts
 *
 * Push de reactivación a quien se registra y nunca llega a entrenar (#695):
 * un aviso a las 24h y otro a las 72h de crear la cuenta, si para entonces
 * sigue sin tener NINGUNA sesión (normal, circuito o cardio).
 *
 * POR QUÉ VIVE AQUÍ Y NO EN pb_hooks: igual que reminder-dispatcher.ts — hay
 * que convertir `now` a la hora de pared LOCAL del usuario (`users.timezone`)
 * para no mandar el push a las 3 de la madrugada, y goja (el JSVM de
 * PocketBase) no trae `Intl`. `localParts`/`safeTimeZone` viven en
 * reminder-dispatcher.ts y se reutilizan tal cual.
 *
 * POR QUÉ NO PASA POR pb_hooks → POST /api/send-push: ese camino sirve para
 * reaccionar a una ESCRITURA (una sesión, un follow…) dentro del hook que la
 * crea. Aquí no hay escritura que dispare nada — es un candidato que se hace
 * "verdad" con el simple paso del tiempo — así que hace falta un tick
 * periódico, y ese tick necesita la misma conversión de zona horaria que los
 * recordatorios. Envía el push directamente con `sendPushToUser`, sin pasar
 * por el endpoint HTTP interno.
 *
 * Idempotencia: antes de enviar, se guarda una fila en `notifications` con
 * `type: "inactivity_24h" | "inactivity_72h"` (autonotificación, igual que
 * `createSelfNotification` en pb_hooks). Un tick posterior la ve al cargar
 * "ya enviados" y no repite. La marca se guarda ANTES de mandar el push: si
 * el push falla después, se cuenta como error y no se reintenta en el
 * siguiente tick — preferible a arriesgar un duplicado si el fallo real fue
 * en el `create` (ver el mismo trade-off documentado en reminder-dispatcher).
 */
import { getAdminPB } from "./admin-pb.js";
import { sendPushToUser } from "./push-sender.js";
import { localParts, safeTimeZone, pushAllowed } from "./reminder-dispatcher.js";
import { resolveActiveProgramProgress } from "./program-progress-server.js";

// ─── Tipos y constantes ──────────────────────────────────────────────────────

export type InactivityKind = "inactivity_24h" | "inactivity_72h";

/** Ventana horaria local en la que se permite enviar el push (evita despertar a nadie). */
export const INACTIVITY_MIN_HOUR = 9;
export const INACTIVITY_MAX_HOUR = 21;

/** Más allá de esto ya no se manda nada — quien no volvió en una semana necesita otra cosa. */
export const INACTIVITY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY24_MS = 24 * HOUR_MS;
const DAY3_MS = 72 * HOUR_MS;

// ─── Lógica pura (testeable) ─────────────────────────────────────────────────

/**
 * ¿Qué push de inactividad (si alguno) corresponde a este usuario ahora?
 *
 * Reglas de tramo (sobre `elapsed = now - createdAt`):
 *   - < 24h                → null (todavía no toca)
 *   - [24h, 72h)           → "inactivity_24h", salvo que ya se enviara
 *   - [72h, 7 días)        → "inactivity_72h", salvo que ya se enviara
 *     (NUNCA el de 24h con retraso: si el tick se perdió esa ventana, se
 *     salta directo al de 72h en vez de mandar un "empieza ya" tardío)
 *   - >= 7 días             → null (fuera de ventana, no se reactiva más)
 *
 * Y solo dentro de la ventana horaria local [INACTIVITY_MIN_HOUR,
 * INACTIVITY_MAX_HOUR) del usuario — si toca pero es de madrugada, se
 * reintentará en un tick posterior dentro del mismo tramo.
 */
export function evaluateInactivity(input: {
  createdAt: Date;
  now: Date;
  timeZone: string;
  alreadySent: ReadonlySet<InactivityKind>;
}): InactivityKind | null {
  const elapsedMs = input.now.getTime() - input.createdAt.getTime();

  if (elapsedMs < DAY24_MS) return null;
  if (elapsedMs >= INACTIVITY_MAX_AGE_MS) return null;

  const kind: InactivityKind = elapsedMs < DAY3_MS ? "inactivity_24h" : "inactivity_72h";
  if (input.alreadySent.has(kind)) return null;

  const tz = safeTimeZone(input.timeZone);
  const parts = localParts(input.now, tz);
  if (parts.hour < INACTIVITY_MIN_HOUR || parts.hour >= INACTIVITY_MAX_HOUR) return null;

  return kind;
}

/** Copy del push (Spanish, como el resto de pushes del backend). */
export function buildInactivityCopy(
  kind: InactivityKind,
  dayLabel: string | null,
): { title: string; body: string } {
  if (kind === "inactivity_24h") {
    return {
      title: "Tu primer entreno te espera 💪",
      body: dayLabel
        ? `Hoy toca ${dayLabel}. Son unos minutos, empieza ahora.`
        : "Tienes una sesión corta lista. Son unos minutos, empieza ahora.",
    };
  }
  return {
    title: "¿Retomamos? Tu sesión de hoy está lista",
    body: dayLabel
      ? `${dayLabel}. Diez minutos bastan para volver a la rutina.`
      : "Diez minutos bastan para volver a la rutina. Tu programa te espera.",
  };
}

/** `Date` → literal de filtro de PocketBase `YYYY-MM-DD HH:MM:SS.sssZ`. */
function pbDateTime(d: Date): string {
  return d.toISOString().replace("T", " ");
}

// ─── Acceso a datos ──────────────────────────────────────────────────────────

interface InactivityCandidate {
  id: string;
  timezone?: string;
  created: string;
}

/** Candidatos: cuentas creadas entre hace 7 días y hace 24h (ventana de vida útil de la campaña). */
async function loadCandidates(pb: any, now: Date): Promise<InactivityCandidate[]> {
  const from = pbDateTime(new Date(now.getTime() - INACTIVITY_MAX_AGE_MS));
  const to = pbDateTime(new Date(now.getTime() - DAY24_MS));
  return pb.collection("users").getFullList({
    filter: pb.filter("created >= {:from} && created <= {:to}", { from, to }),
    fields: "id,timezone,created",
  });
}

/** ¿Tiene el usuario ALGUNA sesión (de cualquier tipo)? Colección ausente/error → no cuenta. */
async function hasAnySession(pb: any, userId: string): Promise<boolean> {
  const collections = ["sessions", "circuit_sessions", "cardio_sessions"];
  for (const col of collections) {
    try {
      const res = await pb.collection(col).getList(1, 1, {
        filter: pb.filter("user = {:uid}", { uid: userId }),
      });
      if ((res?.items?.length ?? 0) > 0) return true;
    } catch {
      // colección ausente o error de red: no cuenta como sesión, seguimos con las demás
    }
  }
  return false;
}

/** Tipos de push de inactividad ya enviados a este usuario (marca en `notifications`). */
async function loadAlreadySentKinds(pb: any, userId: string): Promise<Set<InactivityKind>> {
  const sent = new Set<InactivityKind>();
  try {
    const rows = await pb.collection("notifications").getFullList({
      filter: pb.filter('user = {:uid} && (type = {:k1} || type = {:k2})', {
        uid: userId,
        k1: "inactivity_24h",
        k2: "inactivity_72h",
      }),
      fields: "type",
    });
    for (const r of rows) {
      if (r.type === "inactivity_24h" || r.type === "inactivity_72h") sent.add(r.type);
    }
  } catch (err) {
    console.error(`[inactivity] error cargando notificaciones previas de ${userId}:`, err);
  }
  return sent;
}

/**
 * Etiqueta "Día: foco" del próximo entreno del programa activo, para el
 * deep-link del push. `null` si no tiene programa activo, si core no puede
 * derivar el próximo día, o si algo falla — el copy genérico cubre ese caso.
 */
async function resolveDayLabel(
  pb: any,
  userId: string,
  tz: string,
  todayLocalDateStr: string,
): Promise<string | null> {
  try {
    const active = await resolveActiveProgramProgress(pb, userId, tz, todayLocalDateStr);
    if (!active || !active.progress.nextDay) return null;
    const wd = active.weekDays.find((w) => w.id === active.progress.nextDay);
    if (!wd) return null;
    return `${wd.name}: ${wd.focus}`;
  } catch (err) {
    console.error(`[inactivity] error resolviendo el próximo día de ${userId}:`, err);
    return null;
  }
}

// ─── Despacho ────────────────────────────────────────────────────────────────

export interface InactivityDispatchResult {
  candidates: number;
  sent: number;
  skipped: number;
  errors: number;
}

/** Evalúa a todos los candidatos y envía el push de inactividad al que toque. */
export async function dispatchInactivityPushes(
  pb: any,
  now: Date = new Date(),
): Promise<InactivityDispatchResult> {
  const result: InactivityDispatchResult = { candidates: 0, sent: 0, skipped: 0, errors: 0 };

  let candidates: InactivityCandidate[];
  try {
    candidates = await loadCandidates(pb, now);
  } catch (err) {
    console.error("[inactivity] error cargando candidatos:", err);
    result.errors++;
    return result;
  }

  result.candidates = candidates.length;

  for (const user of candidates) {
    try {
      if (!(await pushAllowed(pb, user.id))) {
        result.skipped++;
        continue;
      }
      if (await hasAnySession(pb, user.id)) {
        result.skipped++;
        continue;
      }

      const alreadySent = await loadAlreadySentKinds(pb, user.id);
      const tz = safeTimeZone(user.timezone);
      const kind = evaluateInactivity({
        createdAt: new Date(user.created),
        now,
        timeZone: tz,
        alreadySent,
      });
      if (!kind) {
        result.skipped++;
        continue;
      }

      const todayLocalDateStr = localParts(now, tz).dateKey;
      const dayLabel = await resolveDayLabel(pb, user.id, tz, todayLocalDateStr);
      const { title, body } = buildInactivityCopy(kind, dayLabel);

      // Marca de dedupe ANTES de enviar: si el `create` falla, no se envía —
      // mejor perder un envío puntual que arriesgar un duplicado.
      try {
        await pb.collection("notifications").create({
          user: user.id,
          type: kind,
          actor: user.id,
          reference_id: user.id,
          reference_type: "user",
          read: false,
          data: { url: "/workout", campaign: kind },
        });
      } catch (err) {
        console.error(`[inactivity] error creando marca de dedupe para ${user.id}:`, err);
        result.errors++;
        continue;
      }

      await sendPushToUser(user.id, { title, body, url: "/workout", campaign: kind });
      result.sent++;
    } catch (err) {
      console.error(`[inactivity] error procesando usuario ${user.id}:`, err);
      result.errors++;
    }
  }

  return result;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Arranca el tick de inactividad (cada 15 minutos por defecto — no hace falta
 * la resolución de 1 minuto de los recordatorios: la ventana horaria de envío
 * dura 12h y el tramo de 24h/72h dura 48h).
 *
 * REQUIERE una sola instancia del API — con varias réplicas, dos ticks podrían
 * leer "sin marca todavía" a la vez y duplicar el push antes de que el primer
 * `create` de dedupe llegue a guardarse.
 */
export function startInactivityScheduler(intervalMs = 15 * 60_000): void {
  if (timer) return;

  const tick = async () => {
    if (running) return; // evita solaparse si un tick se alarga
    running = true;
    try {
      const pb = await getAdminPB();
      const res = await dispatchInactivityPushes(pb);
      if (res.sent > 0 || res.errors > 0) {
        console.error(
          `[inactivity] candidatos=${res.candidates} enviados=${res.sent} saltados=${res.skipped} errores=${res.errors}`,
        );
      }
    } catch (err) {
      console.error("[inactivity] tick falló:", err);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  // No mantener vivo el proceso solo por este timer.
  if (typeof timer === "object" && timer && "unref" in timer) {
    (timer as any).unref();
  }
  void tick();
  console.error("[inactivity] scheduler arrancado (tick de 15min)");
}

/** Detiene el scheduler (tests / apagado ordenado). */
export function stopInactivityScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
