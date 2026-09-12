/**
 * catalog-file.ts — el `data/exercise-catalog.json` del servidor, leído del disco.
 *
 * Es la misma copia del catálogo que `packages/core/data/exercise-catalog.json`
 * (los cuatro ficheros van a la vez, con el mismo md5), pero aquí se lee con
 * `readFileSync` y no con `import`: el Dockerfile de producción copia
 * `mcp-server/data/` al lado del bundle y NO copia el `data/` de core, y un
 * `import()` del JSON de core acabaría inlineado en el bundle o roto en runtime.
 *
 * Tres rutas, en este orden:
 *  - `$CWD/data/…`            → Docker (`WORKDIR /app/mcp-server`, `COPY mcp-server/data/`)
 *  - `<bundle>/../../data/…`  → `.mcp-use/build/index.js` y `build/lib/*.js`
 *  - `<src/lib>/../data/…`    → dev con tsx, `src/data/` (la copia de desarrollo)
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const CATALOG_FILE = "exercise-catalog.json";

export function catalogFileCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    resolve(process.cwd(), "data", CATALOG_FILE),
    resolve(here, "../../data", CATALOG_FILE),
    resolve(here, "../data", CATALOG_FILE),
  ];
}

/**
 * El catálogo parseado, tal cual está en el fichero (`{ categories: {…} }`).
 * Lanza si no aparece en ninguna ruta: quien llama decide si es fatal.
 */
export function readCatalogFile(): unknown {
  const candidates = catalogFileCandidates();
  for (const path of candidates) {
    let text: string;
    try {
      text = readFileSync(path, "utf-8");
    } catch {
      continue;
    }
    return JSON.parse(text);
  }
  throw new Error(`Catalog not found. Tried: ${candidates.join(", ")}`);
}
