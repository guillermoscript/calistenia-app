import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { z } from "zod";
import config from "./config.js";
import { resolveModel, resolveWebSearchTool } from "./model-resolver.js";
import { lookupFoodByName } from "./food-lookup.js";

const state = vi.hoisted(() => ({ model: null as unknown, native: vi.fn(() => ({ type: "provider", id: "anthropic.web_search", args: {} })) }));
vi.mock("@ai-sdk/anthropic", () => {
  const anthropic = Object.assign(() => state.model, { tools: { webSearch_20260209: state.native } });
  return { anthropic };
});
vi.mock("./telemetry.js", () => ({ langfuseTelemetry: () => ({ isEnabled: false }) }));
vi.mock("./prompts.js", () => ({ getPromptWithMeta: async () => ({ prompt: "Look up nutrition using Open Food Facts, then web search if needed." }) }));

const originalConfig = { ...config, providers: { ...config.providers } };
const requests: Array<{ url: string; headers: Headers; body: any; signal?: AbortSignal | null }> = [];
let result: unknown;
let unavailable = false;
let stalledMethod = "";
let stalledSignal: AbortSignal | null | undefined;

function installMcpFixture() {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const address = String(url);
    if (address.startsWith("https://world.openfoodfacts.org/")) return Response.json({ products: [] });
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url: address, headers: new Headers(init?.headers), body, signal: init?.signal });
    if (body?.method === stalledMethod) {
      stalledSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
      });
    }
    if (!body) return new Response(null, { status: 405 });
    if (body.id === undefined) return new Response(null, { status: 202 });
    let value: unknown;
    if (body.method === "initialize") {
      value = { protocolVersion: body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1.0" } };
    } else if (body.method === "tools/list") {
      value = { tools: unavailable ? [] : ["web_search", "web_fetch"].map((name) => ({ name, inputSchema: { type: "object" } })) };
    } else if (body.method === "tools/call") {
      value = result ?? { content: [{ type: "text", text: body.params.name === "web_search"
        ? "Nutrition source: https://example.org/food?portion=100g"
        : "https://example.org/food?portion=100g reports 42 kcal, protein 2g, carbs 4g, fat 2g per portion." }] };
    } else throw new Error(`Unexpected MCP request ${body.method}`);
    return Response.json({ jsonrpc: "2.0", id: body.id, result: value });
  }));
}

async function execute(name = "web_search", args: any = { objective: "Find food nutrition", search_queries: ["food nutrition values"] }, abortSignal?: AbortSignal) {
  const tools = resolveWebSearchTool("anthropic", "claude-haiku-4-5");
  return tools[name].execute!(args, { toolCallId: "call-1", messages: [], context: {}, abortSignal });
}

beforeEach(() => {
  requests.length = 0;
  result = undefined;
  unavailable = false;
  stalledMethod = "";
  stalledSignal = undefined;
  Object.assign(config, { ...originalConfig, providers: { anthropic: true, google: false, openai: false }, defaultProvider: "", defaultModelFree: "", defaultModelPro: "", webSearchProvider: "parallel" });
  state.native.mockClear();
  installMcpFixture();
});
afterEach(() => {
  Object.assign(config, originalConfig);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("nutrition search routing", () => {
  it.each([undefined, "", "   "])("loads an unconfigured no-key installation with Parallel search (%j)", async (value) => {
    vi.stubEnv("WEB_SEARCH_PROVIDER", value);
    for (const key of ["ANTHROPIC_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "OPENAI_API_KEY", "PARALLEL_API_KEY"]) vi.stubEnv(key, undefined);
    vi.resetModules();
    const { default: freshConfig } = await import("./config.js");
    const fresh = await import("./model-resolver.js");
    expect(freshConfig.webSearchProvider).toBe("parallel");
    expect(Object.keys(fresh.resolveWebSearchTool("anthropic"))).toEqual(["web_search", "web_fetch"]);
    expect(() => fresh.resolveModel()).toThrow("No AI provider configured");
  });

  it("defaults to anonymous Parallel without changing model selection or overrides", () => {
    expect(Object.keys(resolveWebSearchTool("anthropic"))).toEqual(["web_search", "web_fetch"]);
    expect(resolveModel().name).toBe("claude-haiku-4-5");
    config.defaultModelFree = "claude-explicit-model";
    expect(resolveModel().name).toBe("claude-explicit-model");
    expect(Object.keys(resolveWebSearchTool("anthropic"))).toEqual(["web_search", "web_fetch"]);
    expect(state.native).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0); // no network until the model calls a tool
  });

  it("keeps explicit native choices for all three model providers", () => {
    config.webSearchProvider = "native";
    expect(Object.keys(resolveWebSearchTool("anthropic"))).toEqual(["web_search"]);
    expect(state.native).toHaveBeenCalledWith({ maxUses: 3 });
    expect(Object.keys(resolveWebSearchTool("openai"))).toEqual(["web_search"]);
    expect(Object.keys(resolveWebSearchTool("google"))).toEqual(["google_search"]);
    expect(requests).toHaveLength(0);
  });

  it("honors disabled search and rejects unknown choices without fallback", () => {
    config.webSearchProvider = "none";
    expect(resolveWebSearchTool("anthropic")).toEqual({});
    config.webSearchProvider = "typo";
    expect(() => resolveWebSearchTool("anthropic")).toThrow("WEB_SEARCH_PROVIDER");
    expect(requests).toHaveLength(0);
    expect(state.native).not.toHaveBeenCalled();
  });
});

describe("Streamable HTTP MCP caller", () => {
  it("preserves source URLs, uses the project User-Agent for discovery/search/fetch, and shares a per-request session", async () => {
    const tools = resolveWebSearchTool("anthropic", "claude-haiku-4-5");
    const options = { toolCallId: "call-1", messages: [], context: {} };
    const search = await tools.web_search.execute!({ objective: "Find food nutrition", search_queries: ["food nutrition values"] }, options);
    const page = await tools.web_fetch.execute!({ urls: ["https://example.org/food?portion=100g"] }, options);
    expect(search).toEqual({ content: "Nutrition source: https://example.org/food?portion=100g" });
    expect(page).toEqual({ content: expect.stringContaining("42 kcal") });
    for (const request of requests) {
      expect(request.url).toBe("https://search.parallel.ai/mcp");
      expect(request.headers.get("user-agent")).toContain("calistenia-app");
      expect(request.headers.get("user-agent")).toContain("https://github.com/guillermoscript/calistenia-app");
      expect(request.headers.has("authorization")).toBe(false);
    }
    const calls = requests.filter((r) => r.body?.method === "tools/call");
    expect(calls.map((r) => r.body.params.name)).toEqual(["web_search", "web_fetch"]);
    expect(calls[0].body.params.arguments.session_id).toMatch(/^[\da-f-]{36}$/);
    expect(calls[1].body.params.arguments.session_id).toBe(calls[0].body.params.arguments.session_id);
    expect(calls[0].body.params.arguments.model_name).toBe("claude-haiku-4-5");
    expect(calls[1].body.params.arguments.urls).toEqual(["https://example.org/food?portion=100g"]);
    await execute();
    expect(requests.filter((r) => r.body?.method === "tools/call").at(-1)!.body.params.arguments.session_id).not.toBe(calls[0].body.params.arguments.session_id);
  });

  it.each([
    { isError: true, content: [{ type: "text", text: "quota exhausted" }] },
    { content: [] },
    { content: [{ type: "image", data: "AA==", mimeType: "image/png" }] },
  ])("surfaces tool errors and missing text without switching providers: %j", async (response) => {
    result = response;
    await expect(execute()).rejects.toThrow(/Parallel/);
    expect(state.native).not.toHaveBeenCalled();
  });

  it("rejects missing tools before issuing a call", async () => {
    unavailable = true;
    await expect(execute()).rejects.toThrow("does not advertise web_search");
    expect(requests.some((r) => r.body?.method === "tools/call")).toBe(false);
  });

  it("propagates transport failures without a native fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    await expect(execute()).rejects.toThrow("network unavailable");
    expect(state.native).not.toHaveBeenCalled();
  });

  it.each(["initialize", "tools/list", "tools/call"])("cancels %s requests", async (method) => {
    stalledMethod = method;
    const controller = new AbortController();
    const pending = execute("web_search", undefined, controller.signal);
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(stalledSignal).toBeDefined());
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await rejected;
    expect(stalledSignal!.aborted).toBe(true);
  });

  it("does no network work for an already cancelled tool call", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(execute("web_search", undefined, controller.signal)).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });

  it.each(["initialize", "tools/list", "tools/call"])("bounds %s by the overall 15-second deadline", async (method) => {
    vi.useFakeTimers();
    stalledMethod = method;
    const pending = execute();
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(stalledSignal).toBeDefined());
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(stalledSignal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects non-HTTP URLs before fetch execution", async () => {
    const schema = resolveWebSearchTool("anthropic").web_fetch.inputSchema as z.ZodType;
    expect(await schema.safeParseAsync({ urls: ["file:///etc/passwd"] })).toMatchObject({ success: false });
    expect(await schema.safeParseAsync({ urls: ["javascript:alert(1)"] })).toMatchObject({ success: false });
    expect(requests).toHaveLength(0);
  });
});

it("runs the real food lookup resolver and AI SDK loop through database miss, MCP search/fetch and sanitized output (scripted model)", async () => {
  const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
  const generated = (content: LanguageModelV4GenerateResult["content"], toolCalls = false): LanguageModelV4GenerateResult => ({ content, usage, finishReason: { unified: toolCalls ? "tool-calls" : "stop", raw: undefined }, warnings: [] });
  const call = (toolName: string, input: unknown) => generated([{ type: "tool-call", toolCallId: toolName, toolName, input: JSON.stringify(input) }], true);
  const food = { name: "Alimento", portion: "1 unidad", portionGrams: 21, portionNote: "porción [fuente](https://example.org/food)", calories: 42, protein: 2, carbs: 4, fat: 2, confidence: "medium", category: "otros", tags: [] };
  const model = new MockLanguageModelV4({ doGenerate: [
    call("search_food_database", { query: "Alimento" }),
    call("web_search", { objective: "Find Alimento nutrition", search_queries: ["Alimento nutrition values"] }),
    call("web_fetch", { urls: ["https://example.org/food?portion=100g"] }),
    generated([{ type: "text", text: JSON.stringify(food) }]),
  ] });
  state.model = model;
  const output = await lookupFoodByName({ foodName: "Alimento", tier: "free" });
  expect(output.food).toMatchObject({ calories: 42, portionNote: "porción fuente" });
  expect(output.agent_steps).toBe(4);
  expect(output.tool_calls).toBe(3);
  const searchStep = JSON.stringify(model.doGenerateCalls[2].prompt);
  const fetchStep = JSON.stringify(model.doGenerateCalls[3].prompt);
  expect(searchStep).toContain("https://example.org/food?portion=100g");
  expect(fetchStep).toContain("42 kcal");
  expect(model.doGenerateCalls[0].tools!.map((t) => t.name)).toContain("search_food_database");
});
