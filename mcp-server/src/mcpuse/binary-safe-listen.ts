/**
 * Sustituye el `listen()` de mcp-use por uno que NO destroza los bodies binarios.
 *
 * mcp-use v2 (2.2.3 → 2.4.3, comprobado en el dist) construye la `Request` web
 * desde la petición de Node leyendo el body con `TextDecoder` y concatenando
 * strings (`toWebRequest` en dist/index-node.js). Cualquier byte >= 0x80 se
 * convierte en U+FFFD y se recodifica en UTF-8: un JPEG de 223 KB llega como
 * 399 KB que empiezan por `EF BF BD` en vez de `FF D8 FF`. Todo `multipart/form-data`
 * con imagen (analyze-meal, jobs/analyze-meal, el escaneo de tickets de la
 * despensa) acababa en OpenAI como «The image data you provided does not
 * represent a valid image» → 502 al cliente.
 *
 * `MCPServer.fetch(request)` es público y monta las mismas rutas (MCP, OAuth,
 * views y nuestros /api/*), así que servimos ese `fetch` con el adaptador de
 * Hono para Node, que entrega el body como stream de bytes intacto. La CLI
 * (`mcp-use start|dev`) sólo exige que el default export tenga `listen()`.
 */
import { createServer, type Server } from "node:http";
import { getRequestListener } from "@hono/node-server";

export interface BinarySafeListenTarget {
  fetch: (request: Request) => Promise<Response>;
  listen: (port?: number, options?: { host?: string }) => Promise<{ port: number; url: string }>;
}

export interface BinarySafeListenOptions {
  /** Host por defecto si `listen()` no recibe uno (mcp-use usa el de su config). */
  defaultHost: string;
  /** Puerto por defecto si `listen()` no recibe uno. */
  defaultPort: number;
  /** Ruta base del endpoint MCP, sólo para la `url` que se devuelve (mcp-use: `/mcp`). */
  basePath?: string;
}

/**
 * Instala el `listen()` binario-seguro en `server` y devuelve una función para
 * cerrar el servidor HTTP que cree (mcp-use no lo conoce, así que su `close()`
 * no lo cierra).
 */
export function installBinarySafeListen(
  server: BinarySafeListenTarget,
  options: BinarySafeListenOptions,
): { close: () => Promise<void> } {
  let httpServer: Server | undefined;

  const listen: BinarySafeListenTarget["listen"] = async (port, listenOptions) => {
    const host = listenOptions?.host ?? options.defaultHost;
    const requestedPort = port ?? options.defaultPort;
    // El body se entrega tal cual (stream de bytes) — es todo lo que hace falta.
    const listener = getRequestListener((request) => server.fetch(request));
    const created = createServer(listener);
    httpServer = created;
    await new Promise<void>((resolve, reject) => {
      created.once("error", reject);
      created.listen(requestedPort, host, () => {
        created.off("error", reject);
        resolve();
      });
    });
    const address = created.address();
    const boundPort = typeof address === "object" && address !== null ? address.port : requestedPort;
    return { port: boundPort, url: `http://localhost:${boundPort}${options.basePath ?? "/mcp"}` };
  };

  server.listen = listen;

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (!httpServer) return resolve();
        httpServer.close((err) => (err ? reject(err) : resolve()));
        httpServer = undefined;
      }),
  };
}
