import { describe, it, expect } from "vitest";
import { localize, toTranslatable } from "./i18n.js";

describe("localize", () => {
  it("devuelve '' para valores ausentes", () => {
    expect(localize(null)).toBe("");
    expect(localize(undefined)).toBe("");
  });

  it("un string plano (formato legacy) se devuelve tal cual", () => {
    expect(localize("Hola")).toBe("Hola");
  });

  it("un objeto {locale: texto} devuelve el locale pedido", () => {
    expect(localize({ es: "Hola", en: "Hello" }, "en")).toBe("Hello");
    expect(localize({ es: "Hola", en: "Hello" })).toBe("Hola"); // default 'es'
  });

  it("cae a 'es' si el locale pedido no existe", () => {
    expect(localize({ es: "Hola", en: "Hello" }, "fr")).toBe("Hola");
  });

  it("cae al primer valor disponible si ni el locale pedido ni 'es' existen", () => {
    expect(localize({ en: "Hello" }, "fr")).toBe("Hello");
  });

  it("un objeto vacío devuelve ''", () => {
    expect(localize({})).toBe("");
  });
});

describe("toTranslatable", () => {
  it("envuelve el valor bajo el locale por defecto 'es'", () => {
    expect(toTranslatable("Hola")).toEqual({ es: "Hola" });
  });

  it("envuelve el valor bajo el locale indicado", () => {
    expect(toTranslatable("Hello", "en")).toEqual({ en: "Hello" });
  });
});
