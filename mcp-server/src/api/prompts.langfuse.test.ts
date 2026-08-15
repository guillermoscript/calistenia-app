import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Mustache from "mustache";

// Import estático, sin mock y sin claves en el entorno: da acceso al FALLBACKS
// REAL. Se usa como plantilla "remota" para que este test no pueda quedarse con
// una copia rancia si la plantilla cambia.
import { FALLBACKS as REAL_FALLBACKS } from "./prompts.js";

const FALLBACK_TEMPLATE = REAL_FALLBACKS["meal-plan-generator-user"];

/**
 * Cobertura de la rama de LANGFUSE de `compilePrompt`.
 *
 * `prompts.test.ts` solo ejercita el fallback local: sin claves en el entorno,
 * el cliente de Langfuse es `null` y el `if (langfuse)` nunca se entra. Es decir,
 * el camino que corre EN PRODUCCIÓN — fetch → guard → `fetched.compile()` →
 * escaneo posterior → devolver `langfusePrompt` — se quedaba sin probar.
 *
 * Aquí se mockea el módulo `langfuse` y se reimporta `prompts.js` con las claves
 * puestas, para que el cliente exista. El `compile()` del doble usa el MISMO
 * `mustache.render` que `TextPromptClient.compile()` usa de verdad
 * (langfuse-core, `lib/index.cjs.js`), así que la sustitución es fiel.
 */

interface RemotePrompt {
  template: string;
  name?: string;
  version?: number;
  /** Fuerza una salida distinta de la de mustache, para probar el guard posterior. */
  compileOverride?: (vars: Record<string, string>) => string;
}

async function loadWithRemote(remote: RemotePrompt | Error) {
  vi.resetModules();
  process.env.LANGFUSE_SECRET_KEY = "sk-test";
  process.env.LANGFUSE_PUBLIC_KEY = "pk-test";

  vi.doMock("langfuse", () => ({
    Langfuse: class {
      async getPrompt(name: string) {
        if (remote instanceof Error) throw remote;
        return {
          name: remote.name ?? name,
          version: remote.version ?? 1,
          prompt: remote.template,
          compile: (vars: Record<string, string>) =>
            remote.compileOverride
              ? remote.compileOverride(vars)
              : Mustache.render(remote.template, vars ?? {}),
        };
      }
    },
  }));

  return import("./prompts.js");
}

const VARS = {
  pendingLabel: "almuerzo, cena",
  macros: "1200kcal, 90g prot, 130g carbs, 40g grasa",
  pantryTagging: 'El usuario YA TIENE en casa: pollo & arroz "integral".',
};

let errors: string[];
let spy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errors = [];
  spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  spy.mockRestore();
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  vi.doUnmock("langfuse");
});

describe("compilePrompt — rama de Langfuse", () => {
  it("compila la plantilla remota y devuelve su nombre y versión", async () => {
    const { compilePrompt } = await loadWithRemote({
      template: FALLBACK_TEMPLATE,
      name: "meal-plan-generator-user",
      version: 7,
    });

    const res = await compilePrompt("meal-plan-generator-user", VARS);

    expect(res.usedFallback).toBe(false);
    expect(res.langfusePrompt).toEqual({ name: "meal-plan-generator-user", version: 7 });
    expect(res.prompt).toContain("Diseña comidas para: almuerzo, cena.");
    expect(res.prompt).toContain('pollo & arroz "integral"');
    expect(res.prompt).not.toContain("&amp;");
    expect(errors).toEqual([]);
  });

  it("la rama remota y el fallback producen EXACTAMENTE los mismos bytes", async () => {
    // El criterio de aceptación de #298 que hasta ahora solo estaba afirmado de
    // palabra: con la misma plantilla en los dos sitios, las dos ramas coinciden.
    const remoteMod = await loadWithRemote({ template: FALLBACK_TEMPLATE });
    const viaLangfuse = await remoteMod.compilePrompt("meal-plan-generator-user", VARS);

    vi.resetModules();
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    vi.doUnmock("langfuse");
    const localMod = await import("./prompts.js");
    const viaFallback = await localMod.compilePrompt("meal-plan-generator-user", VARS);

    expect(viaLangfuse.usedFallback).toBe(false);
    expect(viaFallback.usedFallback).toBe(true);
    expect(viaLangfuse.prompt).toBe(viaFallback.prompt);
  });

  it("cae al fallback si a la plantilla remota le falta una variable", async () => {
    const { compilePrompt } = await loadWithRemote({
      template: "Diseña comidas para: {{{pendingLabel}}}. {{{macros}}}",
      version: 3,
    });

    const res = await compilePrompt("meal-plan-generator-user", VARS);

    expect(errors.join("\n")).toContain("sobran variables [pantryTagging]");
    expect(res.usedFallback).toBe(true);
    expect(res.langfusePrompt).toBeUndefined();
    // Y sirve el fallback bueno, no la plantilla remota mutilada.
    expect(res.prompt).toContain("Cada comida debe traer su receta");
  });

  it("cae al fallback si alguien renombra una variable en la UI de Langfuse", async () => {
    const { compilePrompt } = await loadWithRemote({
      template: "{{{pendingLabel}}} {{{macros}}} {{{despensa}}}",
      version: 4,
    });

    const res = await compilePrompt("meal-plan-generator-user", VARS);

    expect(errors.join("\n")).toContain("faltan variables [despensa]");
    expect(res.usedFallback).toBe(true);
  });

  it("cae al fallback si la plantilla remota usa doble llave (escaparía HTML)", async () => {
    const { compilePrompt } = await loadWithRemote({
      template: "{{pendingLabel}} {{{macros}}} {{{pantryTagging}}}",
      version: 5,
    });

    const res = await compilePrompt("meal-plan-generator-user", VARS);

    expect(errors.join("\n")).toContain("usa doble llave");
    expect(res.usedFallback).toBe(true);
    expect(res.prompt).not.toContain("&amp;");
  });

  it("cae al fallback si un 404 de Langfuse tumba el fetch", async () => {
    const { compilePrompt } = await loadWithRemote(
      new Error("Prompt not found: 'meal-plan-generator-user' with label 'production'")
    );

    const res = await compilePrompt("meal-plan-generator-user", VARS);

    expect(errors.join("\n")).toContain("Failed to fetch");
    expect(res.usedFallback).toBe(true);
    expect(res.prompt).toContain("Diseña comidas para: almuerzo, cena.");
  });

  it("el guard posterior atrapa llaves sin sustituir que el guard previo no vio", async () => {
    // Red por si el motor de compilación de Langfuse dejara de coincidir con
    // mustache: la plantilla pasa la auditoría, pero el compilado sale con {{.
    const { compilePrompt } = await loadWithRemote({
      template: "{{{pendingLabel}}} {{{macros}}} {{{pantryTagging}}}",
      version: 6,
      compileOverride: () => "quedó un {{hueco}} sin sustituir",
    });

    const res = await compilePrompt("meal-plan-generator-user", VARS);

    expect(errors.join("\n")).toContain("quedaron llaves sin sustituir");
    expect(res.usedFallback).toBe(true);
    expect(res.prompt).not.toContain("{{hueco}}");
  });

  it("un valor inyectado con llaves NO se confunde con una etiqueta sin sustituir", async () => {
    const { compilePrompt } = await loadWithRemote({
      template: "{{{pendingLabel}}} {{{macros}}} {{{pantryTagging}}}",
      version: 8,
    });

    const res = await compilePrompt("meal-plan-generator-user", {
      ...VARS,
      pantryTagging: "un alimento llamado {{raro}}",
    });

    expect(res.usedFallback).toBe(false);
    expect(res.prompt).toContain("{{raro}}");
    expect(errors).toEqual([]);
  });
});
