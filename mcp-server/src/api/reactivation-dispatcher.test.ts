import { describe, it, expect, vi, beforeEach } from "vitest";

const sendPushToUser = vi.fn(async () => {});
vi.mock("./push-sender.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./push-sender.js")>();
  return { ...actual, sendPushToUser: (...args: unknown[]) => sendPushToUser(...(args as [])) };
});

import {
  buildReactivationCopy,
  diffLocalDays,
  dispatchReactivationPushes,
  evaluateReactivation,
  inactivityOf,
  loadStoppedCandidates,
  reactivationCampaign,
  type SentMark,
} from "./reactivation-dispatcher.js";
import { pickLocalized } from "./push-sender.js";

// 2026-09-24T15:00:00Z es jueves; en America/Caracas (UTC-4) son las 11:00.
const THU = new Date("2026-09-24T15:00:00Z");
// 2026-09-28T15:00:00Z es lunes, 11:00 en Caracas.
const MON = new Date("2026-09-28T15:00:00Z");
const TZ = "America/Caracas";
const DAY = 24 * 60 * 60 * 1000;
const EPISODE = new Date("2026-09-01T00:00:00Z");

const ago = (from: Date, days: number) => new Date(from.getTime() - days * DAY);
const mark = (type: string, sentAt: Date): SentMark => ({ type, sentAt });
const ev = (over: Partial<Parameters<typeof evaluateReactivation>[0]>) =>
  evaluateReactivation({ inactiveDays: 8, episodeStart: EPISODE, now: THU, timeZone: TZ, sent: [], ...over });

describe("evaluateReactivation", () => {
  it("antes del día 7 no toca nada (eso es de inactivity-dispatcher)", () => {
    expect(ev({ inactiveDays: 6 })).toBeNull();
  });

  it("[7, 14) → inactivity_7d", () => {
    expect(ev({ inactiveDays: 7 })).toBe("inactivity_7d");
    expect(ev({ inactiveDays: 13 })).toBe("inactivity_7d");
  });

  it("[14, 21) → inactivity_14d", () => {
    expect(ev({ inactiveDays: 14 })).toBe("inactivity_14d");
    expect(ev({ inactiveDays: 20 })).toBe("inactivity_14d");
  });

  it("no repite un tramo ya enviado en el mismo episodio", () => {
    expect(ev({ inactiveDays: 9, sent: [mark("inactivity_7d", ago(THU, 2))] })).toBeNull();
    expect(ev({ inactiveDays: 16, sent: [mark("inactivity_14d", ago(THU, 1))] })).toBeNull();
  });

  it("una marca de un episodio ANTERIOR no bloquea el tramo", () => {
    const old = mark("inactivity_7d", new Date("2026-08-01T12:00:00Z"));
    expect(ev({ inactiveDays: 8, sent: [old] })).toBe("inactivity_7d");
  });

  it("el lunes local manda «nuevo comienzo» si no hubo push de la familia en 6 días", () => {
    const sent = [mark("inactivity_14d", ago(MON, 8))];
    expect(ev({ inactiveDays: 22, now: MON, sent })).toBe("inactivity_new_start");
  });

  it("sin lunes, pasado el tramo de 14d, no hay nada", () => {
    expect(ev({ inactiveDays: 22, sent: [mark("inactivity_14d", ago(THU, 8))] })).toBeNull();
  });

  it("no hay «nuevo comienzo» con un push de la familia hace menos de 6 días", () => {
    const sent = [mark("inactivity_7d", ago(MON, 3))];
    expect(ev({ inactiveDays: 10, now: MON, sent })).toBeNull();
  });

  it("prioridad: el lunes, si toca 7d, gana 7d sobre el «nuevo comienzo»", () => {
    expect(ev({ inactiveDays: 7, now: MON })).toBe("inactivity_7d");
  });

  it("como mucho uno al día local, contando también 24h/72h de #695", () => {
    const earlierToday = new Date("2026-09-24T13:30:00Z"); // 09:30 en Caracas, mismo día
    expect(ev({ inactiveDays: 7, sent: [mark("inactivity_72h", earlierToday)] })).toBeNull();
    const yesterday = ago(THU, 1);
    expect(ev({ inactiveDays: 7, sent: [mark("inactivity_72h", yesterday)] })).toBe("inactivity_7d");
  });

  it("ignora tipos de notificación ajenos a la familia", () => {
    expect(ev({ inactiveDays: 7, sent: [mark("follow", THU)] })).toBe("inactivity_7d");
  });

  it("a partir del día 42 no insiste más, aunque sea lunes", () => {
    expect(ev({ inactiveDays: 42, now: MON })).toBeNull();
  });

  it("respeta la ventana 9-21 local", () => {
    // 15:00 UTC en Asia/Tokyo = 00:00 del día siguiente.
    expect(ev({ inactiveDays: 7, timeZone: "Asia/Tokyo" })).toBeNull();
    // 15:00 UTC en Europe/Madrid (CEST) = 17:00.
    expect(ev({ inactiveDays: 7, timeZone: "Europe/Madrid" })).toBe("inactivity_7d");
  });

  it("el lunes se decide en hora LOCAL: el lunes 02:00 UTC aún es domingo en Caracas", () => {
    const sundayInCaracas = new Date("2026-09-28T02:00:00Z"); // 22:00 del domingo, además fuera de ventana
    expect(ev({ inactiveDays: 22, now: sundayInCaracas, timeZone: TZ })).toBeNull();
    // Mismo instante en Asia/Tokyo: lunes 11:00 → nuevo comienzo.
    expect(ev({ inactiveDays: 22, now: sundayInCaracas, timeZone: "Asia/Tokyo" })).toBe("inactivity_new_start");
  });
});

describe("buildReactivationCopy", () => {
  const kinds = ["inactivity_7d", "inactivity_14d", "inactivity_new_start"] as const;
  const segments = ["never_trained", "trained_then_stopped"] as const;

  it("hay copy distinto por tramo y comportamiento, en es y en", () => {
    const titles = new Set<string>();
    for (const k of kinds) {
      for (const s of segments) {
        const c = buildReactivationCopy(k, s, null);
        for (const lang of ["es", "en"] as const) {
          expect(pickLocalized(c.title, lang)).toBeTruthy();
          expect(pickLocalized(c.body, lang)).toBeTruthy();
        }
        titles.add(pickLocalized(c.title, "es"));
      }
    }
    expect(titles.size).toBe(6);
  });

  it("«nunca entrenó» no habla de retomar, «entrenó y paró» no habla de primer entreno", () => {
    expect(pickLocalized(buildReactivationCopy("inactivity_7d", "never_trained", null).body, "es")).not.toMatch(/retom/i);
    expect(pickLocalized(buildReactivationCopy("inactivity_7d", "trained_then_stopped", null).title, "es")).not.toMatch(/primer/i);
  });

  it("el nuevo comienzo usa el próximo día del programa si lo hay", () => {
    const c = buildReactivationCopy("inactivity_new_start", "trained_then_stopped", "Lunes: Empuje");
    expect(pickLocalized(c.body, "es")).toContain("Lunes: Empuje");
    expect(pickLocalized(c.body, "en")).toContain("Lunes: Empuje");
  });

  it("nombres de campaña estables", () => {
    expect(reactivationCampaign("inactivity_7d", "never_trained")).toBe("inactivity_7d_never_trained");
    expect(reactivationCampaign("inactivity_new_start", "trained_then_stopped")).toBe(
      "inactivity_new_start_trained_then_stopped",
    );
  });
});

describe("inactivityOf / diffLocalDays", () => {
  it("«entrenó y paró» cuenta desde last_workout_date con el hoy local y ancla al día siguiente", () => {
    const r = inactivityOf(
      { userId: "u", segment: "trained_then_stopped", lastWorkoutDate: "2026-09-16" },
      THU,
      "2026-09-24",
    );
    expect(r?.inactiveDays).toBe(8);
    expect(r?.episodeStart.toISOString()).toBe("2026-09-17T00:00:00.000Z");
  });

  it("«nunca entrenó» cuenta desde users.created", () => {
    const r = inactivityOf(
      { userId: "u", segment: "never_trained", created: "2026-09-14 10:00:00.000Z" },
      THU,
      "2026-09-24",
    );
    expect(r?.inactiveDays).toBe(10);
  });

  it("diffLocalDays cruza meses", () => {
    expect(diffLocalDays("2026-10-02", "2026-09-28")).toBe(4);
  });
});

// ─── PocketBase falso ─────────────────────────────────────────────────────────

interface Row { [k: string]: any }

function fakePB(data: {
  users?: Row[];
  user_stats?: Row[];
  sessions?: Row[];
  notifications?: Row[];
  notification_prefs?: Row[];
}) {
  const calls: { col: string; filter: string; opts: any }[] = [];
  const store: Record<string, Row[]> = {
    users: data.users ?? [],
    user_stats: data.user_stats ?? [],
    sessions: data.sessions ?? [],
    circuit_sessions: [],
    cardio_sessions: [],
    notifications: data.notifications ?? [],
    notification_prefs: data.notification_prefs ?? [],
  };
  // Filtro mínimo: igualdades `campo = 'v'`, OR de `type`, y rangos >= / <= sobre texto.
  const match = (row: Row, filter: string): boolean => {
    for (const clause of filter.split("&&").map((c) => c.trim().replace(/^\(|\)$/g, ""))) {
      const ors = clause.split("||").map((c) => c.trim());
      const ok = ors.some((c) => {
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
  return {
    calls,
    store,
    filter: (expr: string, params: Record<string, string>) =>
      expr.replace(/\{:(\w+)\}/g, (_, k) => `'${params[k]}'`),
    collection: (col: string) => ({
      getFullList: async (opts: any) => {
        calls.push({ col, filter: opts?.filter ?? "", opts });
        const rows = store[col].filter((r) => match(r, opts?.filter ?? ""));
        if (col === "user_stats" && opts?.expand === "user") {
          return rows.map((r) => ({ ...r, expand: { user: store.users.find((u) => u.id === r.user) } }));
        }
        return rows;
      },
      getList: async (_p: number, _n: number, opts: any) => {
        calls.push({ col, filter: opts?.filter ?? "", opts });
        return { items: store[col].filter((r) => match(r, opts?.filter ?? "")).slice(0, 1) };
      },
      create: async (row: Row) => {
        store[col].push({ ...row, created: new Date().toISOString().replace("T", " ") });
        return row;
      },
    }),
  };
}

describe("loadStoppedCandidates", () => {
  it("filtra user_stats por last_workout_date (no por users.created) y trae zona e idioma", async () => {
    const pb = fakePB({
      users: [
        { id: "a", timezone: TZ, language: "en", created: "2025-01-01 00:00:00.000Z" },
        { id: "b", timezone: TZ, language: "es", created: "2025-01-01 00:00:00.000Z" },
        { id: "c", timezone: TZ, language: "es", created: "2025-01-01 00:00:00.000Z" },
      ],
      user_stats: [
        { user: "a", last_workout_date: "2026-09-15" }, // 9 días → candidato
        { user: "b", last_workout_date: "2026-09-23" }, // ayer → no
        { user: "c", last_workout_date: "2026-07-01" }, // demasiado viejo → no
        { user: "d", last_workout_date: "" }, // nunca entrenó → no
      ],
    });
    const rows = await loadStoppedCandidates(pb, THU);
    expect(rows).toEqual([
      {
        userId: "a",
        segment: "trained_then_stopped",
        timezone: TZ,
        language: "en",
        lastWorkoutDate: "2026-09-15",
      },
    ]);
    const call = pb.calls.find((c) => c.col === "user_stats")!;
    expect(call.filter).toContain("last_workout_date >=");
    expect(call.filter).not.toContain("created");
  });
});

describe("dispatchReactivationPushes", () => {
  beforeEach(() => sendPushToUser.mockClear());

  it("manda la variante correcta a cada población, con campaña en la marca y en el push", async () => {
    const pb = fakePB({
      users: [
        // nunca entrenó, alta hace 9 días
        { id: "never", timezone: TZ, language: "en", created: "2026-09-15 10:00:00.000Z" },
        // entrenó y paró hace 8 días
        { id: "stop", timezone: TZ, language: "es", created: "2026-06-01 10:00:00.000Z" },
      ],
      user_stats: [{ user: "stop", last_workout_date: "2026-09-16" }],
      sessions: [{ user: "stop" }],
    });

    const res = await dispatchReactivationPushes(pb, THU);
    expect(res.sent).toBe(2);

    const marks = pb.store.notifications;
    expect(marks.map((m) => [m.user, m.type, m.data.campaign])).toEqual([
      ["stop", "inactivity_7d", "inactivity_7d_trained_then_stopped"],
      ["never", "inactivity_7d", "inactivity_7d_never_trained"],
    ]);
    const pushes = sendPushToUser.mock.calls as unknown as [string, any][];
    expect(pushes.find(([u]) => u === "never")![1]).toMatchObject({
      campaign: "inactivity_7d_never_trained",
      language: "en",
      url: "/workout",
    });
    expect(pushes.find(([u]) => u === "stop")![1].campaign).toBe("inactivity_7d_trained_then_stopped");
  });

  it("dedupe: un segundo tick no repite, ni el mismo día ni en el mismo tramo", async () => {
    const pb = fakePB({
      users: [{ id: "never", timezone: TZ, language: "es", created: "2026-09-15 10:00:00.000Z" }],
    });
    await dispatchReactivationPushes(pb, THU);
    // Marcas con la hora del tick, no la del reloj real del test.
    for (const n of pb.store.notifications) n.created = THU.toISOString().replace("T", " ");
    const again = await dispatchReactivationPushes(pb, new Date(THU.getTime() + 2 * 60 * 60 * 1000));
    const nextDay = await dispatchReactivationPushes(pb, new Date(THU.getTime() + DAY));
    expect(again.sent).toBe(0);
    expect(nextDay.sent).toBe(0);
    expect(pb.store.notifications).toHaveLength(1);
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
  });

  it("nunca entrenó con alguna sesión → no es de este grupo", async () => {
    const pb = fakePB({
      users: [{ id: "u", timezone: TZ, created: "2026-09-15 10:00:00.000Z" }],
      sessions: [{ user: "u" }],
    });
    const res = await dispatchReactivationPushes(pb, THU);
    expect(res.sent).toBe(0);
  });

  it("respeta push_enabled = false", async () => {
    const pb = fakePB({
      users: [{ id: "u", timezone: TZ, created: "2026-09-15 10:00:00.000Z" }],
      notification_prefs: [{ user: "u", push_enabled: false }],
    });
    const res = await dispatchReactivationPushes(pb, THU);
    expect(res.sent).toBe(0);
    expect(pb.store.notifications).toHaveLength(0);
  });
});
