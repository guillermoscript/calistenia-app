/**
 * Calistenia MCP Server — mcp-use v2 entry.
 *
 * Single long-lived MCPServer:
 *   - /mcp        MCP endpoint, dual-auth via pocketbaseOAuthBridge → ctx.auth
 *   - /health     liveness probe
 *   - /api/*      REST routes
 *   - OAuth flow  /authorize /token /register + login
 *
 * This module only REGISTERS things and `export default`s the server, as
 * mcp-use v2 expects: `mcp-use dev|build|start` own `listen()` and the view
 * bundle. Process-level concerns (reminder scheduler, graceful shutdown) live
 * in ./bootstrap.ts, imported for its side effects below.
 */

import dotenv from "dotenv";
dotenv.config();

// Must be imported before any AI SDK usage
import "./instrumentation.js";

import { MCPServer, object, error } from "mcp-use";
import { z } from "zod";
import { pocketbaseOAuthBridge, getAuthManager } from "./mcpuse/auth-bridge.js";
import { registerOAuthRoutes } from "./mcpuse/oauth-routes.js";
import { registerApiRoutes } from "./mcpuse/api-routes.js";
import { registerExerciseTools } from "./tools/exercises.js";
import { registerWorkoutTools } from "./tools/workouts.js";
import { registerProgramTools } from "./tools/programs.js";
import { registerProgressTools } from "./tools/progress.js";
import { registerNutritionTools } from "./tools/nutrition.js";
import { registerHealthTools } from "./tools/health.js";
import { registerSmartTools } from "./tools/smart.js";
import { registerGamificationTools } from "./tools/gamification.js";
import { registerMediaTools } from "./tools/media.js";
import { registerCircuitTools } from "./tools/circuits.js";
import { registerPantryTools } from "./tools/pantry.js";
import { registerRecipeTools } from "./tools/recipes.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import { PORT, HOST, PB_URL, SERVER_URL } from "./config.js";
import type { BridgeUser } from "./mcpuse/auth-bridge.js";

// v2 dropped `baseUrl`; the public origin comes from MCP_URL (read by the
// framework for OAuth resource metadata and view asset URLs).
process.env.MCP_URL ??= SERVER_URL;

const server = new MCPServer<BridgeUser>({
  name: "calistenia-mcp-server",
  title: "Calistenia",
  version: "1.0.0",
  description: "Calisthenics training, nutrition, and progress tracking",
  instructions:
    "Tools operate on the authenticated user's data. Read user://profile and progress://weekly before planning workouts.",
  host: HOST,
  port: PORT,
  oauth: pocketbaseOAuthBridge(PB_URL, SERVER_URL),
  // Override mcp-use's global CORS (app.use("*", cors(...))). The web app runs on
  // a different origin than this API in prod (gym.guille.tech → gym-server.guille.tech),
  // so every /api/* call triggers a CORS preflight. The Sentry browser SDK injects
  // `baggage`/`sentry-trace` distributed-tracing headers on outgoing fetches; if the
  // preflight's Access-Control-Allow-Headers doesn't list them the browser blocks the
  // POST entirely (status null, 0 B sent). We keep mcp-use's defaults (so MCP clients
  // keep working) and add the tracing + internal-key headers. (In dev the web app uses
  // the Vite proxy → same-origin → no preflight, which is why this only bit in prod.)
  cors: {
    origin: "*",
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Accept",
      "Authorization",
      "mcp-protocol-version",
      "mcp-session-id",
      "X-Proxy-Token",
      "X-Target-URL",
      "baggage",
      "sentry-trace",
      "x-internal-key",
    ],
  },
});

// ── MCP request logging (parity with legacy [Auth] log) ─────────────────────
server.use("mcp:*", async (ctx, next) => {
  // Middleware sees the raw SDK AuthInfo; our claims ride in `extra` (see auth-bridge).
  const email = (ctx.auth?.extra as { email?: string } | undefined)?.email ?? "anonymous";
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
        auth_method: ctx.auth?.user?.authMethod ?? "unknown",
      });
    } catch (err) {
      return error(err instanceof Error ? err.message : String(err));
    }
  }
);

// ── Tools (85) — auth resolved per request from ctx.auth ─────────────────────
registerExerciseTools(server, PB_URL);
registerWorkoutTools(server, PB_URL);
registerProgramTools(server, PB_URL);
registerProgressTools(server, PB_URL);
registerNutritionTools(server, PB_URL);
registerHealthTools(server, PB_URL);
registerSmartTools(server, PB_URL);
registerGamificationTools(server, PB_URL);
registerMediaTools(server, PB_URL);
registerCircuitTools(server, PB_URL);
registerPantryTools(server, PB_URL);
registerRecipeTools(server, PB_URL);

// ── Resources (3) + Prompts (3) ───────────────────────────────────────────────
registerResources(server, PB_URL);
registerPrompts(server);

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

// ── OAuth 2.1 authorization-server routes (Phase 5) ─────────────────────────
// Registered before listen() so they win over mcp-use's built-in (broken for a
// self-hosted issuer) /authorize, /token and metadata handlers.
registerOAuthRoutes(server, PB_URL, SERVER_URL);

// ── REST /api/* routes (Phase 6) ──────────────────────────────────────────
registerApiRoutes(server, PB_URL);

// ── Process lifecycle: reminder scheduler + graceful shutdown ─────────────────
// Side-effect import; `listen()` itself belongs to the mcp-use CLI.
import "./bootstrap.js";

export default server;
