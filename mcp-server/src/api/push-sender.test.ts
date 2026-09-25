import { describe, it, expect } from "vitest";
import { normalizePushLanguage, pickLocalized, isValidPushText } from "./push-sender.js";

describe("normalizePushLanguage", () => {
  it("reconoce 'en' en cualquier capitalización o variante regional", () => {
    expect(normalizePushLanguage("en")).toBe("en");
    expect(normalizePushLanguage("EN")).toBe("en");
    expect(normalizePushLanguage("en-US")).toBe("en");
    expect(normalizePushLanguage("En-GB")).toBe("en");
  });

  it("cualquier otra cosa (incl. vacío/undefined/otro idioma) cae a 'es'", () => {
    expect(normalizePushLanguage("es")).toBe("es");
    expect(normalizePushLanguage("pt")).toBe("es");
    expect(normalizePushLanguage("")).toBe("es");
    expect(normalizePushLanguage(undefined)).toBe("es");
    expect(normalizePushLanguage(null)).toBe("es");
    expect(normalizePushLanguage(123)).toBe("es");
  });
});

describe("pickLocalized", () => {
  it("un string pasa tal cual, sin importar el idioma pedido", () => {
    expect(pickLocalized("hola", "es")).toBe("hola");
    expect(pickLocalized("hola", "en")).toBe("hola");
  });

  it("un objeto {es,en} devuelve el idioma pedido", () => {
    expect(pickLocalized({ es: "hola", en: "hi" }, "es")).toBe("hola");
    expect(pickLocalized({ es: "hola", en: "hi" }, "en")).toBe("hi");
  });

  it("si falta el idioma pedido, cae a es, luego a en", () => {
    expect(pickLocalized({ en: "hi" }, "es")).toBe("hi");
    expect(pickLocalized({ es: "hola" } as any, "en")).toBe("hola");
  });

  it("undefined da cadena vacía, nunca 'undefined'", () => {
    expect(pickLocalized(undefined, "es")).toBe("");
  });
});

describe("isValidPushText", () => {
  it("acepta un string no vacío", () => {
    expect(isValidPushText("hola")).toBe(true);
  });

  it("rechaza un string vacío o solo espacios", () => {
    expect(isValidPushText("")).toBe(false);
    expect(isValidPushText("   ")).toBe(false);
  });

  it("acepta un objeto con al menos un es/en no vacío", () => {
    expect(isValidPushText({ es: "hola" })).toBe(true);
    expect(isValidPushText({ en: "hi" })).toBe(true);
    expect(isValidPushText({ es: "hola", en: "hi" })).toBe(true);
  });

  it("rechaza un objeto sin ningún es/en no vacío", () => {
    expect(isValidPushText({})).toBe(false);
    expect(isValidPushText({ es: "" })).toBe(false);
    expect(isValidPushText({ es: "", en: "" })).toBe(false);
  });

  it("rechaza un objeto cuyos valores es/en no son strings", () => {
    expect(isValidPushText({ es: 123 })).toBe(false);
    expect(isValidPushText({ en: null })).toBe(false);
  });

  it("rechaza cualquier otra cosa", () => {
    expect(isValidPushText(null)).toBe(false);
    expect(isValidPushText(undefined)).toBe(false);
    expect(isValidPushText(42)).toBe(false);
    expect(isValidPushText(["hola"])).toBe(false);
  });
});
