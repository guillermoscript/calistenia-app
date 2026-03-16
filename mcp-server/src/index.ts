#!/usr/bin/env node

/**
 * Calistenia MCP HTTP Server
 *
 * Accepts PocketBase JWT tokens via the standard `Authorization: Bearer <token>` header.
 * Each request gets its own AuthManager instance (stateless).
 *
 * To get your token:
 *   Browser DevTools → Application → Local Storage → "pb_auth" → copy the "token" value
 */

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import type { IncomingMessage, ServerResponse } from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { AuthManager, validateBearerToken } from "./auth.js";
import { registerWorkoutTools } from "./tools/workouts.js";
import { registerProgramTools } from "./tools/programs.js";
import { registerProgressTools } from "./tools/progress.js";
import { registerNutritionTools } from "./tools/nutrition.js";
import { registerSmartTools } from "./tools/smart.js";
import { registerGamificationTools } from "./tools/gamification.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import { createApiRouter } from "./api/index.js";

const PORT = parseInt(process.env.PORT ?? process.env.MCP_SERVER_PORT ?? "3001", 10);
const HOST = process.env.HOST ?? process.env.MCP_SERVER_HOST ?? "127.0.0.1";
const PB_URL = process.env.POCKETBASE_URL ?? "http://127.0.0.1:8090";

function createServerWithAuth(auth: AuthManager): McpServer {
  const server = new McpServer({
    name: "calistenia-mcp-server",
    version: "1.0.0",
  });

  registerWorkoutTools(server, auth);
  registerProgramTools(server, auth);
  registerProgressTools(server, auth);
  registerNutritionTools(server, auth);
  registerSmartTools(server, auth);
  registerGamificationTools(server, auth);
  registerResources(server, auth);
  registerPrompts(server);

  return server;
}

// Create Express app with MCP defaults (DNS rebinding protection included)
const app = createMcpExpressApp({ host: HOST });
app.use(cors());
app.use(express.json());

// ── MCP endpoint ──────────────────────────────────────────────────────────────
app.post("/mcp", async (req, res) => {
  const startTime = Date.now();

  try {
    // Validate Bearer token against PocketBase
    const userContext = await validateBearerToken(PB_URL, req.headers.authorization);

    const auth = new AuthManager(PB_URL, userContext);

    console.error(
      `[Auth] ${userContext.email} (${userContext.userId}) — ${req.body?.method ?? "unknown"}`
    );

    const mcpServer = createServerWithAuth(auth);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close().catch((err) => console.error("[Transport] close error:", err));
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(req as IncomingMessage, res as ServerResponse, req.body);

    const duration = Date.now() - startTime;
    console.error(`[OK] ${req.body?.method} completed in ${duration}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Error] ${msg}`);

    if (!res.headersSent) {
      const isAuthError =
        msg.includes("Authentication required") ||
        msg.includes("Invalid or expired token") ||
        msg.includes("Unauthorized");

      res.status(isAuthError ? 401 : 500).json({
        jsonrpc: "2.0",
        error: {
          code: isAuthError ? -32001 : -32603,
          message: msg,
        },
      });
    }
  }
});

// ── API routes (REST) ─────────────────────────────────────────────────────────
app.use("/api", createApiRouter());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "calistenia-server",
    version: "1.0.0",
    pocketbase: PB_URL,
    services: ["api", "mcp"],
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.error(`╔════════════════════════════════════════════════════════════════╗`);
  console.error(`║  Calistenia Server (API + MCP)                                ║`);
  console.error(`╠════════════════════════════════════════════════════════════════╣`);
  console.error(`║  Status:     READY                                            ║`);
  console.error(`║  Address:    http://${HOST}:${PORT}                               ║`);
  console.error(`║  PocketBase: ${PB_URL.padEnd(48)}║`);
  console.error(`╠════════════════════════════════════════════════════════════════╣`);
  console.error(`║  API:   GET /api/health  ·  POST /api/analyze-meal            ║`);
  console.error(`║  MCP:   POST /mcp                                             ║`);
  console.error(`║  Health: GET /health                                          ║`);
  console.error(`╚════════════════════════════════════════════════════════════════╝`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGINT", () => { console.error("\n[Shutdown] Bye!"); process.exit(0); });
process.on("SIGTERM", () => { console.error("\n[Shutdown] Bye!"); process.exit(0); });
process.on("uncaughtException", (err) => { console.error("[Fatal]", err); process.exit(1); });
process.on("unhandledRejection", (reason) => { console.error("[Fatal] Unhandled rejection:", reason); process.exit(1); });
