import { describe, it, expect } from "vitest";
import { isWeeklyInsightSlot } from "./weekly-insight-dispatcher.js";

describe("isWeeklyInsightSlot", () => {
  it("dispara a las 08:00 del lunes, hora local — America/Bogota (UTC-5, sin DST, va detrás de UTC)", () => {
    // 2026-08-10 es lunes. Bogotá es UTC-5 todo el año (sin DST): 13:00 UTC = 08:00 local, mismo día.
    expect(isWeeklyInsightSlot(new Date("2026-08-10T13:00:00Z"), "America/Bogota")).toBe(true);
  });

  it("no dispara fuera de la hora exacta ni en otro día de la semana — America/Bogota", () => {
    // 12:00 UTC = 07:00 en Bogotá: toca el lunes pero aún no son las 08:00.
    expect(isWeeklyInsightSlot(new Date("2026-08-10T12:00:00Z"), "America/Bogota")).toBe(false);
    // Un día antes: domingo 08:00 en Bogotá.
    expect(isWeeklyInsightSlot(new Date("2026-08-09T13:00:00Z"), "America/Bogota")).toBe(false);
  });

  it("dispara cualquier minuto dentro de la hora 08 (el tick es de 15min, no de 1min)", () => {
    expect(isWeeklyInsightSlot(new Date("2026-08-10T13:45:00Z"), "America/Bogota")).toBe(true);
  });

  it("REGRESIÓN: el lunes local puede ser domingo en UTC — Pacific/Auckland (NZDT, UTC+13, va delante de UTC)", () => {
    // 2026-01-05 es lunes. En enero Nueva Zelanda está en NZDT (UTC+13):
    // 2026-01-04T19:00:00Z (domingo en UTC) = 2026-01-05 08:00 local (lunes) en Auckland.
    expect(isWeeklyInsightSlot(new Date("2026-01-04T19:00:00Z"), "Pacific/Auckland")).toBe(true);
    // El mismo instante en Bogotá sigue siendo domingo por la tarde — no dispara.
    expect(isWeeklyInsightSlot(new Date("2026-01-04T19:00:00Z"), "America/Bogota")).toBe(false);
  });

  it("no dispara fuera de la hora exacta — Pacific/Auckland", () => {
    // Una hora antes: 07:00 local del lunes en Auckland.
    expect(isWeeklyInsightSlot(new Date("2026-01-04T18:00:00Z"), "Pacific/Auckland")).toBe(false);
  });

  it("cae a UTC con una zona horaria basura, sin romper", () => {
    // Lunes 08:00 UTC, con una tz inválida que cae a UTC.
    expect(isWeeklyInsightSlot(new Date("2026-08-10T08:00:00Z"), "Not/AZone")).toBe(true);
  });
});
