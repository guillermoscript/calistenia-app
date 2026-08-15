#!/usr/bin/env node
/**
 * Run the server without the mcp-use CLI (`npm run dev:simple`).
 *
 * Views are NOT served this way — the CLI (`mcp-use dev` / `build` + `start`)
 * is what compiles and primes them. Use this only for API/OAuth/tool work
 * where a plain `tsx` process is faster to iterate on.
 */
import server from "./server.js";
import { PORT, PB_URL, SERVER_URL } from "./config.js";

await server.listen(PORT);
console.error(`[Calistenia] mcp-use server on ${SERVER_URL} (PB: ${PB_URL})`);
