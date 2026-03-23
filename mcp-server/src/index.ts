#!/usr/bin/env node

/**
 * Calistenia MCP HTTP Server
 *
 * OAuth 2.1-protected MCP server using PocketBase as identity provider.
 *
 * Supports two auth modes for the /mcp endpoint:
 *   1. OAuth 2.1 flow (for Claude Desktop / remote MCP clients)
 *   2. Direct PocketBase Bearer token (backward compat for custom clients)
 *
 * Set SERVER_URL to your public URL (e.g. https://calistenia.example.com)
 * so OAuth metadata endpoints resolve correctly for remote clients.
 */

import dotenv from "dotenv";
dotenv.config();

// Must be imported before any AI SDK usage
import { shutdownTracing } from "./instrumentation.js";

import express from "express";
import cors from "cors";
import type { IncomingMessage, ServerResponse } from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  mcpAuthRouter,
  getOAuthProtectedResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { AuthManager, validateBearerToken } from "./auth.js";
import { PocketBaseOAuthProvider, createLoginRouter } from "./oauth.js";
import { registerWorkoutTools } from "./tools/workouts.js";
import { registerProgramTools } from "./tools/programs.js";
import { registerProgressTools } from "./tools/progress.js";
import { registerNutritionTools } from "./tools/nutrition.js";
import { registerSmartTools } from "./tools/smart.js";
import { registerGamificationTools } from "./tools/gamification.js";
import { registerMediaTools } from "./tools/media.js";
import { registerExerciseTools } from "./tools/exercises.js";
import { registerHealthTools } from "./tools/health.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import { createApiRouter } from "./api/index.js";

const PORT = parseInt(process.env.PORT ?? process.env.MCP_SERVER_PORT ?? "3001", 10);
const HOST = process.env.HOST ?? process.env.MCP_SERVER_HOST ?? "0.0.0.0";
const PB_URL = process.env.POCKETBASE_URL ?? "http://127.0.0.1:8090";
const SERVER_URL =
  process.env.SERVER_URL ??
  `http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`;

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
  registerMediaTools(server, auth);
  registerExerciseTools(server, auth);
  registerHealthTools(server, auth);
  registerResources(server, auth);
  registerPrompts(server);

  return server;
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── OAuth 2.1 provider (PocketBase-backed) ───────────────────────────────────

const oauthProvider = new PocketBaseOAuthProvider(PB_URL);
const serverUrl = new URL(SERVER_URL);
const mcpUrl = new URL("/mcp", serverUrl);

// OAuth routes: /.well-known/*, /authorize, /token, /register, /revoke
app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: serverUrl,
    resourceServerUrl: mcpUrl,
    scopesSupported: ["mcp:tools"],
    resourceName: "Calistenia MCP Server",
  })
);

// Login form handler (called from the OAuth authorize page)
app.use(createLoginRouter(PB_URL));

// ── MCP endpoint (OAuth-protected) ───────────────────────────────────────────

const bearerAuth = requireBearerAuth({
  verifier: oauthProvider,
  requiredScopes: [],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
});

/**
 * Dual-auth middleware: tries OAuth token first, then falls back to
 * direct PocketBase JWT for backward compatibility.
 */
async function mcpAuth(req: any, res: any, next: any) {
  // Try OAuth token first
  bearerAuth(req, res, (err?: any) => {
    if (!err && req.auth) {
      // OAuth token validated — attach user context
      const { userId, pbToken, email } = req.auth.extra as {
        userId: string;
        pbToken: string;
        email: string;
      };
      req.mcpAuth = new AuthManager(PB_URL, { userId, token: pbToken, email });
      return next();
    }

    // OAuth failed — try direct PocketBase token
    validateBearerToken(PB_URL, req.headers.authorization)
      .then((userCtx) => {
        req.mcpAuth = new AuthManager(PB_URL, userCtx);
        next();
      })
      .catch(() => {
        // Both failed — return the OAuth 401 (with WWW-Authenticate header)
        // Re-invoke bearerAuth to send proper 401 response
        bearerAuth(req, res, () => {});
      });
  });
}

app.post("/mcp", mcpAuth, async (req: any, res: any) => {
  try {
    const auth: AuthManager = req.mcpAuth;

    console.error(
      `[Auth] ${auth.getEmail()} (${auth.getUserId()}) — ${req.body?.method ?? "unknown"}`
    );

    const mcpServer = createServerWithAuth(auth);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close().catch((err: Error) =>
        console.error("[Transport] close error:", err)
      );
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(
      req as IncomingMessage,
      res as ServerResponse,
      req.body
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Error] ${msg}`);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: msg },
      });
    }
  }
});

// ── API routes (REST — still uses direct PB tokens) ──────────────────────────
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
  console.error(`║  Calistenia Server (API + MCP + OAuth 2.1)                    ║`);
  console.error(`╠════════════════════════════════════════════════════════════════╣`);
  console.error(`║  Status:     READY                                            ║`);
  console.error(`║  Address:    http://${HOST}:${PORT}                               ║`);
  console.error(`║  Public URL: ${SERVER_URL.padEnd(48)}║`);
  console.error(`║  PocketBase: ${PB_URL.padEnd(48)}║`);
  console.error(`╠════════════════════════════════════════════════════════════════╣`);
  console.error(`║  MCP:   POST /mcp  (OAuth 2.1 + PB token fallback)           ║`);
  console.error(`║  OAuth: /authorize · /token · /register · /revoke             ║`);
  console.error(`║  API:   /api/*                                                ║`);
  console.error(`║  Health: GET /health                                          ║`);
  console.error(`╚════════════════════════════════════════════════════════════════╝`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGINT", async () => { console.error("\n[Shutdown] Flushing traces…"); await shutdownTracing(); process.exit(0); });
process.on("SIGTERM", async () => { console.error("\n[Shutdown] Flushing traces…"); await shutdownTracing(); process.exit(0); });
process.on("uncaughtException", (err) => { console.error("[Fatal]", err); process.exit(1); });
process.on("unhandledRejection", (reason) => { console.error("[Fatal] Unhandled rejection:", reason); process.exit(1); });
