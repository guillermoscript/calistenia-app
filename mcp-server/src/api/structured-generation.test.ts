import { describe, it, expect } from "vitest";
import { normalizeUsage, sumStepsUsage } from "./structured-generation.js";

describe("normalizeUsage", () => {
  it("lee los nombres de campo de AI SDK v5+ (inputTokens/outputTokens/totalTokens)", () => {
    expect(normalizeUsage({ inputTokens: 10, outputTokens: 20, totalTokens: 35 })).toEqual({
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 35,
    });
  });

  it("el totalTokens reportado por el SDK gana sobre el derivado, aunque no cuadre con la suma", () => {
    expect(normalizeUsage({ inputTokens: 10, outputTokens: 20, totalTokens: 999 })).toEqual({
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 999,
    });
  });

  it("cae a los nombres legacy (promptTokens/completionTokens) y deriva el total", () => {
    expect(normalizeUsage({ promptTokens: 5, completionTokens: 7 })).toEqual({
      prompt_tokens: 5,
      completion_tokens: 7,
      total_tokens: 12,
    });
  });

  it("también acepta snake_case (prompt_tokens/completion_tokens/total_tokens)", () => {
    expect(normalizeUsage({ prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 })).toEqual({
      prompt_tokens: 3,
      completion_tokens: 4,
      total_tokens: 7,
    });
  });

  it("campos ausentes quedan undefined y no se deriva total", () => {
    expect(normalizeUsage({})).toEqual({
      prompt_tokens: undefined,
      completion_tokens: undefined,
      total_tokens: undefined,
    });
  });

  it("input null o undefined se trata como objeto vacío", () => {
    expect(normalizeUsage(null)).toEqual({
      prompt_tokens: undefined,
      completion_tokens: undefined,
      total_tokens: undefined,
    });
    expect(normalizeUsage(undefined)).toEqual({
      prompt_tokens: undefined,
      completion_tokens: undefined,
      total_tokens: undefined,
    });
  });

  it("deriva el total cuando falta uno de los dos componentes (el otro cuenta como 0)", () => {
    expect(normalizeUsage({ inputTokens: 15 })).toEqual({
      prompt_tokens: 15,
      completion_tokens: undefined,
      total_tokens: 15,
    });
  });

  it("ignora valores no numéricos (p.ej. strings) y sigue buscando en el siguiente nombre de campo", () => {
    // inputTokens llega como string -> no cuenta como número válido, y no hay
    // promptTokens/prompt_tokens de respaldo, así que prompt queda undefined.
    expect(normalizeUsage({ inputTokens: "10" })).toEqual({
      prompt_tokens: undefined,
      completion_tokens: undefined,
      total_tokens: undefined,
    });
  });
});

describe("sumStepsUsage", () => {
  it("suma inputTokens/outputTokens y cuenta toolCalls a través de varios steps", () => {
    const result = sumStepsUsage([
      { usage: { inputTokens: 2, outputTokens: 3 }, toolCalls: [{}] },
      { usage: { inputTokens: 5, outputTokens: 1 }, toolCalls: [{}, {}] },
    ]);
    expect(result).toEqual({
      usage: { prompt_tokens: 7, completion_tokens: 4, total_tokens: 11 },
      toolCalls: 3,
    });
  });

  it("un step sin usage o sin toolCalls cuenta como 0", () => {
    const result = sumStepsUsage([{}, { usage: { inputTokens: 4 } }]);
    expect(result).toEqual({
      usage: { prompt_tokens: 4, completion_tokens: 0, total_tokens: 4 },
      toolCalls: 0,
    });
  });

  it("un array de steps vacío da todo en cero", () => {
    expect(sumStepsUsage([])).toEqual({
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      toolCalls: 0,
    });
  });
});
