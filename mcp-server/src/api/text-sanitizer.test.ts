import { describe, it, expect } from "vitest";
import {
  sanitizeAiText,
  sanitizeFoodTexts,
  sanitizeQualityTexts,
  sanitizeMealAnalysis,
} from "./text-sanitizer.js";

describe("sanitizeAiText", () => {
  it("elimina la cita real de la captura del issue #336 (link markdown con dominio dentro de paréntesis)", () => {
    const input =
      "Una banana mediana pesa unos 118g según la tabla de referencia ([files.givewell.org](https://files.givewell.org/files/DWDA%202009/Interventions/Nutrition/banana-weights.pdf?utm_source=openai))";
    expect(sanitizeAiText(input)).toBe(
      "Una banana mediana pesa unos 118g según la tabla de referencia"
    );
  });

  it("conserva el texto de un link markdown cuando no es una URL/dominio", () => {
    expect(sanitizeAiText("porción según [tabla nutricional](https://example.com/t.pdf) estándar")).toBe(
      "porción según tabla nutricional estándar"
    );
  });

  it("elimina URLs sueltas con y sin esquema", () => {
    expect(sanitizeAiText("ver https://example.com/datos?utm_source=openai para más info")).toBe(
      "ver para más info"
    );
    expect(sanitizeAiText("fuente: www.fatsecret.com valores por 100g")).toBe(
      "fuente: valores por 100g"
    );
  });

  it("elimina paréntesis que quedan vacíos o con puntuación residual tras el strip", () => {
    expect(sanitizeAiText("59g estimados (https://a.dev/x.pdf)")).toBe("59g estimados");
    expect(sanitizeAiText("59g estimados ([a.dev](https://a.dev/x), [b.org](https://b.org/y))")).toBe(
      "59g estimados"
    );
  });

  it("no altera una nota legítima", () => {
    const nota = "filete mediano visible junto al tenedor";
    expect(sanitizeAiText(nota, 120)).toBe(nota);
    const conParens = "1 vaso estándar (330ml) lleno";
    expect(sanitizeAiText(conParens, 120)).toBe(conParens);
  });

  it("capea en límite de palabra con elipsis", () => {
    const larga =
      "estimación basada en el tamaño relativo del plato hondo comparado con la referencia visual del tenedor y la palma de la mano del comensal";
    const out = sanitizeAiText(larga, 120);
    expect(out.length).toBeLessThanOrEqual(121); // 120 + elipsis tras recorte en palabra
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  it("colapsa espacios y recorta puntuación huérfana en los extremos", () => {
    expect(sanitizeAiText("  porción   media ,")).toBe("porción media");
  });
});

describe("sanitizeFoodTexts", () => {
  it("limpia portionNote y capea a ~120 chars", () => {
    const food = {
      name: "Banana",
      portionNote:
        "59g, la mitad de una banana mediana de 118g según ([files.givewell.org](https://files.givewell.org/banana.pdf?utm_source=openai))",
    };
    sanitizeFoodTexts(food);
    expect(food.portionNote).toBe("59g, la mitad de una banana mediana de 118g según");
    expect(food.portionNote).not.toMatch(/https?:|\[|\]/);
  });
});

describe("sanitizeQualityTexts", () => {
  it("limpia message, breakdown y suggestion (incl. alternatives[].portionNote)", () => {
    const quality = {
      score: "C",
      message: "Buena fuente de potasio ([oms.int](https://oms.int/x))",
      breakdown: {
        positives: ["Alto en fibra (www.fda.gov/fiber)"],
        negatives: ["Azúcares simples según https://pubmed.ncbi.nlm.nih.gov/123"],
        summary: "Comida aceptable [fuente](https://a.dev)",
      },
      suggestion: {
        text: "Añade proteína ([usda.gov](https://usda.gov/p))",
        alternatives: [{ name: "Yogur griego", portionNote: "150g ([usda.gov](https://usda.gov/y))" }],
      },
    };
    sanitizeQualityTexts(quality);
    expect(quality.message).toBe("Buena fuente de potasio");
    expect(quality.breakdown.positives[0]).toBe("Alto en fibra");
    expect(quality.breakdown.negatives[0]).toBe("Azúcares simples según");
    expect(quality.breakdown.summary).toBe("Comida aceptable fuente");
    expect(quality.suggestion.text).toBe("Añade proteína");
    expect(quality.suggestion.alternatives[0].portionNote).toBe("150g");
  });
});

describe("sanitizeMealAnalysis", () => {
  it("recorre foods, meal_description y quality; tolera quality null", () => {
    const analysis = {
      foods: [
        { name: "Banana", portionNote: "59g ([a.dev](https://a.dev))" },
        { name: "Avena", portionNote: "taza llena" },
      ],
      meal_description: "Desayuno de avena con banana (www.example.com)",
      quality: null,
    };
    sanitizeMealAnalysis(analysis);
    expect(analysis.foods[0].portionNote).toBe("59g");
    expect(analysis.foods[1].portionNote).toBe("taza llena");
    expect(analysis.meal_description).toBe("Desayuno de avena con banana");
  });
});
