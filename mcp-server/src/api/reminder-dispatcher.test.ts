import { describe, it, expect } from "vitest";
import {
  localParts,
  safeTimeZone,
  shouldFire,
  parseDaysOfWeek,
  contentFor,
  mealBody,
} from "./reminder-dispatcher.js";

// Instante de referencia: 2026-08-08T22:30:00Z (sábado por la noche en UTC).
const UTC_SAT_2230 = new Date("2026-08-08T22:30:00Z");

describe("safeTimeZone", () => {
  it("acepta zonas IANA válidas", () => {
    expect(safeTimeZone("Europe/Madrid")).toBe("Europe/Madrid");
    expect(safeTimeZone("America/Caracas")).toBe("America/Caracas");
  });

  it("cae a UTC con zonas inválidas, vacías o nulas", () => {
    expect(safeTimeZone("Etc/Unknown")).toBe("UTC");
    expect(safeTimeZone("")).toBe("UTC");
    expect(safeTimeZone(null)).toBe("UTC");
    expect(safeTimeZone(undefined)).toBe("UTC");
  });
});

describe("localParts", () => {
  it("convierte a la hora de pared del usuario, no la del servidor", () => {
    // 22:30 UTC = 00:30 del DOMINGO en Madrid (CEST, UTC+2)
    const madrid = localParts(UTC_SAT_2230, "Europe/Madrid");
    expect(madrid.hour).toBe(0);
    expect(madrid.minute).toBe(30);
    expect(madrid.weekday).toBe(0); // domingo
    expect(madrid.dateKey).toBe("2026-08-09");

    // 22:30 UTC = 18:30 del SÁBADO en Caracas (UTC-4)
    const caracas = localParts(UTC_SAT_2230, "America/Caracas");
    expect(caracas.hour).toBe(18);
    expect(caracas.minute).toBe(30);
    expect(caracas.weekday).toBe(6); // sábado
    expect(caracas.dateKey).toBe("2026-08-08");
  });

  it("normaliza la medianoche a 0 y no a 24", () => {
    // 22:00 UTC = 00:00 en Madrid (CEST)
    const p = localParts(new Date("2026-08-08T22:00:00Z"), "Europe/Madrid");
    expect(p.hour).toBe(0);
    expect(p.dateKey).toBe("2026-08-09");
  });

  it("maneja offsets no enteros (India, UTC+5:30)", () => {
    const p = localParts(new Date("2026-08-08T10:00:00Z"), "Asia/Kolkata");
    expect(p.hour).toBe(15);
    expect(p.minute).toBe(30);
  });
});

describe("shouldFire", () => {
  const base = {
    enabled: true,
    hour: 8,
    minute: 0,
    daysOfWeek: [1, 2, 3, 4, 5], // lun-vie
    lastFiredAt: null as string | null,
  };
  // Lunes 2026-08-10, 08:00 en Madrid.
  const mondayMorning = localParts(new Date("2026-08-10T06:00:00Z"), "Europe/Madrid");

  it("dispara en la hora y el día configurados", () => {
    expect(shouldFire(base, mondayMorning, "Europe/Madrid")).toBe(true);
  });

  it("no dispara si el recordatorio está deshabilitado", () => {
    expect(shouldFire({ ...base, enabled: false }, mondayMorning, "Europe/Madrid")).toBe(false);
  });

  it("no dispara en un día no seleccionado", () => {
    // Sábado 2026-08-08 a las 08:00 Madrid, con configuración lun-vie.
    const saturday = localParts(new Date("2026-08-08T06:00:00Z"), "Europe/Madrid");
    expect(saturday.weekday).toBe(6);
    expect(shouldFire(base, saturday, "Europe/Madrid")).toBe(false);
  });

  it("no dispara antes de la hora", () => {
    const before = { ...mondayMorning, hour: 7, minute: 59 };
    expect(shouldFire(base, before, "Europe/Madrid")).toBe(false);
  });

  it("dispara dentro de la ventana de gracia y no fuera de ella", () => {
    expect(shouldFire(base, { ...mondayMorning, minute: 5 }, "Europe/Madrid")).toBe(true);
    expect(shouldFire(base, { ...mondayMorning, minute: 6 }, "Europe/Madrid")).toBe(false);
  });

  it("no repite si ya se envió hoy en la fecha local del usuario", () => {
    const firedToday = { ...base, lastFiredAt: "2026-08-10T06:00:00Z" };
    expect(shouldFire(firedToday, mondayMorning, "Europe/Madrid")).toBe(false);
  });

  it("vuelve a disparar al día siguiente", () => {
    const firedYesterday = { ...base, lastFiredAt: "2026-08-09T06:00:00Z" };
    expect(shouldFire(firedYesterday, mondayMorning, "Europe/Madrid")).toBe(true);
  });

  it("REGRESIÓN: la hora del servidor no decide — 08:00 Madrid ≠ 08:00 UTC", () => {
    // 08:00 UTC es 10:00 en Madrid: un recordatorio de las 08:00 NO debe sonar.
    const eightUtc = localParts(new Date("2026-08-10T08:00:00Z"), "Europe/Madrid");
    expect(eightUtc.hour).toBe(10);
    expect(shouldFire(base, eightUtc, "Europe/Madrid")).toBe(false);
  });

  it("REGRESIÓN: el día se evalúa en local — domingo en Madrid siendo sábado en UTC", () => {
    // 22:30 UTC del sábado ya es domingo 00:30 en Madrid.
    const parts = localParts(UTC_SAT_2230, "Europe/Madrid");
    const sundayReminder = { ...base, hour: 0, minute: 30, daysOfWeek: [0] };
    expect(shouldFire(sundayReminder, parts, "Europe/Madrid")).toBe(true);

    // El mismo instante en Caracas sigue siendo sábado → no dispara.
    const caracasParts = localParts(UTC_SAT_2230, "America/Caracas");
    expect(shouldFire(sundayReminder, caracasParts, "America/Caracas")).toBe(false);
  });
});

describe("parseDaysOfWeek", () => {
  it("acepta un array real de números", () => {
    expect(parseDaysOfWeek([0, 6])).toEqual([0, 6]);
  });

  it("acepta un JSON string (campo json de PocketBase)", () => {
    expect(parseDaysOfWeek("[1,3,5]")).toEqual([1, 3, 5]);
  });

  it("incluye el domingo (0) sin confundirlo con un valor vacío", () => {
    expect(parseDaysOfWeek("[0]")).toEqual([0]);
  });

  it("cae a lun-vie con entradas inesperadas", () => {
    expect(parseDaysOfWeek(null)).toEqual([1, 2, 3, 4, 5]);
    expect(parseDaysOfWeek("no-json")).toEqual([1, 2, 3, 4, 5]);
    expect(parseDaysOfWeek({})).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("contentFor", () => {
  it("usa el tipo de comida en el copy", () => {
    const c = contentFor({ kind: "meal", mealType: "desayuno" });
    expect(c.title).toContain("desayuno");
    expect(c.url).toBe("/nutrition");
    expect(c.campaign).toBe("meal_reminder");
  });

  it("distingue pausa activa de entrenamiento", () => {
    expect(contentFor({ kind: "pause" }).title).toBe("Pausa activa");
    expect(contentFor({ kind: "pause" }).campaign).toBe("pause_reminder");
    expect(contentFor({ kind: "workout" }).title).toContain("entrenar");
    expect(contentFor({ kind: "workout" }).campaign).toBe("workout_reminder");
  });
});

describe("mealBody — progreso de calorías (paridad con el cron anterior)", () => {
  it("muestra el progreso cuando hay objetivo diario", () => {
    // Texto exacto que fijaba tests/pb_hooks/crons.test.mjs
    expect(mealBody("cena", 300, 2000)).toBe("Llevas 300/2000 kcal hoy");
  });

  it("redondea las calorías", () => {
    expect(mealBody("cena", 300.4, 1999.6)).toBe("Llevas 300/2000 kcal hoy");
  });

  it("cae al texto genérico si no hay objetivo", () => {
    expect(mealBody("desayuno", 300, 0)).toBe("No olvides registrar tu desayuno");
  });

  it("contentFor usa el progreso cuando se le pasa contexto", () => {
    const c = contentFor({ kind: "meal", mealType: "cena" }, { todayCalories: 300, dailyGoal: 2000 });
    expect(c.title).toMatch(/registrar tu cena/);
    expect(c.body).toBe("Llevas 300/2000 kcal hoy");
  });

  it("contentFor sin contexto sigue dando el texto genérico", () => {
    expect(contentFor({ kind: "meal", mealType: "cena" }).body).toBe("No olvides registrar tu cena");
  });
});
