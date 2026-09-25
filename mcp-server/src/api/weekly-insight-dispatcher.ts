/**
 * weekly-insight-dispatcher.ts
 *
 * Resumen semanal cruzado (#127) + su idioma (#804): antes lo disparaba
 * `pb_hooks/weekly_insights.pb.js` con `cronAdd("weekly_cross_insight", "0 8 * * 1")`
 * — lunes 08:00 hora del SERVIDOR, para todo el mundo — y una llamada POST por
 * usuario a `/api/cron/generate-cross-insight` (que hacía el trabajo de
 * verdad: contexto, coste, dedup, IA, persistencia y push).
 *
 * POR QUÉ SE MUEVE AQUÍ: igual que `reminder-dispatcher.ts` — convertir a la
 * hora de pared LOCAL del usuario es imposible en goja (el JSVM de
 * PocketBase no trae `Intl`), así que "lunes 08:00" solo se puede decidir bien
 * en Node. El cron de `pb_hooks` se borra y este scheduler ocupa su sitio:
 * sigue habiendo UNA llamada por usuario, pero ahora en su lunes 08:00, no en
 * el del servidor.
 *
 * `generateWeeklyCrossInsightForUser` es la extracción literal del handler de
 * `/api/cron/generate-cross-insight` (mcpuse/api-routes.ts) — la ruta HTTP
 * sigue viva (la llama cualquier otro caller interno) y ahora es un wrapper
 * fino sobre esta función.
 */
import { getAdminPB } from "./admin-pb.js";
import { sendPushToUser, normalizePushLanguage, type PushLanguage } from "./push-sender.js";
import { localParts, safeTimeZone, loadTimezones } from "./reminder-dispatcher.js";
import { buildInsightContextServer } from "./insight-context-server.js";
import { generateCrossInsight } from "./cross-insight-generator.js";
import { resolveTier } from "./model-resolver.js";

export type WeeklyInsightPeriodType = "weekly" | "monthly";

export interface WeeklyInsightResult {
  generated: boolean;
  reason?: "insufficient_data" | "already_exists" | "persist_failed" | "user_not_found";
  headline?: string;
  error?: string;
}

/** Igual que `useCrossInsights.ts` (cliente) — no vale la pena una llamada a la IA con casi nada registrado. */
const MIN_INSIGHT_DAYS = 3;

// ─── Generación (compartida por el endpoint HTTP y el scheduler) ────────────

/**
 * Genera (si toca) el resumen cruzado de un usuario y lo empuja como push.
 * Idempotente: `already_exists` cubre ticks repetidos dentro de la misma hora
 * local sin gastar presupuesto de IA — el scheduler hace el filtro barato de
 * hora ANTES de llamar aquí, pero esta función es segura de llamar de más.
 */
export async function generateWeeklyCrossInsightForUser(
  pb: any,
  userId: string,
  periodType: WeeklyInsightPeriodType = "weekly",
): Promise<WeeklyInsightResult> {
  let user: any;
  try {
    user = await pb.collection("users").getOne(userId);
  } catch (err: any) {
    if (err?.status === 404) return { generated: false, reason: "user_not_found" };
    throw err;
  }

  const tz = user.timezone || "UTC";
  const tier = resolveTier(user);
  const language: PushLanguage = normalizePushLanguage(user.language);
  const days = periodType === "monthly" ? 30 : 7;

  const context = await buildInsightContextServer(pb, userId, tz, days, true);

  // Cost gate: MIN_INSIGHT_DAYS, mirrors packages/core/hooks/useCrossInsights.ts
  // (client-side generation gate) — not worth an AI call on near-empty windows.
  if (context.summary.daysWithAnyData < MIN_INSIGHT_DAYS) {
    return { generated: false, reason: "insufficient_data" };
  }

  // Dedup: skip if an insight for this exact period already exists — the
  // weekly tick shouldn't regenerate (and re-spend AI budget on) the same week.
  const periodStart = `${context.period.start} 00:00:00.000Z`;
  try {
    await pb.collection("user_insights").getFirstListItem(
      pb.filter("user = {:u} && period_type = {:pt} && period_start = {:ps}", {
        u: userId,
        pt: periodType,
        ps: periodStart,
      }),
      { $autoCancel: false },
    );
    return { generated: false, reason: "already_exists" };
  } catch (err: any) {
    if (err?.status !== 404) throw err;
    // 404 = not found = proceed to generate.
  }

  const result = await generateCrossInsight({ context, tier, language });

  try {
    await pb.collection("user_insights").create({
      user: userId,
      period_type: periodType,
      period_start: periodStart,
      payload: result,
    });
  } catch (err: any) {
    console.error("[weekly-insight] persist error:", err?.message ?? err);
    return { generated: false, reason: "persist_failed", error: err?.message ?? String(err) };
  }

  try {
    await sendPushToUser(userId, {
      title: { es: "Tu resumen semanal está listo", en: "Your weekly summary is ready" },
      body: result.headline,
      url: "/",
      // Ya resuelto arriba: nos ahorramos la lectura extra de idioma que
      // haría sendPushToUser si title/body fueran objetos y no le pasáramos esto.
      language,
    });
  } catch (err) {
    console.error("[weekly-insight] push error:", err);
  }

  return { generated: true, headline: result.headline };
}

// ─── Candidatos + filtro de hora local (lógica pura, testeable) ─────────────

/**
 * ¿Es este el momento (hora local del usuario) de generar su resumen semanal?
 * Lunes 08:00, cualquier minuto — el tick de 15min puede caer varias veces
 * dentro de esa hora; `generateWeeklyCrossInsightForUser` ya es idempotente
 * (`already_exists`), así que no hace falta acotar el minuto exacto.
 */
export function isWeeklyInsightSlot(now: Date, timeZone: string): boolean {
  const tz = safeTimeZone(timeZone);
  const parts = localParts(now, tz);
  return parts.weekday === 1 && parts.hour === 8;
}

/**
 * Usuarios "activos" = con al menos un token de push registrado (no hay
 * `last_active` en `users`). Réplica de `pb_hooks/weekly_insights.pb.js`
 * (borrado junto con este scheduler): SIN `sort`, porque ninguna de las dos
 * colecciones tiene campo `created`.
 */
async function loadCandidateUserIds(pb: any): Promise<string[]> {
  const seen = new Set<string>();
  try {
    const expo = await pb.collection("expo_push_tokens").getFullList({ fields: "user" });
    for (const r of expo) if (r.user) seen.add(r.user);
  } catch (err) {
    console.error("[weekly-insight] error listando expo_push_tokens:", err);
  }
  try {
    const web = await pb.collection("push_subscriptions").getFullList({ fields: "user" });
    for (const r of web) if (r.user) seen.add(r.user);
  } catch (err) {
    console.error("[weekly-insight] error listando push_subscriptions:", err);
  }
  return [...seen];
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Arranca el tick del resumen semanal (cada 15min por defecto, igual que
 * `startInactivityScheduler`): suficiente resolución para no perderse la
 * ventana de la hora en punto sin recorrer la tabla de usuarios cada minuto.
 *
 * REQUIERE una sola instancia del API — con varias réplicas, dos ticks podrían
 * generar el mismo resumen a la vez antes de que el primer `create` de
 * `user_insights` (el dedup) llegue a guardarse.
 */
export function startWeeklyInsightScheduler(intervalMs = 15 * 60_000): void {
  if (timer) return;

  const tick = async () => {
    if (running) return; // evita solaparse si un tick se alarga
    running = true;
    try {
      const pb = await getAdminPB();
      const userIds = await loadCandidateUserIds(pb);
      if (userIds.length === 0) return;

      const timezones = await loadTimezones(pb, userIds);
      const now = new Date();

      let generated = 0;
      let errors = 0;
      // Secuencial a propósito: cada resumen es una llamada a la IA, y no hay
      // prisa (la ventana dura una hora local por usuario).
      for (const userId of userIds) {
        const tz = timezones.get(userId) ?? "UTC";
        if (!isWeeklyInsightSlot(now, tz)) continue;
        try {
          const result = await generateWeeklyCrossInsightForUser(pb, userId, "weekly");
          if (result.generated) generated++;
        } catch (err) {
          errors++;
          console.error(`[weekly-insight] error generando para ${userId}:`, err);
        }
      }

      if (generated > 0 || errors > 0) {
        console.error(
          `[weekly-insight] tick: ${generated} generados, ${errors} errores (${userIds.length} candidatos)`,
        );
      }
    } catch (err) {
      console.error("[weekly-insight] tick falló:", err);
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
  console.error("[weekly-insight] scheduler arrancado (tick de 15min)");
}

/** Detiene el scheduler (tests / apagado ordenado). */
export function stopWeeklyInsightScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
