/**
 * Telemetry helper for AI SDK v7 + Langfuse.
 *
 * v7 removed `telemetry.metadata`, and its replacement (`runtimeContext` +
 * `includeRuntimeContext`) is not available on generateObject. Instead we
 * attach the Langfuse-canonical OTel attributes (prompt link + metadata) to
 * every span of the call via the `enrichSpan` hook of @ai-sdk/otel, passed as
 * a per-call telemetry integration.
 */

import { OpenTelemetry } from "@ai-sdk/otel";
import { LangfuseOtelSpanAttributes } from "@langfuse/core";
import type { TelemetryOptions } from "ai";
import type { Attributes } from "@opentelemetry/api";

export interface LangfusePromptRef {
  name: string;
  version: number;
}

/**
 * Build the `telemetry` option for generateText/streamText/generateObject,
 * linking the generation to its Langfuse prompt version and attaching
 * filterable metadata (tier, modelName, ...) at trace and observation level.
 */
export function langfuseTelemetry(
  functionId: string,
  options: {
    prompt?: LangfusePromptRef;
    metadata?: Record<string, string | number | boolean | undefined>;
  } = {}
): TelemetryOptions {
  const attributes: Attributes = {};

  if (options.prompt) {
    attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME] = options.prompt.name;
    attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION] = options.prompt.version;
  }

  for (const [key, value] of Object.entries(options.metadata ?? {})) {
    if (value === undefined) continue;
    attributes[`${LangfuseOtelSpanAttributes.OBSERVATION_METADATA}.${key}`] = value;
    attributes[`${LangfuseOtelSpanAttributes.TRACE_METADATA}.${key}`] = value;
  }

  return {
    isEnabled: true,
    functionId,
    // Per-call integration takes precedence over the globally registered one;
    // OpenTelemetry with enrichSpan still emits the standard spans, plus ours.
    integrations: new OpenTelemetry({ enrichSpan: () => attributes }),
  };
}
