/**
 * reminder-dispatcher.ts
 *
 * Despacha los recordatorios (comidas / entrenamiento / pausa activa) como push.
 *
 * POR QUÉ VIVE AQUÍ Y NO EN pb_hooks:
 * los crons de PocketBase corren en goja, donde **`Intl` no existe**
 * (`Intl.DateTimeFormat` lanza ReferenceError y `toLocaleString` ignora la
 * opción `timeZone`). El cron anterior comparaba `new Date().getHours()` —hora
 * LOCAL DEL SERVIDOR— contra `hour`/`minute`, que el cliente guarda como hora
 * de pared del USUARIO. En un contenedor UTC eso disparaba los recordatorios
 * con horas de desfase, o nunca a la hora configurada.
 *
 * Aquí (Node con ICU completo) sí podemos convertir a la zona horaria de cada
 * usuario (`users.timezone`, migración 1774000070) y decidir correctamente.
 *
 * Idempotencia: cada recordatorio guarda `last_fired_at` (ISO UTC). Solo se
 * dispara si su fecha LOCAL de último disparo es distinta a la fecha local de
 * hoy, así que un tick tardío, un reinicio o una ventana de gracia no producen
 * duplicados.
 */
import { getAdminPB } from "./admin-pb.js";
import { sendPushToUser } from "./push-sender.js";

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Partes de la hora de pared local de un usuario. */
export interface LocalParts {
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
  /** Convención JS: 0=Domingo … 6=Sábado (igual que `daysOfWeek`). */
  weekday: number;
  /** `YYYY-MM-DD` en la zona del usuario — clave de "hoy" para la idempotencia. */
  dateKey: string;
}

export type ReminderKind = "meal" | "workout" | "pause";

/** Forma normalizada de un registro de `meal_reminders` / `workout_reminders`. */
export interface ReminderRow {
  id: string;
  collection: "meal_reminders" | "workout_reminders";
  user: string;
  hour: number;
  minute: number;
  /** Convención JS: 0=Domingo … 6=Sábado. */
  daysOfWeek: number[];
  enabled: boolean;
  kind: ReminderKind;
  /** Solo para `meal`. */
  mealType?: string;
  /** ISO UTC del último envío, o null si nunca se envió. */
  lastFiredAt: string | null;
}

// ─── Lógica pura (testeable) ─────────────────────────────────────────────────

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Valida una zona IANA; cae a UTC si es inválida (p. ej. "Etc/Unknown" de Android). */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/**
 * Convierte un instante a la hora de pared local de una zona IANA.
 * Usa `formatToParts` (no string parsing) para no depender del locale.
 */
export function localParts(now: Date, timeZone: string): LocalParts {
  const tz = safeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  // `hour12: false` puede rendir la medianoche como "24" en algunos entornos ICU.
  const rawHour = parseInt(get("hour"), 10);
  const hour = rawHour === 24 ? 0 : rawHour;

  return {
    hour,
    minute: parseInt(get("minute"), 10),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/**
 * ¿Este recordatorio debe dispararse ahora?
 *
 * @param graceMinutes ventana tras la hora exacta en la que aún se considera
 *   "a tiempo". Cubre ticks tardíos y reinicios sin duplicar: `last_fired_at`
 *   garantiza como mucho un envío por día local.
 */
export function shouldFire(
  reminder: Pick<ReminderRow, "enabled" | "hour" | "minute" | "daysOfWeek" | "lastFiredAt">,
  parts: LocalParts,
  timeZone: string,
  graceMinutes = 5,
): boolean {
  if (!reminder.enabled) return false;
  if (!reminder.daysOfWeek.includes(parts.weekday)) return false;

  const nowMinutes = parts.hour * 60 + parts.minute;
  const dueMinutes = reminder.hour * 60 + reminder.minute;
  const delta = nowMinutes - dueMinutes;
  if (delta < 0 || delta > graceMinutes) return false;

  // Ya enviado hoy (en la fecha local del usuario) → no repetir.
  if (reminder.lastFiredAt) {
    const firedParts = localParts(new Date(reminder.lastFiredAt), timeZone);
    if (firedParts.dateKey === parts.dateKey) return false;
  }

  return true;
}

/** Parse de `days_of_week`: PocketBase puede devolver array real o JSON string. */
export function parseDaysOfWeek(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    const nums = raw.filter((d): d is number => typeof d === "number");
    if (nums.length > 0) return nums;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((d) => typeof d === "number");
    } catch {
      /* formato inesperado → default */
    }
  }
  return [1, 2, 3, 4, 5];
}

/**
 * Cuerpo del push de comida: si hay objetivo diario de calorías se muestra el
 * progreso del día; si no, un recordatorio genérico. Réplica exacta del texto
 * del cron anterior (lo fija `tests/pb_hooks/crons.test.mjs`).
 */
export function mealBody(label: string, todayCalories: number, dailyGoal: number): string {
  if (dailyGoal > 0) {
    return `Llevas ${Math.round(todayCalories)}/${Math.round(dailyGoal)} kcal hoy`;
  }
  return `No olvides registrar tu ${label}`;
}

/** Contexto nutricional del día para construir el push de comida. */
export interface MealContext {
  /** meal_type ya registrados hoy (en la fecha LOCAL del usuario). */
  loggedTypes: Set<string>;
  todayCalories: number;
  dailyGoal: number;
}

/** Contenido del push por tipo de recordatorio. */
export function contentFor(
  reminder: Pick<ReminderRow, "kind" | "mealType">,
  mealCtx?: Pick<MealContext, "todayCalories" | "dailyGoal">,
): { title: string; body: string; url: string } {
  if (reminder.kind === "meal") {
    const label = reminder.mealType || "comida";
    return {
      title: `Hora de registrar tu ${label}`,
      body: mealBody(label, mealCtx?.todayCalories ?? 0, mealCtx?.dailyGoal ?? 0),
      url: "/nutrition",
    };
  }
  if (reminder.kind === "pause") {
    return {
      title: "Pausa activa",
      body: "Levántate, estira y muévete — tu cuerpo lo agradece",
      url: "/workout",
    };
  }
  return {
    title: "¡Hora de entrenar!",
    body: "Tu entrenamiento te espera. ¡No pierdas la racha!",
    url: "/workout",
  };
}

// ─── Acceso a datos ──────────────────────────────────────────────────────────

/** Carga todos los recordatorios habilitados de ambas colecciones, normalizados. */
async function loadEnabledReminders(pb: any): Promise<ReminderRow[]> {
  const rows: ReminderRow[] = [];

  const meals = await pb.collection("meal_reminders").getFullList({
    filter: "enabled = true",
  });
  for (const r of meals) {
    rows.push({
      id: r.id,
      collection: "meal_reminders",
      user: r.user,
      hour: r.hour ?? 0,
      minute: r.minute ?? 0,
      daysOfWeek: parseDaysOfWeek(r.days_of_week),
      enabled: !!r.enabled,
      kind: "meal",
      mealType: r.meal_type,
      lastFiredAt: r.last_fired_at || null,
    });
  }

  const workouts = await pb.collection("workout_reminders").getFullList({
    filter: "enabled = true",
  });
  for (const r of workouts) {
    rows.push({
      id: r.id,
      collection: "workout_reminders",
      user: r.user,
      hour: r.hour ?? 0,
      minute: r.minute ?? 0,
      daysOfWeek: parseDaysOfWeek(r.days_of_week),
      enabled: !!r.enabled,
      kind: r.reminder_type === "pause" ? "pause" : "workout",
      lastFiredAt: r.last_fired_at || null,
    });
  }

  return rows;
}

/** Zona horaria por usuario (una sola consulta para todos los implicados). */
async function loadTimezones(pb: any, userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;

  // PocketBase no acepta filtros gigantes cómodamente: troceamos de 40 en 40.
  const CHUNK = 40;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK);
    const filter = chunk.map((id) => `id = "${id}"`).join(" || ");
    try {
      const users = await pb.collection("users").getFullList({ filter });
      for (const u of users) map.set(u.id, safeTimeZone(u.timezone));
    } catch (err) {
      console.error("[reminders] error cargando timezones:", err);
    }
  }
  return map;
}

/**
 * Contexto nutricional del día de un usuario, en SU fecha local.
 *
 * Sirve para dos cosas que hacía el cron anterior y no se pueden perder:
 *  1. no dar la lata si esa comida ya está registrada hoy;
 *  2. mostrar el progreso de calorías en el cuerpo del push.
 *
 * `dateKey` es la fecha local del usuario (no la del servidor): con el servidor
 * en otra zona, "hoy" podía ser otro día y el skip no coincidía.
 */
async function loadMealContext(pb: any, userId: string, dateKey: string): Promise<MealContext> {
  const ctx: MealContext = { loggedTypes: new Set(), todayCalories: 0, dailyGoal: 0 };

  try {
    const entries = await pb.collection("nutrition_entries").getFullList({
      filter: pb.filter("user = {:uid} && logged_at >= {:from}", {
        uid: userId,
        from: `${dateKey} 00:00:00`,
      }),
    });
    for (const e of entries) {
      if (e.meal_type) ctx.loggedTypes.add(e.meal_type);
      ctx.todayCalories += Number(e.total_calories) || 0;
    }
  } catch (err) {
    console.error("[reminders] error cargando nutrition_entries:", err);
  }

  try {
    const goals = await pb.collection("nutrition_goals").getList(1, 1, {
      filter: pb.filter("user = {:uid}", { uid: userId }),
    });
    ctx.dailyGoal = Number((goals.items[0] as any)?.daily_calories) || 0;
  } catch {
    /* sin objetivos → cuerpo genérico */
  }

  return ctx;
}

/**
 * ¿El usuario permite push? Modelo opt-out igual que `pb_hooks/utils/notifications.js`:
 * sin registro o sin el campo → permitido; solo un `false` explícito suprime.
 *
 * Nota: los recordatorios se rigen por el interruptor maestro `push_enabled`.
 * No existe (todavía) una categoría propia en `notification_prefs`.
 */
async function pushAllowed(pb: any, userId: string): Promise<boolean> {
  try {
    const recs = await pb.collection("notification_prefs").getList(1, 1, {
      filter: pb.filter("user = {:uid}", { uid: userId }),
    });
    const rec = recs.items[0] as any;
    if (!rec) return true;
    return rec.push_enabled !== false;
  } catch {
    return true;
  }
}

// ─── Despacho ────────────────────────────────────────────────────────────────

export interface DispatchResult {
  considered: number;
  fired: number;
  suppressed: number;
  errors: number;
}

/**
 * Evalúa todos los recordatorios habilitados y envía push a los que tocan
 * ahora en la hora local de cada usuario. Idempotente por día local.
 */
export async function dispatchDueReminders(
  now: Date = new Date(),
  graceMinutes = 5,
): Promise<DispatchResult> {
  const result: DispatchResult = { considered: 0, fired: 0, suppressed: 0, errors: 0 };

  let pb: any;
  try {
    pb = await getAdminPB();
  } catch (err) {
    console.error("[reminders] no se pudo autenticar contra PocketBase:", err);
    result.errors++;
    return result;
  }

  let reminders: ReminderRow[];
  try {
    reminders = await loadEnabledReminders(pb);
  } catch (err) {
    console.error("[reminders] error cargando recordatorios:", err);
    result.errors++;
    return result;
  }

  result.considered = reminders.length;
  if (reminders.length === 0) return result;

  const timezones = await loadTimezones(pb, [...new Set(reminders.map((r) => r.user))]);

  // Cache de la hora local por zona — muchos usuarios comparten zona.
  const partsByTz = new Map<string, LocalParts>();
  const allowedByUser = new Map<string, boolean>();
  // Contexto nutricional por usuario+día, cacheado dentro del tick.
  const mealCtxByUser = new Map<string, MealContext>();

  for (const reminder of reminders) {
    const tz = timezones.get(reminder.user) ?? "UTC";
    let parts = partsByTz.get(tz);
    if (!parts) {
      parts = localParts(now, tz);
      partsByTz.set(tz, parts);
    }

    if (!shouldFire(reminder, parts, tz, graceMinutes)) continue;

    // Interruptor maestro de push (cacheado por usuario dentro del tick).
    let allowed = allowedByUser.get(reminder.user);
    if (allowed === undefined) {
      allowed = await pushAllowed(pb, reminder.user);
      allowedByUser.set(reminder.user, allowed);
    }
    if (!allowed) {
      result.suppressed++;
      continue;
    }

    // Comidas: no dar la lata si ya está registrada, y añadir el progreso de
    // calorías. Se calcula sobre la fecha LOCAL del usuario.
    let mealCtx: MealContext | undefined;
    if (reminder.kind === "meal") {
      const cacheKey = `${reminder.user}|${parts.dateKey}`;
      mealCtx = mealCtxByUser.get(cacheKey);
      if (!mealCtx) {
        mealCtx = await loadMealContext(pb, reminder.user, parts.dateKey);
        mealCtxByUser.set(cacheKey, mealCtx);
      }
      if (reminder.mealType && mealCtx.loggedTypes.has(reminder.mealType)) {
        result.suppressed++;
        continue;
      }
    }

    const { title, body, url } = contentFor(reminder, mealCtx);
    try {
      await sendPushToUser(reminder.user, { title, body, url });
      // Marcar ANTES de contar como enviado: si el update falla, el próximo
      // tick lo reintentaría, así que lo registramos como error explícito.
      await pb.collection(reminder.collection).update(reminder.id, {
        last_fired_at: now.toISOString(),
      });
      result.fired++;
    } catch (err) {
      console.error(
        `[reminders] error enviando recordatorio ${reminder.collection}/${reminder.id}:`,
        err,
      );
      result.errors++;
    }
  }

  return result;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Arranca el tick de recordatorios (cada minuto).
 *
 * Sustituye a los crons `push_meal_reminders` / `push_workout_reminders` de
 * `pb_hooks`, que no podían hacer la conversión de zona horaria. Un solo
 * proceso debe ejecutarlo: con varias réplicas del API habría envíos duplicados
 * (el guard `last_fired_at` los reduce, pero no es un lock distribuido).
 */
export function startReminderScheduler(intervalMs = 60_000): void {
  if (timer) return;

  const tick = async () => {
    if (running) return; // evita solaparse si un tick se alarga
    running = true;
    try {
      const res = await dispatchDueReminders();
      if (res.fired > 0 || res.errors > 0) {
        console.error(
          `[reminders] tick: ${res.fired} enviados, ${res.suppressed} suprimidos, ${res.errors} errores (${res.considered} evaluados)`,
        );
      }
    } catch (err) {
      console.error("[reminders] tick falló:", err);
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
  console.error("[reminders] scheduler arrancado (tick de 60s)");
}

/** Detiene el scheduler (tests / apagado ordenado). */
export function stopReminderScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
