import { describe, it, expect, vi } from "vitest";
import {
  buildEmailCopy,
  ctaUrl,
  dispatchEmails,
  emailCampaign,
  evaluateEmail,
  isSendableAddress,
  readEmailConfig,
  renderEmail,
  sendResendEmail,
  unsubscribeToken,
  unsubscribeUrl,
  unsubscribeUser,
  verifyUnsubscribeToken,
  type EmailConfig,
  type EmailKind,
  type EmailLogMark,
} from "./email-dispatcher.js";
import { pickLocalized } from "./push-sender.js";

// 2026-09-24T18:00:00Z: jueves, 14:00 en America/Caracas (UTC-4) → dentro de [12, 20).
const NOW = new Date("2026-09-24T18:00:00Z");
const TZ = "America/Caracas";
const DAY = 24 * 60 * 60 * 1000;
const EPISODE = new Date("2026-09-01T00:00:00Z");
const OLD_SIGNUP = new Date("2026-06-01T10:00:00Z");

const CFG: EmailConfig = {
  resendApiKey: "re_test",
  from: "Calistenia <hola@gym.guille.tech>",
  unsubscribeSecret: "s3cret",
  publicApiUrl: "https://gym-server.guille.tech",
  webUrl: "https://gym.guille.tech",
  dailyCap: 90,
};

const log = (kind: EmailKind, sentAt: Date): EmailLogMark => ({ kind, sentAt });
const ev = (over: Partial<Parameters<typeof evaluateEmail>[0]>) =>
  evaluateEmail({
    created: OLD_SIGNUP,
    inactivity: { inactiveDays: 4, episodeStart: EPISODE, ...(over.inactivity ?? {}) },
    now: NOW,
    timeZone: TZ,
    emailLog: [],
    pushMarks: [],
    ...over,
  });

describe("readEmailConfig", () => {
  it("canal apagado sin clave de Resend o sin secreto de baja", () => {
    expect(readEmailConfig({})).toBeNull();
    expect(readEmailConfig({ RESEND_API_KEY: "x" })).toBeNull();
    expect(readEmailConfig({ EMAIL_UNSUBSCRIBE_SECRET: "x" })).toBeNull();
  });

  it("con las dos variables, valores por defecto razonables", () => {
    const c = readEmailConfig({ RESEND_API_KEY: "k", EMAIL_UNSUBSCRIBE_SECRET: "s", EMAIL_PUBLIC_API_URL: "https://api.x/" })!;
    expect(c.from).toContain("@gym.guille.tech");
    expect(c.publicApiUrl).toBe("https://api.x");
    expect(c.dailyCap).toBe(90);
  });
});

describe("evaluateEmail", () => {
  it("bienvenida entre 10 min y 48 h tras el alta, una sola vez", () => {
    const created = new Date(NOW.getTime() - 60 * 60 * 1000);
    expect(ev({ created, inactivity: null })).toBe("email_welcome");
    expect(ev({ created: new Date(NOW.getTime() - 5 * 60 * 1000), inactivity: null })).toBeNull();
    expect(ev({ created: new Date(NOW.getTime() - 3 * DAY), inactivity: null })).toBeNull();
    expect(ev({ created, inactivity: null, emailLog: [log("email_welcome", new Date(NOW.getTime() - 2 * DAY))] })).toBeNull();
  });

  it("tramos de recuperación 3 / 10 / 30 días y nada desde el 45", () => {
    const at = (d: number) => ev({ inactivity: { inactiveDays: d, episodeStart: EPISODE } });
    expect(at(2)).toBeNull();
    expect(at(3)).toBe("email_recovery_3d");
    expect(at(9)).toBe("email_recovery_3d");
    expect(at(10)).toBe("email_recovery_10d");
    expect(at(29)).toBe("email_recovery_10d");
    expect(at(30)).toBe("email_recovery_30d");
    expect(at(44)).toBe("email_recovery_30d");
    expect(at(45)).toBeNull();
  });

  it("una vez por episodio: repite en un episodio nuevo", () => {
    const sameEpisode = log("email_recovery_3d", new Date("2026-09-10T15:00:00Z"));
    const pastEpisode = log("email_recovery_3d", new Date("2026-08-10T15:00:00Z"));
    expect(ev({ emailLog: [sameEpisode] })).toBeNull();
    expect(ev({ emailLog: [pastEpisode] })).toBe("email_recovery_3d");
  });

  it("como mucho un email al día local", () => {
    const earlierToday = log("email_welcome", new Date("2026-09-24T16:30:00Z"));
    expect(ev({ emailLog: [earlierToday] })).toBeNull();
  });

  it("nunca el mismo día local que un push de inactividad (el push gana)", () => {
    const pushToday = { type: "inactivity_72h", sentAt: new Date("2026-09-24T13:05:00Z") }; // 09:05 local
    expect(ev({ pushMarks: [pushToday] })).toBeNull();
    const pushYesterday = { type: "inactivity_72h", sentAt: new Date(NOW.getTime() - DAY) };
    expect(ev({ pushMarks: [pushYesterday] })).toBe("email_recovery_3d");
    // Un push que no es de inactividad no bloquea.
    expect(ev({ pushMarks: [{ type: "follow", sentAt: NOW }] })).toBe("email_recovery_3d");
  });

  it("solo en la franja [12, 20) local", () => {
    expect(ev({ timeZone: "Asia/Tokyo" })).toBeNull(); // 03:00 en Tokio
    expect(ev({ now: new Date("2026-09-24T14:00:00Z") })).toBeNull(); // 10:00 en Caracas
  });
});

describe("contenido", () => {
  const kinds: EmailKind[] = ["email_recovery_3d", "email_recovery_10d", "email_recovery_30d"];

  it("bienvenida + 3 tramos × 2 comportamientos con asunto distinto, en es y en", () => {
    const subjects = new Set<string>();
    const variants: [EmailKind, "never_trained" | "trained_then_stopped" | null][] = [
      ["email_welcome", null],
      ...kinds.flatMap((k) => [[k, "never_trained"], [k, "trained_then_stopped"]] as [EmailKind, any][]),
    ];
    for (const [k, s] of variants) {
      const copy = buildEmailCopy(k, s);
      for (const lang of ["es", "en"] as const) {
        for (const part of [copy.subject, copy.heading, copy.body, copy.cta]) {
          expect(pickLocalized(part, lang).length).toBeGreaterThan(0);
        }
      }
      subjects.add(pickLocalized(copy.subject, "es"));
    }
    expect(subjects.size).toBe(7);
  });

  it("campañas estables", () => {
    expect(emailCampaign("email_welcome", null)).toBe("email_welcome");
    expect(emailCampaign("email_recovery_10d", "trained_then_stopped")).toBe("email_recovery_10d_trained_then_stopped");
  });

  it("renderiza en el idioma pedido con CTA con UTM y enlace de baja", () => {
    const unsubscribe = unsubscribeUrl(CFG, "user1");
    const r = renderEmail(buildEmailCopy("email_welcome", null), "en", {
      cta: ctaUrl(CFG, "email_welcome"),
      unsubscribe,
    });
    expect(r.subject).toBe("Welcome to Calistenia 💪");
    expect(r.html).toContain('lang="en"');
    expect(r.html).toContain("utm_campaign=email_welcome");
    expect(r.html).toContain("Unsubscribe");
    expect(r.text).toContain(unsubscribe);
  });
});

describe("baja firmada", () => {
  it("el token vale para su usuario y no para otro ni con otro secreto", () => {
    const t = unsubscribeToken("u1", "s3cret");
    expect(verifyUnsubscribeToken("u1", t, "s3cret")).toBe(true);
    expect(verifyUnsubscribeToken("u2", t, "s3cret")).toBe(false);
    expect(verifyUnsubscribeToken("u1", t, "otro")).toBe(false);
    expect(verifyUnsubscribeToken("u1", "", "s3cret")).toBe(false);
  });

  it("unsubscribeUser marca email_opt_out solo con token válido", async () => {
    const update = vi.fn(async () => ({}));
    const pb = { collection: () => ({ update }) };
    expect(await unsubscribeUser(pb, CFG, "u1", "malo")).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(await unsubscribeUser(pb, CFG, "u1", unsubscribeToken("u1", CFG.unsubscribeSecret))).toBe(true);
    expect(update).toHaveBeenCalledWith("u1", { email_opt_out: true });
  });
});

describe("direcciones", () => {
  it("descarta dominios de prueba y direcciones mal formadas", () => {
    expect(isSendableAddress("ana@gmail.com")).toBe(true);
    expect(isSendableAddress("test-b@local.test")).toBe(false);
    expect(isSendableAddress("a@example.com")).toBe(false);
    expect(isSendableAddress("sin-arroba")).toBe(false);
    expect(isSendableAddress("")).toBe(false);
  });
});

describe("sendResendEmail", () => {
  it("manda a la API de Resend con cabeceras de baja en un clic y la campaña como tag", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await sendResendEmail(
      CFG,
      { to: "ana@gmail.com", subject: "S", html: "<p>h</p>", text: "t", unsubscribe: "https://u", campaign: "email_welcome" },
      fetchImpl as unknown as typeof fetch,
    );
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(["ana@gmail.com"]);
    expect(body.headers["List-Unsubscribe"]).toBe("<https://u>");
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(body.tags).toEqual([{ name: "campaign", value: "email_welcome" }]);
  });

  it("un error de Resend se propaga", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 422 }));
    await expect(
      sendResendEmail(CFG, { to: "a@b.co", subject: "", html: "", text: "", unsubscribe: "", campaign: "" }, fetchImpl as any),
    ).rejects.toThrow(/Resend 422/);
  });
});

// ─── PocketBase falso para el despacho ───────────────────────────────────────

function fakePB(data: { users?: any[]; user_stats?: any[]; sessions?: any[]; notifications?: any[]; email_log?: any[] }) {
  const store: Record<string, any[]> = {
    users: data.users ?? [],
    user_stats: data.user_stats ?? [],
    sessions: data.sessions ?? [],
    circuit_sessions: [],
    cardio_sessions: [],
    notifications: data.notifications ?? [],
    email_log: data.email_log ?? [],
  };
  const userOf = (filter: string) => filter.match(/user = '([^']+)'/)?.[1];
  return {
    store,
    filter: (expr: string, params: Record<string, string>) => expr.replace(/\{:(\w+)\}/g, (_, k) => `'${params[k]}'`),
    collection: (col: string) => ({
      getFullList: async (opts: any) => {
        const f: string = opts?.filter ?? "";
        if (col === "user_stats") {
          const from = f.match(/>= '([^']+)'/)![1];
          const to = f.match(/<= '([^']+)'/)![1];
          return store.user_stats
            .filter((r) => r.last_workout_date >= from && r.last_workout_date <= to)
            .map((r) => ({ ...r, expand: { user: store.users.find((u) => u.id === r.user) } }));
        }
        if (col === "users") {
          const from = f.match(/>= '([^']+)'/)![1];
          return store.users.filter((u) => u.created >= from);
        }
        const uid = userOf(f);
        return store[col].filter((r) => !uid || r.user === uid);
      },
      getList: async (_p: number, _n: number, opts: any) => {
        const uid = userOf(opts?.filter ?? "");
        const items = store[col].filter((r) => !uid || r.user === uid);
        return { items: items.slice(0, 1), totalItems: col === "email_log" ? items.length : items.length };
      },
      create: async (row: any) => {
        store[col].push({ ...row, created: NOW.toISOString().replace("T", " ") });
        return row;
      },
    }),
  };
}

describe("dispatchEmails", () => {
  const recent = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString().replace("T", " ");

  it("bienvenida al recién llegado, recuperación al que paró; respeta baja y direcciones de prueba", async () => {
    const pb = fakePB({
      users: [
        { id: "new", email: "new@gmail.com", created: recent, timezone: TZ, language: "en" },
        { id: "stop", email: "stop@gmail.com", created: "2026-05-01 10:00:00.000Z", timezone: TZ, language: "es" },
        { id: "out", email: "out@gmail.com", created: recent, timezone: TZ, email_opt_out: true },
        { id: "fake", email: "x@local.test", created: recent, timezone: TZ },
      ],
      user_stats: [{ user: "stop", last_workout_date: "2026-09-19" }], // 5 días
    });
    const send = vi.fn(async () => {});
    const res = await dispatchEmails(pb, CFG, NOW, send);
    expect(res.sent).toBe(2);
    expect(pb.store.email_log.map((r) => [r.user, r.kind, r.campaign])).toEqual([
      ["new", "email_welcome", "email_welcome"],
      ["stop", "email_recovery_3d", "email_recovery_3d_trained_then_stopped"],
    ]);
    const msgs = send.mock.calls.map((c) => (c as any[])[1]);
    expect(msgs[0]).toMatchObject({ to: "new@gmail.com", subject: "Welcome to Calistenia 💪" });
    expect(msgs[1].to).toBe("stop@gmail.com");
    expect(msgs[1].unsubscribe).toContain("/api/email/unsubscribe?u=stop&t=");
  });

  it("un segundo tick el mismo día no repite", async () => {
    const pb = fakePB({ users: [{ id: "new", email: "new@gmail.com", created: recent, timezone: TZ }] });
    const send = vi.fn(async () => {});
    await dispatchEmails(pb, CFG, NOW, send);
    const again = await dispatchEmails(pb, CFG, new Date(NOW.getTime() + 60 * 60 * 1000), send);
    expect(again.sent).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("nunca entrenó a los 4 días → recuperación never_trained; con alguna sesión no", async () => {
    const created = "2026-09-20 10:00:00.000Z";
    const pb = fakePB({
      users: [
        { id: "never", email: "n@gmail.com", created, timezone: TZ },
        { id: "trained", email: "t@gmail.com", created, timezone: TZ },
      ],
      sessions: [{ user: "trained" }],
    });
    const send = vi.fn(async () => {});
    await dispatchEmails(pb, CFG, NOW, send);
    expect(pb.store.email_log.map((r) => r.campaign)).toEqual(["email_recovery_3d_never_trained"]);
  });

  it("para al llegar al tope diario", async () => {
    const pb = fakePB({
      users: [
        { id: "a", email: "a@gmail.com", created: recent, timezone: TZ },
        { id: "b", email: "b@gmail.com", created: recent, timezone: TZ },
      ],
    });
    const send = vi.fn(async () => {});
    const res = await dispatchEmails(pb, { ...CFG, dailyCap: 1 }, NOW, send);
    expect(res.sent).toBe(1);
    expect(res.capped).toBe(true);
  });
});
