#!/usr/bin/env node

/**
 * Calistenia MCP Server — mcp-use edition (migration target).
 *
 * Replaces src/index.ts (Express + raw MCP SDK). Single long-lived MCPServer:
 *   - /mcp        MCP endpoint, dual-auth via pocketbaseOAuthBridge → ctx.auth
 *   - /health     liveness probe
 *   - /api/*      REST routes (Phase 6)
 *   - OAuth flow  /authorize /token /register + login (Phase 5)
 *
 * Phase 2 scope: server boots, auth bridge verifies tokens, tools read
 * ctx.auth and build a per-request AuthManager.
 */

import dotenv from "dotenv";
dotenv.config();

// Must be imported before any AI SDK usage
import { shutdownTracing } from "./instrumentation.js";

import { MCPServer, object, error } from "mcp-use/server";
import { z } from "zod";
import { pocketbaseOAuthBridge, getAuthManager } from "./mcpuse/auth-bridge.js";

const PORT = parseInt(process.env.PORT ?? process.env.MCP_SERVER_PORT ?? "3001", 10);
const HOST = process.env.HOST ?? process.env.MCP_SERVER_HOST ?? "0.0.0.0";
const PB_URL = process.env.POCKETBASE_URL ?? "http://127.0.0.1:8090";
const SERVER_URL =
  process.env.SERVER_URL ??
  `http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`;

const server = new MCPServer({
  name: "calistenia-mcp-server",
  title: "Calistenia",
  version: "1.0.0",
  description: "Calisthenics training, nutrition, and progress tracking",
  instructions:
    "Tools operate on the authenticated user's data. Read user://profile and progress://weekly before planning workouts.",
  baseUrl: SERVER_URL,
  host: HOST,
  oauth: pocketbaseOAuthBridge(PB_URL, SERVER_URL),
});

// ── MCP request logging (parity with legacy [Auth] log) ─────────────────────
server.use("mcp:*", async (ctx, next) => {
  const email = (ctx.auth?.user as { email?: string } | undefined)?.email ?? "anonymous";
  console.error(`[Auth] ${email} — ${ctx.method}`);
  return next();
});

// ── Phase 2 smoke tool: proves ctx.auth → AuthManager round-trip ────────────
server.tool(
  {
    name: "cal_whoami",
    description:
      "Return the authenticated user's identity (id, email, timezone, auth method). Use to verify the connection works.",
    schema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async (_input, ctx) => {
    try {
      const auth = getAuthManager(ctx.auth, PB_URL);
      return object({
        user_id: auth.getUserId(),
        email: auth.getEmail(),
        timezone: auth.getTimezone(),
        auth_method: String(ctx.auth?.user?.authMethod ?? "unknown"),
      });
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  }
);

// ── Health check ─────────────────────────────────────────────────────────────
server.app.get("/health", (c) =>
  c.json({
    status: "ok",
    server: "calistenia-server",
    version: "1.0.0",
    pocketbase: PB_URL,
    services: ["api", "mcp"],
  })
);

// ── Start ─────────────────────────────────────────────────────────────────────
await server.listen(PORT);
console.error(`[Calistenia] mcp-use server on ${SERVER_URL} (PB: ${PB_URL})`);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGINT", async () => { console.error("\n[Shutdown] Flushing traces…"); await shutdownTracing(); process.exit(0); });
process.on("SIGTERM", async () => { console.error("\n[Shutdown] Flushing traces…"); await shutdownTracing(); process.exit(0); });
