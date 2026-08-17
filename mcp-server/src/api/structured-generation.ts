/**
 * structured-generation.ts — the ONE envelope around `generateObject` for the
 * AI API (#480).
 *
 * Before this file, 10 call sites repeated the same six lines — resolve the
 * model for the tier, fetch the Langfuse system prompt, wire the telemetry
 * link + metadata, call `generateObject`, and normalise `usage` — and each
 * copy of the usage block read `usage.promptTokens` / `usage.prompt_tokens`,
 * two field names that stopped existing in AI SDK v5 (`inputTokens` /
 * `outputTokens` since then). Every response therefore shipped
 * `usage: { prompt_tokens: undefined, ... }` and nobody noticed because the
 * cast to `any` hid it from the compiler. `normalizeUsage()` is the single
 * place that knows the field names now.
 *
 * Sites that need a tool loop (`generateText` + `Output.object` + tools) keep
 * their own call and only share `sumStepsUsage()`.
 */

import { generateObject, type UserContent } from "ai";
import type { z } from "zod";
import { resolveModel, type Provider, type Tier } from "./model-resolver.js";
import { getPromptWithMeta } from "./prompts.js";
import { langfuseTelemetry, type LangfusePromptRef } from "./telemetry.js";

/** Snake-case usage block returned to API clients (shape predates the SDK). */
export interface UsageTokens {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * Normalise an AI SDK usage object into our snake-case shape. Reads the v5+
 * field names first (`inputTokens`/`outputTokens`/`totalTokens`), then the
 * legacy ones, so it keeps working whichever the provider adapter emits.
 * `total_tokens` is derived when the SDK doesn't report it.
 */
export function normalizeUsage(usage: unknown): UsageTokens {
  const u = (usage ?? {}) as Record<string, unknown>;
  const num = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = u[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return undefined;
  };
  const prompt = num("inputTokens", "promptTokens", "prompt_tokens");
  const completion = num("outputTokens", "completionTokens", "completion_tokens");
  const reported = num("totalTokens", "total_tokens");
  const total =
    reported ?? (prompt !== undefined || completion !== undefined ? (prompt ?? 0) + (completion ?? 0) : undefined);
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total };
}

/** Minimal shape of a `generateText` step — only what we sum. */
export interface StepUsageLike {
  usage?: { inputTokens?: number; outputTokens?: number } | undefined;
  toolCalls?: ReadonlyArray<unknown> | undefined;
}

/**
 * Sum token usage and tool calls across the steps of a `generateText` tool
 * loop (meal-analyzer, food-lookup).
 */
export function sumStepsUsage(steps: ReadonlyArray<StepUsageLike>): { usage: UsageTokens; toolCalls: number } {
  let prompt = 0;
  let completion = 0;
  let toolCalls = 0;
  for (const step of steps) {
    prompt += step.usage?.inputTokens ?? 0;
    completion += step.usage?.outputTokens ?? 0;
    toolCalls += step.toolCalls?.length ?? 0;
  }
  return {
    usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion },
    toolCalls,
  };
}

export type GenerationMetadata = Record<string, string | number | boolean | undefined>;

export interface StructuredGenerationOptions<S extends z.ZodType> {
  /** Langfuse prompt name — its text becomes the `instructions` (system prompt). */
  promptName: string;
  /** Telemetry `functionId` (Langfuse trace name). Defaults to `promptName`. */
  telemetryId?: string;
  /** Model tier. Defaults to `"free"`. */
  tier?: Tier;
  /** Zod schema of the object to generate. */
  schema: S;
  /** User turn: plain text or multimodal parts (images + text). */
  user: UserContent;
  /** Extra filterable metadata; `tier` and `modelName` are always attached. */
  metadata?: GenerationMetadata;
}

export interface StructuredGenerationResult<T> {
  object: T;
  modelName: string;
  provider: Provider;
  usage: UsageTokens;
  langfusePrompt?: LangfusePromptRef;
}

/**
 * Resolve model + prompt, run `generateObject` linked to its Langfuse prompt
 * version, and return the object with normalised usage.
 */
export async function runStructuredGeneration<S extends z.ZodType>(
  opts: StructuredGenerationOptions<S>,
): Promise<StructuredGenerationResult<z.infer<S>>> {
  const tier: Tier = opts.tier ?? "free";
  const { model, name: modelName, provider } = resolveModel(tier);
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta(opts.promptName);

  const { object, usage } = await generateObject({
    model,
    schema: opts.schema,
    telemetry: langfuseTelemetry(opts.telemetryId ?? opts.promptName, {
      prompt: langfusePrompt,
      metadata: { tier, modelName, ...(opts.metadata ?? {}) },
    }),
    instructions: systemPrompt,
    messages: [{ role: "user", content: opts.user }],
  });

  return {
    object: object as z.infer<S>,
    modelName,
    provider,
    usage: normalizeUsage(usage),
    langfusePrompt,
  };
}
