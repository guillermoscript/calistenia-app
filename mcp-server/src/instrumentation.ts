/**
 * OpenTelemetry instrumentation with Langfuse for AI cost tracking.
 *
 * MUST be imported before any AI SDK usage so spans are captured.
 * Langfuse credentials are read from env vars:
 *   LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASEURL
 */

import dotenv from "dotenv";
dotenv.config();

import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

const enabled = !!(
  process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY
);

let sdk: NodeSDK | undefined;

if (enabled) {
  sdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor()],
  });
  sdk.start();
  console.error("[Langfuse] Tracing enabled");
} else {
  console.error(
    "[Langfuse] Tracing disabled — set LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY to enable"
  );
}

export async function shutdownTracing() {
  if (sdk) {
    await sdk.shutdown();
  }
}
