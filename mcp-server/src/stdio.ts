#!/usr/bin/env node

/**
 * Calistenia MCP stdio Server
 *
 * For direct use with Claude Desktop or MCP Inspector.
 * Requires PB_TOKEN environment variable (your PocketBase JWT).
 *
 * Get your token:
 *   Browser DevTools → Application → Local Storage → "pb_auth" → copy "token"
 *
 * Claude Desktop config (~/.claude/claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "calistenia": {
 *       "command": "node",
 *       "args": ["/path/to/calistenia-app/mcp-server/build/stdio.js"],
 *       "env": {
 *         "POCKETBASE_URL": "http://127.0.0.1:8090",
 *         "PB_TOKEN": "your_pocketbase_jwt_token_here"
 *       }
 *     }
 *   }
 * }
 */

import dotenv from "dotenv";
dotenv.config();

// Must be imported before any AI SDK usage
import "./instrumentation.js";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AuthManager, validateEnvToken } from "./auth.js";
import { registerWorkoutTools } from "./tools/workouts.js";
import { registerProgramTools } from "./tools/programs.js";
import { registerProgressTools } from "./tools/progress.js";
import { registerNutritionTools } from "./tools/nutrition.js";
import { registerSmartTools } from "./tools/smart.js";
import { registerGamificationTools } from "./tools/gamification.js";
import { registerHealthTools } from "./tools/health.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

const PB_URL = process.env.POCKETBASE_URL ?? "http://127.0.0.1:8090";

async function main() {
  // Validate token once at startup
  console.error("[Calistenia MCP] Authenticating with PocketBase...");
  const userContext = await validateEnvToken(PB_URL);
  console.error(`[Calistenia MCP] Authenticated as ${userContext.email}`);

  const auth = new AuthManager(PB_URL, userContext);

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
  registerHealthTools(server, auth);
  registerResources(server, auth);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[Calistenia MCP] Server ready. Listening on stdio.");
}

main().catch((err) => {
  console.error("[Fatal]", err instanceof Error ? err.message : err);
  process.exit(1);
});
