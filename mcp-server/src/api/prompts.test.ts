import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { FALLBACKS, compilePrompt } from "./prompts.js";
import { dailyMealPlanVars } from "./meal-plan-generator.js";
import type { PantrySnapshotItem } from "./pantry-plan-generator.js";

// Estos tests corren sin credenciales de Langfuse, así que `compilePrompt` toma
// la rama del fallback local. Es justo la que importa: el criterio de #298 es
// que las dos ramas produzcan los MISMOS bytes, de modo que probar el fallback
// prueba también qué debe contener la plantilla subida a Langfuse.

/**
 * El mensaje `user` tal y como lo construía `generateDailyMealPlan` ANTES de la
 * migración (`meal-plan-generator.ts:103-109` en 880e2f0). Copiado literal a
 * propósito: es el oráculo contra el que se compara el compilado.
 */
function legacyDailyPrompt(input: {
  pendingLabel: string;
  remainingCalories: number;
  remainingProtein: number;
  remainingCarbs: number;
  remainingFat: number;
  taggingBlock: string;
}): string {
  return `Diseña comidas para: ${input.pendingLabel}.
Macros restantes: ${input.remainingCalories}kcal, ${input.remainingProtein}g prot, ${input.remainingCarbs}g carbs, ${input.remainingFat}g grasa.
Usa alimentos comunes, porciones realistas, en español. Sé conciso.

${input.taggingBlock}

Cada comida debe traer su receta con la lista completa de ingredientes y su etiqueta from.`;
}

const LEGACY_NO_PANTRY = `El usuario no tiene inventario registrado: etiqueta TODOS los ingredientes con from:"buy".`;

const PANTRY: PantrySnapshotItem[] = [
  {
    name: "pechuga de pollo",
    name_normalized: "pechuga de pollo",
    category: "proteina",
    quantity: 2,
    unit: "kg",
    expiry_estimate: null,
  },
  {
    // Comillas y `&` a propósito: son justo lo que `{{x}}` habría escapado.
    name: 'arroz "integral" & quinoa',
    name_normalized: "arroz integral quinoa",
    category: "carbohidrato",
    quantity: null,
    unit: null,
    expiry_estimate: null,
  },
];

const LEGACY_WITH_PANTRY = `El usuario YA TIENE en casa (esto NO limita el plan, es solo para etiquetar):
- pechuga de pollo [proteina]: 2 kg
- arroz "integral" & quinoa [carbohidrato]: cantidad desconocida

Regla: un ingrediente lleva from:"pantry" solo si aparece arriba en cantidad suficiente; en cualquier otro caso lleva from:"buy".`;

describe("meal-plan-generator-user — paridad byte a byte con el código pre-#298", () => {
  it("sin inventario produce exactamente el mismo string que el template literal", async () => {
    const vars = dailyMealPlanVars({
      remainingCalories: 1200,
      remainingProtein: 90,
      remainingCarbs: 130,
      remainingFat: 40,
      loggedMealTypes: ["desayuno"],
    });

    const { prompt, usedFallback } = await compilePrompt("meal-plan-generator-user", vars);

    expect(usedFallback).toBe(true);
    expect(prompt).toBe(
      legacyDailyPrompt({
        pendingLabel: "almuerzo, cena, snack",
        remainingCalories: 1200,
        remainingProtein: 90,
        remainingCarbs: 130,
        remainingFat: 40,
        taggingBlock: LEGACY_NO_PANTRY,
      })
    );
  });

  it("con inventario produce exactamente el mismo string, sin escapar comillas ni &", async () => {
    const vars = dailyMealPlanVars({
      remainingCalories: 800,
      remainingProtein: 55,
      remainingCarbs: 70,
      remainingFat: 25,
      loggedMealTypes: [],
      pantryItems: PANTRY,
    });

    const { prompt } = await compilePrompt("meal-plan-generator-user", vars);

    expect(prompt).toBe(
      legacyDailyPrompt({
        pendingLabel: "desayuno, almuerzo, cena, snack",
        remainingCalories: 800,
        remainingProtein: 55,
        remainingCarbs: 70,
        remainingFat: 25,
        taggingBlock: LEGACY_WITH_PANTRY,
      })
    );
    // La trampa concreta que motivó el triple-llave: `{{x}}` habría emitido
    // `from:&quot;pantry&quot;` y `&amp;`, y ningún test de tipos lo vería.
    expect(prompt).toContain('from:"pantry"');
    expect(prompt).toContain('arroz "integral" & quinoa');
    expect(prompt).not.toContain("&quot;");
    expect(prompt).not.toContain("&amp;");
  });

  it("todas las comidas logueadas caen en el label de snack adicional", async () => {
    const vars = dailyMealPlanVars({
      remainingCalories: 200,
      remainingProtein: 10,
      remainingCarbs: 20,
      remainingFat: 5,
      loggedMealTypes: ["desayuno", "almuerzo", "cena", "snack"],
    });
    expect(vars.pendingLabel).toBe("snack o comida adicional");
    const { prompt } = await compilePrompt("meal-plan-generator-user", vars);
    expect(prompt.startsWith("Diseña comidas para: snack o comida adicional.")).toBe(true);
  });

  it("no supera las 3 variables (criterio de aceptación de #298)", () => {
    const vars = dailyMealPlanVars({
      remainingCalories: 1,
      remainingProtein: 1,
      remainingCarbs: 1,
      remainingFat: 1,
      loggedMealTypes: [],
    });
    expect(Object.keys(vars)).toHaveLength(3);
  });
});

describe("guard de compilePrompt", () => {
  let errors: string[];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errors = [];
    spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });
  });
  afterEach(() => spy.mockRestore());

  const withFallback = async (
    template: string,
    vars: Record<string, string>
  ): Promise<string> => {
    const key = "__test-prompt__";
    FALLBACKS[key] = template;
    try {
      const { prompt } = await compilePrompt(key, vars);
      return prompt;
    } finally {
      delete FALLBACKS[key];
    }
  };

  it("compila una plantilla válida", async () => {
    expect(await withFallback("Hola {{{a}}}!", { a: "mundo" })).toBe("Hola mundo!");
    expect(errors).toEqual([]);
  });

  it("rechaza una variable que falta en vez de dejar un hueco vacío", async () => {
    // Sin guard, mustache devolvería "Hola !" — un bloque entero de contexto
    // desaparecido en silencio, que es el fallo que #298 quiere evitar.
    const out = await withFallback("Hola {{{a}}} y {{{b}}}!", { a: "mundo" });
    expect(errors.join("\n")).toContain("faltan variables [b]");
    expect(out).toBe("Hola {{{a}}} y {{{b}}}!"); // plantilla cruda: fallo visible
  });

  it("rechaza una variable de más (típico renombre en la UI de Langfuse)", async () => {
    await withFallback("Hola {{{a}}}!", { a: "mundo", viejo: "x" });
    expect(errors.join("\n")).toContain("sobran variables [viejo]");
  });

  it("rechaza la doble llave porque escaparía HTML", async () => {
    await withFallback("Hola {{a}}!", { a: 'di "hola" & adiós' });
    expect(errors.join("\n")).toContain("usa doble llave");
  });

  it("acepta la forma {{&x}}, equivalente a la triple llave", async () => {
    expect(await withFallback("Hola {{&a}}!", { a: "a & b" })).toBe("Hola a & b!");
    expect(errors).toEqual([]);
  });

  it("rechaza secciones: los condicionales van en TypeScript", async () => {
    await withFallback("{{#a}}sí{{/a}}", { a: "1" });
    expect(errors.join("\n")).toContain("secciones o parciales");
  });

  it("rechaza una plantilla malformada sin lanzar", async () => {
    const out = await withFallback("Hola {{{a}}", { a: "mundo" });
    expect(errors.join("\n")).toContain("malformada");
    expect(out).toBe("Hola {{{a}}");
  });

  it("un valor inyectado con llaves no rompe la compilación", async () => {
    expect(await withFallback("x {{{a}}} y", { a: "{{no soy una etiqueta}}" })).toBe(
      "x {{no soy una etiqueta}} y"
    );
  });

  it("sin fallback local devuelve cadena vacía y lo registra", async () => {
    const { prompt } = await compilePrompt("__no-existe__", {});
    expect(prompt).toBe("");
    expect(errors.join("\n")).toContain("no hay fallback local");
  });
});

describe("FALLBACKS sigue vivo y sincronizado", () => {
  it("la plantilla del piloto está en FALLBACKS con triple llave en las 3 variables", () => {
    const tpl = FALLBACKS["meal-plan-generator-user"];
    expect(tpl).toBeTruthy();
    for (const v of ["pendingLabel", "macros", "pantryTagging"]) {
      expect(tpl).toContain(`{{{${v}}}}`);
    }
  });

  it("ningún fallback sin variables contiene llaves mustache sueltas", () => {
    for (const [name, tpl] of Object.entries(FALLBACKS)) {
      if (name === "meal-plan-generator-user") continue;
      expect(tpl, `${name} tiene {{ }} inesperado`).not.toMatch(/\{\{/);
    }
  });
});
