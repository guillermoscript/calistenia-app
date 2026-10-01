import { describe, it, expect, vi, beforeEach } from "vitest";

const sendPushToUser = vi.fn(async () => {});
vi.mock("./push-sender.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./push-sender.js")>();
  return { ...actual, sendPushToUser: (...args: unknown[]) => sendPushToUser(...(args as [])) };
});

// La puntuación real lee vistas públicas; aquí se fija por usuario.
const scores: Record<string, number> = {};
vi.mock("./challenge-score-server.js", () => ({
  scoreParticipant: async (_pb: unknown, userId: string) => scores[userId] ?? 0,
}));

import {
  buildChallengeReminderCopy,
  challengePushAllowed,
  dispatchChallengeReminders,
  evaluateChallengeReminder,
  isWithinReminderPeriod,
  type ReminderCandidate,
} from "./challenge-reminder-dispatcher.js";
import { evaluateReactivation } from "./reactivation-dispatcher.js";
import { pickLocalized } from "./push-sender.js";

const TZ = "America/Caracas"; // UTC-4 todo el año
// 2026-09-24T23:30:00Z = jueves 19:30 en Caracas, 2026-09-24 local.
const EVENING = new Date("2026-09-24T23:30:00Z");
const NOON = new Date("2026-09-24T16:00:00Z"); // 12:00 locales
const DAY = 24 * 60 * 60 * 1000;

const cand = (over: Partial<ReminderCandidate> = {}) => ({
  startsAt: "2026-09-20",
  endsAt: "2026-10-19",
  goal: 100,
  ...over,
});
const ev = (over: Partial<Parameters<typeof evaluateChallengeReminder>[0]> = {}) =>
  evaluateChallengeReminder({
    candidate: cand(),
    now: EVENING,
    timeZone: TZ,
    lastWorkoutDate: null,
    score: 10,
    sent: [],
    ...over,
  });

describe("evaluateChallengeReminder", () => {
  it("avisa por la tarde si hoy no ha entrenado y el reto sigue en marcha", () => {
    expect(ev()).toEqual({ send: true });
  });

  it("usa la hora local del usuario, no la del servidor", () => {
    // Las 23:30Z son las 19:30 en Caracas (dentro) pero las 08:30 en Madrid+... fuera.
    expect(ev({ now: EVENING, timeZone: TZ })).toEqual({ send: true });
    expect(ev({ now: EVENING, timeZone: "Asia/Tokyo" })).toEqual({ send: false, reason: "outside_hours" }); // 08:30
    expect(ev({ now: NOON, timeZone: TZ })).toEqual({ send: false, reason: "outside_hours" });
    // 21:00 en punto ya queda fuera de la ventana [19, 21).
    expect(ev({ now: new Date("2026-09-25T01:00:00Z") })).toEqual({ send: false, reason: "outside_hours" });
  });

  it("zona inválida cae a UTC (23:30 UTC está fuera de ventana)", () => {
    expect(ev({ timeZone: "Etc/Unknown" })).toEqual({ send: false, reason: "outside_hours" });
  });

  it("no avisa si ya entrenó hoy en SU día local", () => {
    expect(ev({ lastWorkoutDate: "2026-09-24" })).toEqual({ send: false, reason: "trained_today" });
    expect(ev({ lastWorkoutDate: "2026-09-23" })).toEqual({ send: true });
  });

  it("no avisa de un reto ya completado", () => {
    expect(ev({ score: 100 })).toEqual({ send: false, reason: "completed" });
    expect(ev({ candidate: cand({ goal: 1 }), score: 1 })).toEqual({ send: false, reason: "completed" });
  });

  it("idempotente: un segundo tick el mismo día local no repite", () => {
    const earlier = new Date(EVENING.getTime() - 15 * 60_000);
    expect(ev({ sent: [{ type: "challenge_reminder", sentAt: earlier }] })).toEqual({
      send: false,
      reason: "already_sent_today",
    });
    // El de AYER no bloquea el de hoy.
    expect(ev({ sent: [{ type: "challenge_reminder", sentAt: new Date(EVENING.getTime() - DAY) }] })).toEqual({
      send: true,
    });
  });

  it("tope diario: cede ante un push de la familia de inactividad de hoy", () => {
    const morning = new Date("2026-09-24T14:00:00Z"); // 10:00 locales
    expect(ev({ sent: [{ type: "inactivity_7d", sentAt: morning }] })).toEqual({
      send: false,
      reason: "inactivity_sent_today",
    });
    expect(ev({ sent: [{ type: "inactivity_7d", sentAt: new Date(morning.getTime() - DAY) }] })).toEqual({
      send: true,
    });
  });

  it("respeta el periodo: fuera de fechas o pasados 30 días desde el inicio", () => {
    expect(ev({ candidate: cand({ startsAt: "2026-09-25", endsAt: "2026-10-24" }) })).toEqual({
      send: false,
      reason: "outside_period",
    });
    expect(ev({ candidate: cand({ startsAt: "2026-08-01", endsAt: "2026-09-23" }) })).toEqual({
      send: false,
      reason: "outside_period",
    });
    // Reto largo (180 días): solo los 30 primeros.
    expect(isWithinReminderPeriod({ startsAt: "2026-09-01", endsAt: "2027-02-28" }, "2026-09-30")).toBe(true);
    expect(isWithinReminderPeriod({ startsAt: "2026-09-01", endsAt: "2027-02-28" }, "2026-10-01")).toBe(false);
  });
});

describe("reactivation respeta el aviso de reto en su tope diario", () => {
  it("un challenge_reminder de hoy bloquea el push de recuperación", () => {
    const base = {
      inactiveDays: 8,
      episodeStart: new Date("2026-09-01T00:00:00Z"),
      now: new Date("2026-09-24T15:00:00Z"), // 11:00 locales
      timeZone: TZ,
    };
    expect(evaluateReactivation({ ...base, sent: [] })).toBe("inactivity_7d");
    expect(
      evaluateReactivation({
        ...base,
        sent: [{ type: "challenge_reminder", sentAt: new Date("2026-09-24T14:00:00Z") }],
      }),
    ).toBeNull();
  });
});

describe("buildChallengeReminderCopy", () => {
  it("es bilingüe y por reto", () => {
    const pull = buildChallengeReminderCopy("first_pullup", 0, 1);
    expect(pickLocalized(pull.title, "es")).toContain("dominada");
    expect(pickLocalized(pull.title, "en")).toContain("pull-up");
    const push = buildChallengeReminderCopy("pushup_builder", 40, 100);
    expect(pickLocalized(push.body, "es")).toContain("40/100");
    expect(pickLocalized(push.body, "en")).toContain("40/100");
    const generic = buildChallengeReminderCopy("consistency_30_day", 3, 12);
    expect(pickLocalized(generic.title, "en")).toBe("Today's challenge");
  });
});

// ─── PocketBase falso ─────────────────────────────────────────────────────────

interface Row { [k: string]: any }

function fakePB(data: {
  participants?: Row[];
  users?: Row[];
  user_stats?: Row[];
  notifications?: Row[];
  notification_prefs?: Row[];
}) {
  const store: Record<string, Row[]> = {
    challenge_participants: data.participants ?? [],
    users: data.users ?? [],
    user_stats: data.user_stats ?? [],
    notifications: data.notifications ?? [],
    notification_prefs: data.notification_prefs ?? [],
  };
  const match = (row: Row, filter: string): boolean => {
    for (const clause of filter.split("&&").map((c) => c.trim().replace(/^\(|\)$/g, ""))) {
      const ok = clause.split("||").map((c) => c.trim()).some((c) => {
        const m = c.match(/^([\w.]+)\s*(>=|<=|=)\s*'([^']*)'$/);
        if (!m) return true;
        const [, field, op, v] = m;
        const val = String(row[field] ?? "");
        if (op === "=") return val === v;
        if (op === ">=") return val !== "" && val >= v;
        return val !== "" && val <= v;
      });
      if (!ok) return false;
    }
    return true;
  };
  const pb = {
    /** Reloj del `created` de las marcas: el de los tests, no el real. */
    clock: EVENING,
    store,
    filter: (expr: string, params: Record<string, string>) =>
      expr.replace(/\{:(\w+)\}/g, (_, k) => `'${params[k]}'`),
    collection: (col: string) => ({
      getFullList: async (opts: any) =>
        store[col].filter((r) => col === "challenge_participants" || match(r, opts?.filter ?? "")),
      getList: async (_p: number, _n: number, opts: any) => ({
        items: store[col].filter((r) => match(r, opts?.filter ?? "")).slice(0, 1),
      }),
      getOne: async (id: string) => {
        const r = store[col].find((x) => x.id === id);
        if (!r) throw new Error("404");
        return r;
      },
      create: async (row: Row) => {
        store[col].push({ ...row, created: pb.clock.toISOString().replace("T", " ") });
        return row;
      },
    }),
  };
  return pb;
}

const participant = (user: string, over: Row = {}, challengeId = `c-${user}`) => ({
  user,
  expand: {
    challenge: {
      id: challengeId,
      title: "Tu primera dominada",
      preset_key: "first_pullup",
      metric: "most_pullups",
      exercise_slug: "",
      starts_at: "2026-09-20",
      ends_at: "2026-10-19",
      goal: 1,
      status: "active",
      ...over,
    },
  },
});

describe("dispatchChallengeReminders", () => {
  beforeEach(() => {
    sendPushToUser.mockClear();
    for (const k of Object.keys(scores)) delete scores[k];
  });

  it("envía el push con la marca, la campaña y el idioma del usuario", async () => {
    const pb = fakePB({
      participants: [participant("u1")],
      users: [{ id: "u1", timezone: TZ, language: "en" }],
    });
    const res = await dispatchChallengeReminders(pb, EVENING);
    expect(res).toMatchObject({ candidates: 1, sent: 1, errors: 0 });
    expect(pb.store.notifications).toHaveLength(1);
    expect(pb.store.notifications[0]).toMatchObject({
      user: "u1",
      type: "challenge_reminder",
      reference_id: "c-u1",
      reference_type: "challenge",
      data: { campaign: "challenge_reminder_first_pullup", presetKey: "first_pullup" },
    });
    const [uid, payload] = sendPushToUser.mock.calls[0] as unknown as [string, any];
    expect(uid).toBe("u1");
    expect(payload).toMatchObject({ language: "en", url: "/workout", campaign: "challenge_reminder_first_pullup" });
  });

  it("idempotente: dos ticks el mismo día local mandan UN solo push", async () => {
    const pb = fakePB({
      participants: [participant("u1")],
      users: [{ id: "u1", timezone: TZ }],
    });
    await dispatchChallengeReminders(pb, EVENING);
    const later = new Date(EVENING.getTime() + 15 * 60_000);
    pb.clock = later;
    const second = await dispatchChallengeReminders(pb, later);
    expect(second.sent).toBe(0);
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
  });

  it("zona horaria: a las 23:30Z solo avisa a quien allí son las 19:30", async () => {
    const pb = fakePB({
      participants: [participant("caracas"), participant("tokio")],
      users: [
        { id: "caracas", timezone: TZ },
        { id: "tokio", timezone: "Asia/Tokyo" },
      ],
    });
    const res = await dispatchChallengeReminders(pb, EVENING);
    expect(res.sent).toBe(1);
    expect((sendPushToUser.mock.calls[0] as unknown as [string])[0]).toBe("caracas");
  });

  it("respeta notification_prefs: categoría challenges en false y push_enabled en false", async () => {
    const pb = fakePB({
      participants: [participant("a"), participant("b"), participant("c")],
      users: ["a", "b", "c"].map((id) => ({ id, timezone: TZ })),
      notification_prefs: [
        { user: "a", push_enabled: true, challenges: false },
        { user: "b", push_enabled: false, challenges: true },
        // c: sin registro → permitido (opt-out)
      ],
    });
    const res = await dispatchChallengeReminders(pb, EVENING);
    expect(res.sent).toBe(1);
    expect((sendPushToUser.mock.calls[0] as unknown as [string])[0]).toBe("c");
    expect(await challengePushAllowed(pb, "a")).toBe(false);
    expect(await challengePushAllowed(pb, "b")).toBe(false);
    expect(await challengePushAllowed(pb, "c")).toBe(true);
  });

  it("no avisa a quien ya entrenó hoy ni a quien ya completó el reto", async () => {
    scores.done = 1;
    const pb = fakePB({
      participants: [participant("trained"), participant("done")],
      users: ["trained", "done"].map((id) => ({ id, timezone: TZ })),
      user_stats: [{ user: "trained", last_workout_date: "2026-09-24" }],
    });
    const res = await dispatchChallengeReminders(pb, EVENING);
    expect(res.sent).toBe(0);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("cede ante un push de inactividad de hoy (tope de uno al día)", async () => {
    const pb = fakePB({
      participants: [participant("u1")],
      users: [{ id: "u1", timezone: TZ }],
      notifications: [
        { user: "u1", type: "inactivity_7d", created: "2026-09-24 14:00:00.000Z" },
      ],
    });
    const res = await dispatchChallengeReminders(pb, EVENING);
    expect(res.sent).toBe(0);
  });

  it("un usuario en dos retos recibe un solo aviso", async () => {
    const pb = fakePB({
      participants: [
        participant("u1", {}, "c1"),
        participant("u1", { preset_key: "pushup_builder", metric: "total_exercise", goal: 100 }, "c2"),
      ],
      users: [{ id: "u1", timezone: TZ }],
    });
    const res = await dispatchChallengeReminders(pb, EVENING);
    expect(res.sent).toBe(1);
    expect(pb.store.notifications).toHaveLength(1);
  });
});
