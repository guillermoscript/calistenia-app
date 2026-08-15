/**
 * Server-level env resolution shared by server.ts (registration), bootstrap.ts
 * (process lifecycle) and standalone.ts (listen without the mcp-use CLI).
 */
import dotenv from "dotenv";
dotenv.config();

export const PORT = parseInt(process.env.PORT ?? process.env.MCP_SERVER_PORT ?? "3001", 10);
export const HOST = process.env.HOST ?? process.env.MCP_SERVER_HOST ?? "0.0.0.0";
export const PB_URL = process.env.POCKETBASE_URL ?? "http://127.0.0.1:8090";
export const SERVER_URL =
  process.env.SERVER_URL ??
  `http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`;
