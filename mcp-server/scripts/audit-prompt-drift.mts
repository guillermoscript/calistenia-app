/**
 * Audita cada entrada de FALLBACKS contra la versión con etiqueta `production`
 * en Langfuse y reporta las que han divergido.
 *
 * Existe porque el criterio "FALLBACKS sigue vivo y sincronizado" (#298) no lo
 * puede comprobar un test de CI: haría falta la clave de Langfuse. Y no es
 * teórico — la primera ejecución (2026-08-15) encontró cuatro prompts en los
 * que Langfuse, que es lo que el modelo recibe DE VERDAD en producción, se
 * había quedado atrás respecto al código, perdiendo secciones enteras.
 *
 * Es de solo lectura: no siembra ni modifica nada en Langfuse.
 *
 *   cd mcp-server && npx tsx scripts/audit-prompt-drift.mts
 *
 * Sale con código 1 si hay drift o si falta algún prompt, para poder colgarlo
 * de un cron o de un check manual antes de tocar prompts.
 */
import "dotenv/config";
import { Langfuse } from "langfuse";

import { FALLBACKS } from "../src/api/prompts.js";

const { LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASEURL } = process.env;

if (!LANGFUSE_SECRET_KEY || !LANGFUSE_PUBLIC_KEY) {
  console.error("Faltan LANGFUSE_SECRET_KEY / LANGFUSE_PUBLIC_KEY en el entorno.");
  process.exit(2);
}

const langfuse = new Langfuse({
  secretKey: LANGFUSE_SECRET_KEY,
  publicKey: LANGFUSE_PUBLIC_KEY,
  baseUrl: LANGFUSE_BASEURL ?? "https://cloud.langfuse.com",
});

let problems = 0;

for (const [name, local] of Object.entries(FALLBACKS)) {
  let remote: string;
  let version: number;
  try {
    const fetched = await langfuse.getPrompt(name);
    remote = fetched.prompt as string;
    version = fetched.version;
  } catch {
    problems++;
    console.log(`FALTA  ${name} — no está en Langfuse; cada llamada paga un fetch fallido`);
    continue;
  }

  if (remote === local) {
    console.log(`OK     ${name} v${version}`);
    continue;
  }

  problems++;
  const remoteLines = remote.split("\n");
  const localLines = local.split("\n");
  const onlyRemote = remoteLines.filter((l) => l.trim() && !localLines.includes(l));
  const onlyLocal = localLines.filter((l) => l.trim() && !remoteLines.includes(l));

  console.log(
    `DRIFT  ${name} v${version} — ${onlyRemote.length} línea(s) solo en Langfuse, ` +
      `${onlyLocal.length} solo en FALLBACKS`
  );
  for (const l of onlyRemote) console.log(`         solo-Langfuse > ${l}`);
  for (const l of onlyLocal) console.log(`         solo-código   > ${l}`);
}

await langfuse.shutdownAsync();

console.log(problems === 0 ? "\nSin drift." : `\n${problems} prompt(s) con problema.`);
process.exit(problems === 0 ? 0 : 1);
