/**
 * email-dispatcher.ts
 *
 * Canal de email mínimo (#810): bienvenida al registrarse y recuperación a los
 * 3, 10 y 30 días sin entrenar. El email es el único canal que sobrevive a
 * desinstalar la app o a apagar los push.
 *
 * POR QUÉ AQUÍ Y NO EN pb_hooks: igual que los dispatchers de push — es un
 * tick sobre el paso del tiempo, no una reacción a una escritura, y necesita
 * la hora LOCAL del usuario (`Intl`), que goja no trae. Hasta la bienvenida va
 * por tick: así un fallo de Resend no rompe el registro.
 *
 * PROVEEDOR: Resend por su API HTTP (`fetch`, sin SDK). Todo queda APAGADO
 * mientras falten `RESEND_API_KEY` o `EMAIL_UNSUBSCRIBE_SECRET`.
 *
 * Reglas:
 *   - Bienvenida (`email_welcome`): una vez en la vida, entre 10 min y 48 h
 *     después del alta. Los 10 minutos dan tiempo a que la app guarde
 *     `users.language`. Solo cuentas creadas tras el despliegue: no se manda
 *     una bienvenida atrasada a toda la base.
 *   - Recuperación, con las mismas dos poblaciones que #807 (`never_trained`
 *     desde `users.created`; `trained_then_stopped` desde
 *     `user_stats.last_workout_date`). Una vez por episodio:
 *       [3, 10) → `email_recovery_3d` · [10, 30) → `email_recovery_10d` ·
 *       [30, 45) → `email_recovery_30d` · ≥ 45 → nada.
 *   - Como mucho UN email al día local por usuario, y NINGUNO el día local en
 *     que ya salió un push de la familia de inactividad. Para que el push gane
 *     de forma natural, los emails salen en la franja [12, 20) local y los
 *     push desde las 9: el día 3 el push de 72 h llega primero y el email de
 *     3 días se aplaza al día siguiente. Así nunca coinciden email y push con
 *     el mismo mensaje el mismo día.
 *   - Respeta `users.email_opt_out` y no escribe a direcciones de prueba.
 *   - Tope global diario (`EMAIL_DAILY_CAP`, 90 por defecto) por debajo de los
 *     100/día del plan gratis de Resend.
 *
 * Dedupe: una fila en `email_log` que se guarda ANTES de enviar (mismo
 * trade-off que los push: mejor perder un envío que duplicarlo).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAdminPB } from "./admin-pb.js";
import { normalizePushLanguage, pickLocalized, type LocalizedText, type PushLanguage } from "./push-sender.js";
import { localParts, safeTimeZone } from "./reminder-dispatcher.js";
import { hasAnySession } from "./inactivity-dispatcher.js";
import { INACTIVITY_FAMILY, diffLocalDays, type ReactivationSegment, type SentMark } from "./reactivation-dispatcher.js";

// ─── Configuración ───────────────────────────────────────────────────────────

export interface EmailConfig {
  resendApiKey: string;
  from: string;
  replyTo?: string;
  unsubscribeSecret: string;
  /** Base pública del AI API, para el enlace de baja. */
  publicApiUrl: string;
  /** Base pública de la web, para los CTA. */
  webUrl: string;
  dailyCap: number;
}

/** Config desde el entorno, o `null` si el canal está apagado. */
export function readEmailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig | null {
  if (!env.RESEND_API_KEY || !env.EMAIL_UNSUBSCRIBE_SECRET) return null;
  return {
    resendApiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM || "Calistenia <hola@gym.guille.tech>",
    replyTo: env.EMAIL_REPLY_TO || undefined,
    unsubscribeSecret: env.EMAIL_UNSUBSCRIBE_SECRET,
    publicApiUrl: (env.EMAIL_PUBLIC_API_URL || "https://gym-server.guille.tech").replace(/\/$/, ""),
    webUrl: (env.EMAIL_WEB_URL || "https://gym.guille.tech").replace(/\/$/, ""),
    dailyCap: Math.max(1, parseInt(env.EMAIL_DAILY_CAP ?? "90", 10) || 90),
  };
}

// ─── Tipos y constantes ──────────────────────────────────────────────────────

export type EmailKind = "email_welcome" | "email_recovery_3d" | "email_recovery_10d" | "email_recovery_30d";

export const EMAIL_MIN_HOUR = 12;
export const EMAIL_MAX_HOUR = 20;
export const EMAIL_RECOVERY_MAX_DAYS = 45;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WELCOME_MIN_MS = 10 * MINUTE_MS;
const WELCOME_MAX_MS = 2 * DAY_MS;

export interface EmailLogMark {
  kind: string;
  sentAt: Date;
}

// ─── Lógica pura (testeable) ─────────────────────────────────────────────────

/** Direcciones que nunca deben recibir nada (cuentas de prueba y dominios reservados). */
export function isSendableAddress(email: string | null | undefined): boolean {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const domain = email.split("@")[1].toLowerCase();
  return !/(^|\.)(test|local|localhost|invalid|example)$/.test(domain) && !/^example\.(com|org|net)$/.test(domain);
}

/**
 * ¿Qué email toca ahora a este usuario? La bienvenida gana a la recuperación.
 *
 * @param inactivity días sin entrenar y ancla del episodio, o `null` si no
 *   aplica (p. ej. entrenó hace nada).
 * @param emailLog envíos previos a este usuario.
 * @param pushMarks push de la familia de inactividad ya enviados (#695/#807).
 */
export function evaluateEmail(input: {
  created: Date;
  inactivity: { inactiveDays: number; episodeStart: Date } | null;
  now: Date;
  timeZone: string;
  emailLog: readonly EmailLogMark[];
  pushMarks: readonly SentMark[];
}): EmailKind | null {
  const { created, inactivity, now, emailLog, pushMarks } = input;
  const tz = safeTimeZone(input.timeZone);
  const local = localParts(now, tz);
  if (local.hour < EMAIL_MIN_HOUR || local.hour >= EMAIL_MAX_HOUR) return null;

  const sameLocalDay = (d: Date) => localParts(d, tz).dateKey === local.dateKey;
  if (emailLog.some((m) => sameLocalDay(m.sentAt))) return null;
  if (pushMarks.some((m) => INACTIVITY_FAMILY.includes(m.type) && sameLocalDay(m.sentAt))) return null;

  const age = now.getTime() - created.getTime();
  if (age >= WELCOME_MIN_MS && age < WELCOME_MAX_MS && !emailLog.some((m) => m.kind === "email_welcome")) {
    return "email_welcome";
  }

  if (!inactivity) return null;
  const { inactiveDays, episodeStart } = inactivity;
  const kind: EmailKind | null =
    inactiveDays < 3 ? null
    : inactiveDays < 10 ? "email_recovery_3d"
    : inactiveDays < 30 ? "email_recovery_10d"
    : inactiveDays < EMAIL_RECOVERY_MAX_DAYS ? "email_recovery_30d"
    : null;
  if (!kind) return null;
  const sentInEpisode = emailLog.some((m) => m.kind === kind && m.sentAt.getTime() >= episodeStart.getTime());
  return sentInEpisode ? null : kind;
}

/** Campaña estable (`email_welcome`, `email_recovery_3d_never_trained`…) para OpenPanel y Resend. */
export function emailCampaign(kind: EmailKind, segment: ReactivationSegment | null): string {
  return kind === "email_welcome" || !segment ? kind : `${kind}_${segment}`;
}

interface EmailCopy {
  subject: LocalizedText;
  heading: LocalizedText;
  body: LocalizedText;
  cta: LocalizedText;
}

export function buildEmailCopy(kind: EmailKind, segment: ReactivationSegment | null): EmailCopy {
  const stopped = segment === "trained_then_stopped";
  switch (kind) {
    case "email_welcome":
      return {
        subject: { es: "Bienvenido a Calistenia 💪", en: "Welcome to Calistenia 💪" },
        heading: { es: "Ya tienes tu cuenta", en: "Your account is ready" },
        body: {
          es: "El primer paso es el más fácil: un entreno corto, de unos 10 minutos y adaptado a tu nivel. Tu objetivo para esta semana: 3 entrenos en 7 días. Con eso el hábito ya está en marcha.",
          en: "The first step is the easiest: a short workout, about 10 minutes, adapted to your level. Your goal for this week: 3 workouts in 7 days. That's all it takes to get the habit going.",
        },
        cta: { es: "Empezar mi primer entreno", en: "Start my first workout" },
      };
    case "email_recovery_3d":
      return stopped
        ? {
            subject: { es: "Tu próximo entreno está listo", en: "Your next workout is ready" },
            heading: { es: "Mantén el ritmo", en: "Keep the rhythm going" },
            body: {
              es: "Llevas unos días sin entrenar. Una sesión corta hoy mantiene el ritmo que ya has empezado.",
              en: "It's been a few days since your last workout. A short session today keeps the rhythm you've started.",
            },
            cta: { es: "Entrenar ahora", en: "Train now" },
          }
        : {
            subject: { es: "Tu primer entreno sigue esperándote", en: "Your first workout is still waiting" },
            heading: { es: "Solo te falta empezar", en: "All that's left is to start" },
            body: {
              es: "Hace unos días que creaste tu cuenta y aún no has entrenado. No hace falta material ni mucho tiempo: unos 10 minutos bastan para empezar.",
              en: "You created your account a few days ago and haven't trained yet. You don't need equipment or much time: about 10 minutes is enough to start.",
            },
            cta: { es: "Hacer mi primer entreno", en: "Do my first workout" },
          };
    case "email_recovery_10d":
      return stopped
        ? {
            subject: { es: "Lo que has ganado sigue ahí", en: "What you've built is still there" },
            heading: { es: "Diez días no borran tu progreso", en: "Ten days don't erase your progress" },
            body: {
              es: "Vuelve con una sesión suave y retoma el ritmo. La app te guía desde donde lo dejaste.",
              en: "Come back with an easy session and pick up the rhythm again. The app guides you from where you left off.",
            },
            cta: { es: "Volver a entrenar", en: "Get back to training" },
          }
        : {
            subject: { es: "Aún estás a tiempo de empezar", en: "It's not too late to start" },
            heading: { es: "Empieza esta semana", en: "Start this week" },
            body: {
              es: "Elige un día de esta semana y haz tu primer entreno. La app se adapta a tu nivel, empieces desde donde empieces.",
              en: "Pick a day this week and do your first workout. The app adapts to your level, wherever you're starting from.",
            },
            cta: { es: "Elegir mi entreno", en: "Pick my workout" },
          };
    case "email_recovery_30d":
      return stopped
        ? {
            subject: { es: "Un mes después, empieza de nuevo", en: "A month later, start again" },
            heading: { es: "Volver cuesta menos de lo que parece", en: "Coming back is easier than it looks" },
            body: {
              es: "Empieza con una sesión corta: lo pasado no cuenta, cuenta el entreno de hoy.",
              en: "Start with a short session: the past doesn't count, today's workout does.",
            },
            cta: { es: "Empezar de nuevo", en: "Start again" },
          }
        : {
            subject: { es: "¿Lo intentamos otra vez?", en: "Shall we try again?" },
            heading: { es: "Hace un mes que te registraste", en: "It's been a month since you signed up" },
            body: {
              es: "Si lo que te frenó fue el tiempo, prueba con un entreno de 10 minutos. Si ya no te interesa, puedes darte de baja con el enlace de abajo y no te escribiremos más.",
              en: "If time was what held you back, try a 10-minute workout. If you're no longer interested, you can unsubscribe with the link below and we won't write again.",
            },
            cta: { es: "Probar 10 minutos", en: "Try 10 minutes" },
          };
  }
}

const FOOTER: LocalizedText = {
  es: "Recibes este email porque tienes una cuenta en Calistenia.",
  en: "You're receiving this email because you have a Calistenia account.",
};
const UNSUBSCRIBE_LABEL: LocalizedText = { es: "Darme de baja", en: "Unsubscribe" };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Asunto, HTML y texto plano en el idioma del usuario. */
export function renderEmail(
  copy: EmailCopy,
  language: PushLanguage,
  links: { cta: string; unsubscribe: string },
): { subject: string; html: string; text: string } {
  const t = (x: LocalizedText) => pickLocalized(x, language);
  const [heading, body, cta, footer, unsub] = [copy.heading, copy.body, copy.cta, FOOTER, UNSUBSCRIBE_LABEL].map(t);
  const html = `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px 28px">
<tr><td style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#65a30d;font-weight:700;padding-bottom:12px">Calistenia</td></tr>
<tr><td style="font-size:24px;line-height:1.25;font-weight:700;padding-bottom:12px">${escapeHtml(heading)}</td></tr>
<tr><td style="font-size:16px;line-height:1.6;color:#3f3f46;padding-bottom:24px">${escapeHtml(body)}</td></tr>
<tr><td><a href="${escapeHtml(links.cta)}" style="display:inline-block;background:#a3e635;color:#111111;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:8px">${escapeHtml(cta)}</a></td></tr>
</table>
<p style="max-width:520px;font-size:12px;line-height:1.5;color:#71717a;margin:16px auto 0">${escapeHtml(footer)} <a href="${escapeHtml(links.unsubscribe)}" style="color:#71717a">${escapeHtml(unsub)}</a></p>
</td></tr></table>
</body></html>`;
  const text = `${heading}\n\n${body}\n\n${cta}: ${links.cta}\n\n—\n${footer}\n${unsub}: ${links.unsubscribe}\n`;
  return { subject: t(copy.subject), html, text };
}

// ─── Baja (token firmado, sin sesión) ────────────────────────────────────────

export function unsubscribeToken(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`unsubscribe:${userId}`).digest("base64url");
}

export function verifyUnsubscribeToken(userId: string, token: string, secret: string): boolean {
  if (!userId || !token) return false;
  const expected = Buffer.from(unsubscribeToken(userId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(cfg: EmailConfig, userId: string): string {
  const u = encodeURIComponent(userId);
  return `${cfg.publicApiUrl}/api/email/unsubscribe?u=${u}&t=${unsubscribeToken(userId, cfg.unsubscribeSecret)}`;
}

export function ctaUrl(cfg: EmailConfig, campaign: string): string {
  const q = new URLSearchParams({ utm_source: "email", utm_medium: "email", utm_campaign: campaign });
  return `${cfg.webUrl}/workout?${q.toString()}`;
}

// ─── Envío (Resend) ──────────────────────────────────────────────────────────

export async function sendResendEmail(
  cfg: EmailConfig,
  msg: { to: string; subject: string; html: string; text: string; unsubscribe: string; campaign: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
      // Baja en un clic (RFC 8058): Gmail y Yahoo la exigen a quien envía en volumen.
      headers: {
        "List-Unsubscribe": `<${msg.unsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [{ name: "campaign", value: msg.campaign }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
  }
}

// ─── Acceso a datos ──────────────────────────────────────────────────────────

export interface EmailCandidate {
  userId: string;
  email: string;
  created: string;
  timezone?: string;
  language?: string;
  /** Solo si entrenó alguna vez: 'YYYY-MM-DD' local de `user_stats`. */
  lastWorkoutDate?: string;
}

function pbDateTime(d: Date): string {
  return d.toISOString().replace("T", " ");
}

const USER_FIELDS = "id,email,created,timezone,language,email_opt_out";

/**
 * Candidatos: altas de los últimos 45 días (bienvenida y «nunca entrenó») y
 * cualquiera cuyo último entreno fue hace entre 2 y 46 días («entrenó y
 * paró»). Fuera quien se dio de baja o no tiene una dirección útil.
 */
export async function loadEmailCandidates(pb: any, now: Date): Promise<EmailCandidate[]> {
  const byId = new Map<string, EmailCandidate>();
  const keep = (u: any) => u && !u.email_opt_out && isSendableAddress(u.email);

  const stats = await pb.collection("user_stats").getFullList({
    filter: pb.filter("last_workout_date >= {:from} && last_workout_date <= {:to}", {
      from: new Date(now.getTime() - (EMAIL_RECOVERY_MAX_DAYS + 1) * DAY_MS).toISOString().slice(0, 10),
      to: new Date(now.getTime() - 2 * DAY_MS).toISOString().slice(0, 10),
    }),
    expand: "user",
    fields: `user,last_workout_date,${USER_FIELDS.split(",").map((f) => `expand.user.${f}`).join(",")}`,
  });
  for (const r of stats) {
    const u = r.expand?.user;
    if (!keep(u) || !/^\d{4}-\d{2}-\d{2}$/.test(r.last_workout_date ?? "")) continue;
    byId.set(u.id, {
      userId: u.id, email: u.email, created: u.created, timezone: u.timezone, language: u.language,
      lastWorkoutDate: r.last_workout_date,
    });
  }

  const users = await pb.collection("users").getFullList({
    filter: pb.filter("created >= {:from}", { from: pbDateTime(new Date(now.getTime() - EMAIL_RECOVERY_MAX_DAYS * DAY_MS)) }),
    fields: USER_FIELDS,
  });
  for (const u of users) {
    if (!keep(u) || byId.has(u.id)) continue;
    byId.set(u.id, { userId: u.id, email: u.email, created: u.created, timezone: u.timezone, language: u.language });
  }
  return [...byId.values()];
}

async function loadEmailLog(pb: any, userId: string): Promise<EmailLogMark[]> {
  const rows = await pb.collection("email_log").getFullList({
    filter: pb.filter("user = {:uid}", { uid: userId }),
    fields: "kind,created",
  });
  return rows.map((r: any) => ({ kind: r.kind, sentAt: new Date(String(r.created).replace(" ", "T")) }));
}

async function loadRecentPushMarks(pb: any, userId: string, now: Date): Promise<SentMark[]> {
  const typeFilter = INACTIVITY_FAMILY.map((_, i) => `type = {:k${i}}`).join(" || ");
  const params: Record<string, string> = { uid: userId, since: pbDateTime(new Date(now.getTime() - 2 * DAY_MS)) };
  INACTIVITY_FAMILY.forEach((k, i) => { params[`k${i}`] = k; });
  const rows = await pb.collection("notifications").getFullList({
    filter: pb.filter(`user = {:uid} && created >= {:since} && (${typeFilter})`, params),
    fields: "type,created",
  });
  return rows.map((r: any) => ({ type: r.type, sentAt: new Date(String(r.created).replace(" ", "T")) }));
}

async function countSentLast24h(pb: any, now: Date): Promise<number> {
  const res = await pb.collection("email_log").getList(1, 1, {
    filter: pb.filter("created >= {:since}", { since: pbDateTime(new Date(now.getTime() - DAY_MS)) }),
  });
  return res?.totalItems ?? 0;
}

/** Días sin entrenar + ancla del episodio. `null` si ni siquiera puede calcularse. */
async function inactivityFor(
  pb: any,
  c: EmailCandidate,
  now: Date,
  todayLocal: string,
): Promise<{ inactivity: { inactiveDays: number; episodeStart: Date } | null; segment: ReactivationSegment | null }> {
  if (c.lastWorkoutDate) {
    const [y, m, d] = c.lastWorkoutDate.split("-").map(Number);
    return {
      inactivity: { inactiveDays: diffLocalDays(todayLocal, c.lastWorkoutDate), episodeStart: new Date(Date.UTC(y, m - 1, d + 1)) },
      segment: "trained_then_stopped",
    };
  }
  // Entrenó alguna vez pero no está en la ventana de `user_stats` → o entrenó
  // hace nada, o hace demasiado: no hay recuperación que mandar.
  if (await hasAnySession(pb, c.userId)) return { inactivity: null, segment: null };
  const created = new Date(c.created.replace(" ", "T"));
  return {
    inactivity: { inactiveDays: Math.floor((now.getTime() - created.getTime()) / DAY_MS), episodeStart: created },
    segment: "never_trained",
  };
}

// ─── Despacho ────────────────────────────────────────────────────────────────

export interface EmailDispatchResult {
  candidates: number;
  sent: number;
  skipped: number;
  errors: number;
  capped: boolean;
}

export async function dispatchEmails(
  pb: any,
  cfg: EmailConfig,
  now: Date = new Date(),
  send: typeof sendResendEmail = sendResendEmail,
): Promise<EmailDispatchResult> {
  const result: EmailDispatchResult = { candidates: 0, sent: 0, skipped: 0, errors: 0, capped: false };

  let candidates: EmailCandidate[];
  let sentToday: number;
  try {
    candidates = await loadEmailCandidates(pb, now);
    sentToday = await countSentLast24h(pb, now);
  } catch (err) {
    console.error("[email] error cargando candidatos:", err);
    result.errors++;
    return result;
  }
  result.candidates = candidates.length;

  // Las bienvenidas primero: si el tope aprieta, que no se queden sin ella los recién llegados.
  const createdMs = (c: EmailCandidate) => new Date(c.created.replace(" ", "T")).getTime();
  candidates.sort((a, b) => createdMs(b) - createdMs(a));

  for (const c of candidates) {
    if (sentToday >= cfg.dailyCap) {
      result.capped = true;
      break;
    }
    try {
      const tz = safeTimeZone(c.timezone);
      const local = localParts(now, tz);
      // Barato primero: fuera de la franja no hace falta leer nada más.
      if (local.hour < EMAIL_MIN_HOUR || local.hour >= EMAIL_MAX_HOUR) {
        result.skipped++;
        continue;
      }
      const { inactivity, segment } = await inactivityFor(pb, c, now, local.dateKey);
      const [emailLog, pushMarks] = await Promise.all([loadEmailLog(pb, c.userId), loadRecentPushMarks(pb, c.userId, now)]);
      const kind = evaluateEmail({
        created: new Date(c.created.replace(" ", "T")),
        inactivity,
        now,
        timeZone: tz,
        emailLog,
        pushMarks,
      });
      if (!kind) {
        result.skipped++;
        continue;
      }

      const effectiveSegment = kind === "email_welcome" ? null : segment;
      const campaign = emailCampaign(kind, effectiveSegment);
      const language = normalizePushLanguage(c.language);
      const unsubscribe = unsubscribeUrl(cfg, c.userId);
      const rendered = renderEmail(buildEmailCopy(kind, effectiveSegment), language, {
        cta: ctaUrl(cfg, campaign),
        unsubscribe,
      });

      try {
        await pb.collection("email_log").create({ user: c.userId, kind, campaign });
      } catch (err) {
        console.error(`[email] error creando marca de dedupe para ${c.userId}:`, err);
        result.errors++;
        continue;
      }
      sentToday++;

      await send(cfg, { to: c.email, ...rendered, unsubscribe, campaign });
      result.sent++;
    } catch (err) {
      console.error(`[email] error procesando usuario ${c.userId}:`, err);
      result.errors++;
    }
  }
  return result;
}

/** Marca la baja. Devuelve false si el token no es válido. */
export async function unsubscribeUser(pb: any, cfg: EmailConfig, userId: string, token: string): Promise<boolean> {
  if (!verifyUnsubscribeToken(userId, token, cfg.unsubscribeSecret)) return false;
  await pb.collection("users").update(userId, { email_opt_out: true });
  return true;
}

/** Página mínima que ve quien pulsa el enlace de baja. */
export function unsubscribePage(state: "done" | "invalid" | "error", lang: "es" | "en"): string {
  const copy = {
    done: {
      es: ["Te has dado de baja", "No te enviaremos más emails. Los avisos de la app no cambian: se gestionan en Ajustes."],
      en: ["You've unsubscribed", "We won't send you any more emails. App notifications don't change: manage them in Settings."],
    },
    invalid: {
      es: ["Enlace no válido", "El enlace está incompleto o no es correcto. Prueba a abrirlo de nuevo desde el email."],
      en: ["Invalid link", "The link is incomplete or incorrect. Try opening it again from the email."],
    },
    error: {
      es: ["No hemos podido darte de baja", "Algo ha fallado. Inténtalo de nuevo en unos minutos."],
      en: ["We couldn't unsubscribe you", "Something went wrong. Please try again in a few minutes."],
    },
  }[state][lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy[0])}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f4f5;color:#18181b">
<main style="max-width:480px;margin:64px auto;padding:32px 24px;background:#fff;border-radius:12px">
<h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(copy[0])}</h1>
<p style="font-size:16px;line-height:1.6;color:#3f3f46;margin:0">${escapeHtml(copy[1])}</p>
</main></body></html>`;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Tick cada 15 minutos. No arranca sin configuración de Resend. REQUIERE una
 * sola instancia del API (ver inactivity-dispatcher.ts).
 */
export function startEmailScheduler(intervalMs = 15 * 60_000): void {
  if (timer) return;
  const cfg = readEmailConfig();
  if (!cfg) {
    console.error("[email] canal apagado: faltan RESEND_API_KEY o EMAIL_UNSUBSCRIBE_SECRET");
    return;
  }

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const pb = await getAdminPB();
      const res = await dispatchEmails(pb, cfg);
      if (res.sent > 0 || res.errors > 0 || res.capped) {
        console.error(
          `[email] candidatos=${res.candidates} enviados=${res.sent} saltados=${res.skipped} errores=${res.errors}${res.capped ? " TOPE DIARIO" : ""}`,
        );
      }
    } catch (err) {
      console.error("[email] tick falló:", err);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  if (typeof timer === "object" && timer && "unref" in timer) {
    (timer as any).unref();
  }
  void tick();
  console.error("[email] scheduler arrancado (tick de 15min)");
}

export function stopEmailScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
