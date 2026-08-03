/**
 * Verificación en vivo (no se commitea): lanza un generateObject real con el
 * helper langfuseTelemetry y comprueba vía API de Langfuse que la traza llega
 * con el enlace de prompt (name/version) y los metadatos.
 *
 *   npx tsx verify-telemetry.mts
 */

import "./src/instrumentation.js";

import { z } from "zod";
import { generateObject } from "ai";
import { resolveModel } from "./src/api/model-resolver.js";
import { getPromptWithMeta } from "./src/api/prompts.js";
import { langfuseTelemetry } from "./src/api/telemetry.js";
import { shutdownTracing } from "./src/instrumentation.js";

const MARKER = `verify-aisdk7-${process.pid}`;

const { langfusePrompt } = await getPromptWithMeta("pantry-parser");
if (!langfusePrompt) {
  console.error("FAIL: no se pudo obtener el prompt 'pantry-parser' de Langfuse");
  process.exit(1);
}
console.log("prompt:", langfusePrompt);

const { model, name: modelName } = resolveModel("free");

const { object } = await generateObject({
  model,
  schema: z.object({ saludo: z.string() }),
  telemetry: langfuseTelemetry(MARKER, {
    prompt: langfusePrompt,
    metadata: { tier: "free", modelName, marker: MARKER },
  }),
  messages: [
    
    { role: "user", content: "Devuelve un saludo de una palabra." },
  ],
});
console.log("generado:", object);

await shutdownTracing();
console.log("spans exportados, esperando ingestión…");

// ── Consulta a la API de Langfuse ────────────────────────────────────────────
const base = process.env.LANGFUSE_BASEURL ?? "https://cloud.langfuse.com";
const auth =
  "Basic " +
  Buffer.from(
    `${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`
  ).toString("base64");

async function poll(): Promise<boolean> {
  const res = await fetch(`${base}/api/public/traces?limit=10&orderBy=timestamp.desc`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    console.error("API error", res.status, await res.text());
    return false;
  }
  const { data } = (await res.json()) as { data: Array<{ id: string; name?: string; metadata?: Record<string, unknown> }> };
  const trace = data.find(
    (t) => t.name?.includes(MARKER) || JSON.stringify(t.metadata ?? {}).includes(MARKER)
  );
  if (!trace) return false;

  console.log("\nTRACE:", trace.id, "name:", trace.name);
  console.log("trace.metadata:", JSON.stringify(trace.metadata));

  const obsRes = await fetch(`${base}/api/public/observations?traceId=${trace.id}`, {
    headers: { Authorization: auth },
  });
  const obs = (await obsRes.json()) as {
    data: Array<{ id: string; type: string; name?: string; promptName?: string; promptVersion?: number; metadata?: Record<string, unknown>; model?: string }>;
  };
  for (const o of obs.data) {
    console.log(
      `  obs [${o.type}] ${o.name}: promptName=${o.promptName} promptVersion=${o.promptVersion} model=${o.model} metadata=${JSON.stringify(o.metadata)}`
    );
  }
  const linked = obs.data.some((o) => o.promptName === langfusePrompt!.name && o.promptVersion === langfusePrompt!.version);
  const hasMeta = obs.data.some((o) => JSON.stringify(o.metadata ?? {}).includes(MARKER)) || JSON.stringify(trace.metadata ?? {}).includes(MARKER);
  console.log(`\nprompt enlazado: ${linked ? "SÍ" : "NO"} · metadatos presentes: ${hasMeta ? "SÍ" : "NO"}`);
  return linked && hasMeta;
}

let ok = false;
for (let i = 0; i < 10 && !ok; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  ok = await poll();
}
console.log(ok ? "\nVERIFICACIÓN OK" : "\nVERIFICACIÓN FALLIDA (traza no encontrada o incompleta)");
process.exit(ok ? 0 : 1);
