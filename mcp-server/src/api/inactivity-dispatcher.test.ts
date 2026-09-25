import { describe, it, expect } from "vitest";
import { evaluateInactivity, buildInactivityCopy, type InactivityKind } from "./inactivity-dispatcher.js";
import { pickLocalized } from "./push-sender.js";

const NONE = new Set<InactivityKind>();

// 2026-08-10T15:00:00Z — jueves, 15:00 UTC. En America/Caracas (UTC-4) son
// las 11:00 (dentro de la ventana [9,21)); en un huso +9 serían las 00:00
// del día siguiente (fuera de ventana), útil para el test de la hora local.
const NOW = new Date("2026-08-10T15:00:00Z");

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 60 * 60 * 1000);
}

describe("evaluateInactivity", () => {
  it("no dispara antes de 24h", () => {
    expect(
      evaluateInactivity({ createdAt: hoursAgo(10), now: NOW, timeZone: "America/Caracas", alreadySent: NONE }),
    ).toBeNull();
  });

  it("dispara inactivity_24h entre 24h y 72h", () => {
    expect(
      evaluateInactivity({ createdAt: hoursAgo(30), now: NOW, timeZone: "America/Caracas", alreadySent: NONE }),
    ).toBe("inactivity_24h");
  });

  it("no repite inactivity_24h si ya se envió", () => {
    const sent = new Set<InactivityKind>(["inactivity_24h"]);
    expect(
      evaluateInactivity({ createdAt: hoursAgo(30), now: NOW, timeZone: "America/Caracas", alreadySent: sent }),
    ).toBeNull();
  });

  it("dispara inactivity_72h entre 72h y 7 días, nunca el de 24h", () => {
    expect(
      evaluateInactivity({ createdAt: hoursAgo(80), now: NOW, timeZone: "America/Caracas", alreadySent: NONE }),
    ).toBe("inactivity_72h");
  });

  it("no repite inactivity_72h si ya se envió", () => {
    const sent = new Set<InactivityKind>(["inactivity_72h"]);
    expect(
      evaluateInactivity({ createdAt: hoursAgo(80), now: NOW, timeZone: "America/Caracas", alreadySent: sent }),
    ).toBeNull();
  });

  it("no dispara nada a partir de 7 días", () => {
    expect(
      evaluateInactivity({ createdAt: hoursAgo(8 * 24), now: NOW, timeZone: "America/Caracas", alreadySent: NONE }),
    ).toBeNull();
  });

  it("respeta la ventana horaria local: fuera de [9,21) no dispara aunque toque el tramo", () => {
    // 15:00 UTC + huso +9 (Asia/Tokyo) = 00:00 del día siguiente, fuera de ventana.
    expect(
      evaluateInactivity({ createdAt: hoursAgo(30), now: NOW, timeZone: "Asia/Tokyo", alreadySent: NONE }),
    ).toBeNull();
  });

  it("respeta la ventana horaria local: dentro de [9,21) sí dispara", () => {
    // 15:00 UTC en America/Caracas (UTC-4) = 11:00, dentro de ventana.
    expect(
      evaluateInactivity({ createdAt: hoursAgo(30), now: NOW, timeZone: "America/Caracas", alreadySent: NONE }),
    ).toBe("inactivity_24h");
  });

  it("cae a UTC con una zona horaria basura, sin romper", () => {
    // 15:00 UTC está dentro de [9,21) en UTC → dispara igual con el fallback.
    expect(
      evaluateInactivity({ createdAt: hoursAgo(30), now: NOW, timeZone: "Not/AZone", alreadySent: NONE }),
    ).toBe("inactivity_24h");
  });
});

describe("buildInactivityCopy", () => {
  it("inactivity_24h con día resuelto usa el copy con foco, en ambos idiomas", () => {
    const c = buildInactivityCopy("inactivity_24h", "Lunes: Empuje");
    expect(pickLocalized(c.title, "es")).toContain("primer entreno");
    expect(pickLocalized(c.title, "en")).toContain("first workout");
    expect(pickLocalized(c.body, "es")).toBe("Hoy toca Lunes: Empuje. Son unos minutos, empieza ahora.");
    expect(pickLocalized(c.body, "en")).toBe(
      "Today's session: Lunes: Empuje. It only takes a few minutes — start now.",
    );
  });

  it("inactivity_24h sin día resuelto cae al copy genérico, en ambos idiomas", () => {
    const c = buildInactivityCopy("inactivity_24h", null);
    expect(pickLocalized(c.body, "es")).toBe("Tienes una sesión corta lista. Son unos minutos, empieza ahora.");
    expect(pickLocalized(c.body, "en")).toBe(
      "You have a short session ready. It only takes a few minutes — start now.",
    );
  });

  it("inactivity_72h con día resuelto usa el copy con foco, en ambos idiomas", () => {
    const c = buildInactivityCopy("inactivity_72h", "Martes: Tirón");
    expect(pickLocalized(c.title, "es")).toContain("Retomamos");
    expect(pickLocalized(c.title, "en")).toContain("get back to it");
    expect(pickLocalized(c.body, "es")).toBe("Martes: Tirón. Diez minutos bastan para volver a la rutina.");
    expect(pickLocalized(c.body, "en")).toBe("Martes: Tirón. Ten minutes is enough to get back on track.");
  });

  it("inactivity_72h sin día resuelto cae al copy genérico, en ambos idiomas", () => {
    const c = buildInactivityCopy("inactivity_72h", null);
    expect(pickLocalized(c.body, "es")).toBe("Diez minutos bastan para volver a la rutina. Tu programa te espera.");
    expect(pickLocalized(c.body, "en")).toBe("Ten minutes is enough to get back on track. Your program is waiting.");
  });

  it("un idioma sin reconocer cae a es (pickLocalized), como haría normalizePushLanguage", () => {
    const c = buildInactivityCopy("inactivity_24h", null);
    expect(pickLocalized(c.title, "es")).toBe("Tu primer entreno te espera 💪");
  });
});
