import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveTier } from "./model-resolver.js";

// Stub the three provider SDKs so resolveModel() never touches network/env.
// Each factory returns a plain object tagging its provider — we only assert
// on the ResolvedModel envelope's `.name`/`.provider`, never call `.model`.
vi.mock("@ai-sdk/anthropic", () => {
  const anthropic = (id: string) => ({ id, _provider: "anthropic" });
  anthropic.tools = {};
  return { anthropic };
});
vi.mock("@ai-sdk/google", () => {
  const google = (id: string) => ({ id, _provider: "google" });
  google.tools = {};
  return { google };
});
vi.mock("@ai-sdk/openai", () => {
  const openai = (id: string) => ({ id, _provider: "openai" });
  openai.tools = {};
  return { openai };
});

describe("resolveTier", () => {
  it("mapea 'pro' y 'premium' a la tier 'pro'", () => {
    expect(resolveTier({ tier: "pro" })).toBe("pro");
    expect(resolveTier({ tier: "premium" })).toBe("pro");
  });

  it("cualquier otro valor, ausente o nulo cae a 'free'", () => {
    expect(resolveTier({ tier: "free" })).toBe("free");
    expect(resolveTier({ tier: "enterprise" })).toBe("free");
    expect(resolveTier({})).toBe("free");
    expect(resolveTier(null)).toBe("free");
    expect(resolveTier(undefined)).toBe("free");
  });
});

// Shape of ./config.js's default export, mocked per test case.
interface MockConfig {
  providers: { anthropic: boolean; google: boolean; openai: boolean };
  defaultProvider: string;
  defaultModelFree: string;
  defaultModelPro: string;
}

async function loadResolveModel(config: MockConfig) {
  vi.resetModules();
  vi.doMock("./config.js", () => ({ default: config }));
  const mod = await import("./model-resolver.js");
  return mod.resolveModel;
}

describe("resolveModel", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("el override por prefijo elige el provider correcto (claude→anthropic, gpt→openai, gemini→google)", async () => {
    let resolveModel = await loadResolveModel({
      providers: { anthropic: true, google: false, openai: false },
      defaultProvider: "",
      defaultModelFree: "claude-haiku-9",
      defaultModelPro: "",
    });
    expect(resolveModel("free")).toMatchObject({ name: "claude-haiku-9", provider: "anthropic" });

    resolveModel = await loadResolveModel({
      providers: { anthropic: false, google: false, openai: true },
      defaultProvider: "",
      defaultModelFree: "gpt-9-mini",
      defaultModelPro: "",
    });
    expect(resolveModel("free")).toMatchObject({ name: "gpt-9-mini", provider: "openai" });

    resolveModel = await loadResolveModel({
      providers: { anthropic: false, google: true, openai: false },
      defaultProvider: "",
      defaultModelFree: "gemini-9-flash",
      defaultModelPro: "",
    });
    expect(resolveModel("free")).toMatchObject({ name: "gemini-9-flash", provider: "google" });
  });

  it("ignora el override si su provider no está habilitado y cae a los candidatos por defecto", async () => {
    const resolveModel = await loadResolveModel({
      providers: { anthropic: false, google: true, openai: false },
      defaultProvider: "",
      defaultModelFree: "claude-haiku-9", // anthropic no habilitado
      defaultModelPro: "",
    });
    // Cae al MODEL_MAP.free por orden: anthropic(off) → google(on)
    expect(resolveModel("free")).toMatchObject({ name: "gemini-2.5-flash", provider: "google" });
  });

  it("un override cuyo prefijo no matchea ningún provider conocido cae a los candidatos", async () => {
    const resolveModel = await loadResolveModel({
      providers: { anthropic: false, google: false, openai: true },
      defaultProvider: "",
      defaultModelFree: "llama-3-8b",
      defaultModelPro: "",
    });
    expect(resolveModel("free")).toMatchObject({ name: "gpt-5.4-mini", provider: "openai" });
  });

  it("sin override, defaultProvider habilitado se prefiere sobre el orden de MODEL_MAP", async () => {
    const resolveModel = await loadResolveModel({
      providers: { anthropic: true, google: true, openai: true },
      defaultProvider: "google",
      defaultModelFree: "",
      defaultModelPro: "",
    });
    // Orden natural de MODEL_MAP.free empieza en anthropic, pero defaultProvider gana.
    expect(resolveModel("free")).toMatchObject({ name: "gemini-2.5-flash", provider: "google" });
  });

  it("si defaultProvider no está habilitado, cae al primer candidato habilitado en orden de MODEL_MAP", async () => {
    const resolveModel = await loadResolveModel({
      providers: { anthropic: true, google: false, openai: true },
      defaultProvider: "google",
      defaultModelFree: "",
      defaultModelPro: "",
    });
    expect(resolveModel("free")).toMatchObject({ name: "claude-haiku-4-5", provider: "anthropic" });
  });

  it("recorre los candidatos de la tier hasta encontrar un provider habilitado", async () => {
    const resolveModel = await loadResolveModel({
      providers: { anthropic: false, google: false, openai: true },
      defaultProvider: "",
      defaultModelFree: "",
      defaultModelPro: "",
    });
    expect(resolveModel("free")).toMatchObject({ name: "gpt-5.4-mini", provider: "openai" });
  });

  it("tier 'pro' usa su propio orden de candidatos (anthropic → openai → google)", async () => {
    const resolveModel = await loadResolveModel({
      providers: { anthropic: false, google: true, openai: true },
      defaultProvider: "",
      defaultModelFree: "",
      defaultModelPro: "",
    });
    expect(resolveModel("pro")).toMatchObject({ name: "gpt-5.4", provider: "openai" });
  });

  it("lanza si ningún provider está habilitado", async () => {
    const resolveModel = await loadResolveModel({
      providers: { anthropic: false, google: false, openai: false },
      defaultProvider: "",
      defaultModelFree: "",
      defaultModelPro: "",
    });
    expect(() => resolveModel("free")).toThrow(/No AI provider configured/);
  });
});
