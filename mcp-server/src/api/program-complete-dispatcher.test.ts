import { describe, it, expect, vi, beforeEach } from "vitest";

const sendPushToUser = vi.fn(async () => {});
vi.mock("./push-sender.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./push-sender.js")>();
  return { ...actual, sendPushToUser: (...args: unknown[]) => sendPushToUser(...(args as [])) };
});

import {
  PROGRAM_COMPLETE_NUDGE_TYPE,
  buildProgramNudgeCopy,
  dispatchProgramCompleteNudges,
  evaluateProgramNudge,
  programEndDay,
  startDayOf,
} from "./program-complete-dispatcher.js";
import { DAILY_CAP_TYPES, evaluateReactivation } from "./reactivation-dispatcher.js";
import { evaluateChallengeReminder } from "./challenge-reminder-dispatcher.js";
import { pickLocalized } from "./push-sender.js";

const TZ = "America/Caracas"; // UTC-4 todo el año
const DAY = 24 * 60 * 60 * 1000;
// Programa de 2 semanas empezado el 2026-09-01 → último día 2026-09-14.
const STARTED = "2026-09-01 08:00:00";
// 2026-09-17 18:30 en Caracas = 3 días después del final.
const DAY3 = new Date("2026-09-17T22:30:00Z");

const cand = (over: Partial<Parameters<typeof evaluateProgramNudge>[0]["candidate"]> = {}) => ({
  enrollmentId: "e1",
  startedAt: STARTED,
  durationWeeks: 2,
  extendedWeeks: 0,
  ...over,
});
const ev = (over: Partial<Parameters<typeof evaluateProgramNudge>[0]> = {}) =>
  evaluateProgramNudge({ candidate: cand(), now: DAY3, timeZone: TZ, sent: [], ...over });

describe("programEndDay", () => {
  it("inicio + semanas × 7 − 1, con la extensión", () => {
    expect(programEndDay(STARTED, 2, 0)).toBe("2026-09-14");
    expect(programEndDay(STARTED, 2, 3)).toBe("2026-10-05");
    expect(programEndDay("2026-12-28", 1, 0)).toBe("2027-01-03");
  });

  it("sin inicio o sin duración no hay final", () => {
    expect(programEndDay("", 4, 0)).toBeNull();
    expect(programEndDay(STARTED, 0, 2)).toBeNull();
    expect(startDayOf("basura")).toBeNull();
  });
});

describe("evaluateProgramNudge", () => {
  it("avisa a los 3 días del final, a su hora local", () => {
    expect(ev()).toEqual({ send: true, daysLate: 3 });
  });

  it("fuera de la ventana de horas no avisa", () => {
    expect(ev({ now: new Date("2026-09-17T14:00:00Z") })).toEqual({ send: false, reason: "outside_hours" });
  });

  it("antes del día 3 o pasado el 6 no avisa", () => {
    expect(ev({ now: new Date(DAY3.getTime() - DAY) })).toEqual({ send: false, reason: "outside_window" });
    expect(ev({ now: new Date(DAY3.getTime() + 3 * DAY) })).toMatchObject({ send: true, daysLate: 6 });
    expect(ev({ now: new Date(DAY3.getTime() + 4 * DAY) })).toEqual({ send: false, reason: "outside_window" });
  });

  it("la extensión mueve el final", () => {
    expect(ev({ candidate: cand({ extendedWeeks: 2 }) })).toEqual({ send: false, reason: "outside_window" });
  });

  it("una vez por vuelta: la marca de esta inscripción tras el inicio actual bloquea", () => {
    const mark = { type: PROGRAM_COMPLETE_NUDGE_TYPE, referenceId: "e1", sentAt: new Date(DAY3.getTime() - DAY) };
    expect(ev({ sent: [mark] })).toEqual({ send: false, reason: "already_sent" });
    // Marca de una vuelta anterior (antes del started_at actual): no cuenta.
    const old = { ...mark, sentAt: new Date("2026-08-20T22:00:00Z") };
    expect(ev({ sent: [old] })).toEqual({ send: true, daysLate: 3 });
    // Marca de otra inscripción: no cuenta.
    expect(ev({ sent: [{ ...mark, referenceId: "e2" }] })).toEqual({ send: true, daysLate: 3 });
  });

  it("tope diario: si hoy ya salió otro push de la familia, cede", () => {
    const today = new Date("2026-09-17T15:00:00Z");
    expect(ev({ sent: [{ type: "inactivity_7d", sentAt: today }] })).toEqual({ send: false, reason: "daily_cap" });
    expect(ev({ sent: [{ type: "challenge_reminder", sentAt: today }] })).toEqual({ send: false, reason: "daily_cap" });
  });

  it("los demás también ceden ante él", () => {
    expect(DAILY_CAP_TYPES).toContain(PROGRAM_COMPLETE_NUDGE_TYPE);
    const challenge = evaluateChallengeReminder({
      candidate: { startsAt: "2026-09-15", endsAt: "2026-10-15", goal: 100 },
      now: new Date("2026-09-17T23:30:00Z"),
      timeZone: TZ,
      lastWorkoutDate: null,
      score: 0,
      sent: [{ type: PROGRAM_COMPLETE_NUDGE_TYPE, sentAt: DAY3 }],
    });
    expect(challenge).toEqual({ send: false, reason: "inactivity_sent_today" });
    expect(typeof evaluateReactivation).toBe("function");
  });
});

describe("buildProgramNudgeCopy", () => {
  it("bilingüe y con el nombre del programa", () => {
    const c = buildProgramNudgeCopy("Fundamentos");
    expect(pickLocalized(c.title, "es")).toBe("Terminaste Fundamentos");
    expect(pickLocalized(c.title, "en")).toBe("You finished Fundamentos");
    expect(pickLocalized(buildProgramNudgeCopy("  ").title, "es")).toBe("Terminaste tu programa");
  });
});

// ─── PocketBase falso ─────────────────────────────────────────────────────────

interface Row { [k: string]: any }

function fakePB(data: { enrollments?: Row[]; users?: Row[]; notifications?: Row[]; notification_prefs?: Row[] }) {
  const store: Record<string, Row[]> = {
    user_programs: data.enrollments ?? [],
    users: data.users ?? [],
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
    clock: DAY3,
    store,
    filter: (expr: string, params: Record<string, string>) =>
      expr.replace(/\{:(\w+)\}/g, (_, k) => `'${params[k]}'`),
    collection: (col: string) => ({
      getFullList: async (opts: any) =>
        store[col].filter((r) => col === "user_programs" || match(r, opts?.filter ?? "")),
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

const enrollment = (user: string, over: Row = {}) => ({
  id: `e-${user}`,
  user,
  program: "p1",
  started_at: STARTED,
  extended_weeks: 0,
  cycle: 0,
  expand: { program: { id: "p1", name: "Fundamentos", duration_weeks: 2 } },
  ...over,
});

describe("dispatchProgramCompleteNudges", () => {
  beforeEach(() => sendPushToUser.mockClear());

  it("envía el push con la marca de la inscripción y el idioma del usuario", async () => {
    const pb = fakePB({ enrollments: [enrollment("u1")], users: [{ id: "u1", timezone: TZ, language: "en" }] });
    const res = await dispatchProgramCompleteNudges(pb, DAY3);
    expect(res).toMatchObject({ candidates: 1, sent: 1, errors: 0 });
    expect(pb.store.notifications[0]).toMatchObject({
      user: "u1",
      type: PROGRAM_COMPLETE_NUDGE_TYPE,
      reference_id: "e-u1",
      reference_type: "user_program",
      data: { url: "/", campaign: PROGRAM_COMPLETE_NUDGE_TYPE, daysLate: 3 },
    });
    const [uid, payload] = sendPushToUser.mock.calls[0] as unknown as [string, any];
    expect(uid).toBe("u1");
    expect(payload).toMatchObject({ language: "en", url: "/", campaign: PROGRAM_COMPLETE_NUDGE_TYPE });
  });

  it("idempotente: al día siguiente no repite", async () => {
    const pb = fakePB({ enrollments: [enrollment("u1")], users: [{ id: "u1", timezone: TZ }] });
    await dispatchProgramCompleteNudges(pb, DAY3);
    const next = new Date(DAY3.getTime() + DAY);
    pb.clock = next;
    const second = await dispatchProgramCompleteNudges(pb, next);
    expect(second.sent).toBe(0);
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
  });

  it("respeta el interruptor maestro y la categoría own_milestones", async () => {
    const pb = fakePB({
      enrollments: [enrollment("u1"), enrollment("u2")],
      users: [{ id: "u1", timezone: TZ }, { id: "u2", timezone: TZ }],
      notification_prefs: [{ user: "u1", push_enabled: false }, { user: "u2", own_milestones: false }],
    });
    const res = await dispatchProgramCompleteNudges(pb, DAY3);
    expect(res.sent).toBe(0);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("sin duración no avisa", async () => {
    const pb = fakePB({
      enrollments: [enrollment("u1", { expand: { program: { id: "p1", name: "X", duration_weeks: 0 } } })],
      users: [{ id: "u1", timezone: TZ }],
    });
    expect((await dispatchProgramCompleteNudges(pb, DAY3)).sent).toBe(0);
  });
});
