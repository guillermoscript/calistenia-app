import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel, ToolSet } from "ai";
import config from "./config.js";

export type Tier = "free" | "pro";
export type Provider = "anthropic" | "google" | "openai";

interface ResolvedModel {
  model: LanguageModel;
  name: string;
  provider: Provider;
}

interface ModelCandidate {
  provider: "anthropic" | "google" | "openai";
  model: () => LanguageModel;
  name: string;
}

const MODEL_MAP: Record<Tier, ModelCandidate[]> = {
  pro: [
    { provider: "anthropic", model: () => anthropic("claude-sonnet-4-6"), name: "claude-sonnet-4-6" },
    { provider: "openai", model: () => openai("gpt-5.4"), name: "gpt-5.4" },
    { provider: "google", model: () => google("gemini-2.5-pro"), name: "gemini-2.5-pro" },
  ],
  free: [
    { provider: "anthropic", model: () => anthropic("claude-haiku-4-5"), name: "claude-haiku-4-5" },
    { provider: "google", model: () => google("gemini-2.5-flash"), name: "gemini-2.5-flash" },
    { provider: "openai", model: () => openai("gpt-5.4-mini"), name: "gpt-5.4-mini" },
  ],
};

const PROVIDER_FACTORIES: Record<string, (id: string) => LanguageModel> = {
  anthropic,
  google,
  openai,
};

function resolveOverride(modelId: string): ResolvedModel | null {
  const prefixMap: [string, Provider][] = [
    ["claude", "anthropic"],
    ["gpt", "openai"],
    ["gemini", "google"],
  ];

  for (const [prefix, provider] of prefixMap) {
    if (modelId.startsWith(prefix) && (config.providers as Record<string, boolean>)[provider]) {
      const factory = PROVIDER_FACTORIES[provider];
      return { model: factory(modelId), name: modelId, provider };
    }
  }
  return null;
}

export function resolveModel(tier: Tier = "free"): ResolvedModel {
  const override = tier === "pro" ? config.defaultModelPro : config.defaultModelFree;
  if (override) {
    const resolved = resolveOverride(override);
    if (resolved) return resolved;
  }

  const candidates = MODEL_MAP[tier] ?? MODEL_MAP.free;
  if (config.defaultProvider) {
    const preferred = candidates.find(
      (c) => c.provider === config.defaultProvider && (config.providers as Record<string, boolean>)[c.provider]
    );
    if (preferred) return { model: preferred.model(), name: preferred.name, provider: preferred.provider };
  }

  for (const candidate of candidates) {
    if ((config.providers as Record<string, boolean>)[candidate.provider]) {
      return { model: candidate.model(), name: candidate.name, provider: candidate.provider };
    }
  }

  throw new Error(
    "No AI provider configured. Set ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or OPENAI_API_KEY."
  );
}

/**
 * Returns the web search tool for the active provider.
 * Each provider has its own web search implementation.
 */
export function resolveWebSearchTool(provider: Provider): ToolSet {
  switch (provider) {
    case "anthropic":
      return { web_search: anthropic.tools.webSearch_20260209({ maxUses: 3 }) };
    case "openai":
      return { web_search: openai.tools.webSearch({ searchContextSize: "medium" }) };
    case "google":
      return { google_search: google.tools.googleSearch({}) };
  }
}

export function getAvailableProviders() {
  return { ...config.providers };
}
