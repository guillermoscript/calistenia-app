import { describe, it, expect } from "vitest";
import { toDateStr, today, startOfWeek, daysAgo, wallClockDayStr, wallClockStamp } from "./utils.js";

describe("toDateStr", () => {
  const instant = "2026-03-01T01:30:00Z";

  it("formatea en la zona horaria pedida (America/Los_Angeles cruza al día anterior)", () => {
    expect(toDateStr(instant, "America/Los_Angeles")).toBe("2026-02-28");
  });

  it("formatea en UTC cuando se pide explícitamente", () => {
    expect(toDateStr(instant, "UTC")).toBe("2026-03-01");
  });

  it("sin tz, por defecto usa UTC (no la hora local del proceso)", () => {
    expect(toDateStr(instant)).toBe("2026-03-01");
  });

  it("acepta un Date además de un string ISO", () => {
    expect(toDateStr(new Date(instant), "UTC")).toBe("2026-03-01");
  });
});

describe("today", () => {
  it("equivale a toDateStr(new Date(), tz) en el mismo instante", () => {
    // No mockeamos el reloj (Intl + fake timers puede ser frágil); comparamos
    // contra la implementación directa evaluada en el mismo tick.
    expect(today()).toBe(toDateStr(new Date()));
    expect(today("America/Caracas")).toBe(toDateStr(new Date(), "America/Caracas"));
  });
});

describe("startOfWeek", () => {
  it("devuelve un lunes", () => {
    const result = startOfWeek();
    const weekday = new Date(`${result}T12:00:00Z`).getUTCDay();
    expect(weekday).toBe(1); // 1 = lunes
  });

  it("es anterior o igual a hoy", () => {
    const result = startOfWeek();
    expect(result <= today()).toBe(true);
  });

  it("también devuelve lunes en otra zona horaria", () => {
    const result = startOfWeek("America/Los_Angeles");
    const weekday = new Date(`${result}T12:00:00Z`).getUTCDay();
    expect(weekday).toBe(1);
  });
});

describe("daysAgo", () => {
  it("daysAgo(0) es hoy", () => {
    expect(daysAgo(0)).toBe(today());
  });

  it("daysAgo(1) es exactamente un día calendario antes de hoy (en UTC)", () => {
    const todayUtcMs = new Date(`${today()}T00:00:00Z`).getTime();
    const yesterdayUtcMs = new Date(`${daysAgo(1)}T00:00:00Z`).getTime();
    expect(todayUtcMs - yesterdayUtcMs).toBe(24 * 60 * 60 * 1000);
  });

  it("daysAgo(7) retrocede exactamente 7 días calendario (en UTC)", () => {
    const todayUtcMs = new Date(`${today()}T00:00:00Z`).getTime();
    const sevenAgoMs = new Date(`${daysAgo(7)}T00:00:00Z`).getTime();
    expect(todayUtcMs - sevenAgoMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("wallClockDayStr (sessions.completed_at / sets_log.logged_at)", () => {
  it("el día es la hora de pared: no se desplaza con la zona", () => {
    // 00:30 del 1 de marzo guardado como pared local. toDateStr lo trataría como
    // instante UTC y en Los Ángeles lo movería al 28 de febrero.
    expect(wallClockDayStr("2026-03-01 00:30:00.000Z", "America/Los_Angeles")).toBe("2026-03-01");
    expect(toDateStr("2026-03-01 00:30:00.000Z", "America/Los_Angeles")).toBe("2026-02-28");
    // 23:30 en Caracas (UTC-4): como UTC pasaría al día siguiente en Madrid.
    expect(wallClockDayStr("2026-03-01 23:30:00.000Z", "Europe/Madrid")).toBe("2026-03-01");
  });
});

describe("wallClockStamp (escritura)", () => {
  it("sin valor escribe la hora de pared actual del usuario, sin T ni Z", () => {
    expect(wallClockStamp(undefined, "Europe/Madrid")).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("un ISO con zona se convierte a la pared del usuario", () => {
    expect(wallClockStamp("2026-07-05T22:30:00Z", "Europe/Madrid")).toBe("2026-07-06 00:30:00");
    expect(wallClockStamp("2026-07-05T22:30:00Z", "America/Caracas")).toBe("2026-07-05 18:30:00");
  });

  it("un ISO sin zona ya es hora de pared", () => {
    expect(wallClockStamp("2026-07-05T09:15:00", "Europe/Madrid")).toBe("2026-07-05 09:15:00");
  });
});
