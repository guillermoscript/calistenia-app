/**
 * mcp-use auth bridge — PocketBase dual-auth as a custom OAuth provider.
 *
 * Replaces the legacy Express `mcpAuth` middleware (old src/index.ts).
 * mcp-use calls `verifyToken` on every /mcp request; the verified payload
 * flows into tool handlers as `ctx.auth` ({ user, payload, accessToken, ... }).
 *
 * Dual-auth, same order as before:
 *   1. OAuth 2.1 access token issued by our PocketBase-backed flow
 *      (in-memory store shared with src/oauth.ts)
 *   2. Direct PocketBase JWT (backward compat for custom clients)
 *
 * Tool handlers never touch tokens directly — they call `getAuthManager(ctx)`.
 */

import { oauthCustomProvider, type UserInfo } from "mcp-use/server";
import { AuthManager, validateBearerToken, type UserContext } from "../auth.js";
import { verifyStoredAccessToken } from "../oauth.js";

/** Payload shape produced by verifyToken and consumed by getUserInfo. */
interface BridgePayload {
  sub: string;
  email: string;
  pbToken: string;
  timezone: string;
  /** which leg of the dual-auth matched */
  auth_method: "oauth" | "pocketbase";
  scopes: string[];
  [key: string]: unknown;
}

/**
 * Create the mcp-use OAuth provider backed by PocketBase.
 *
 * @param pbUrl     PocketBase base URL
 * @param serverUrl Public URL of this server (issuer + endpoints for
 *                  .well-known metadata; actual routes ported in Phase 5)
 */
export function pocketbaseOAuthBridge(pbUrl: string, serverUrl: string) {
  return oauthCustomProvider({
    issuer: serverUrl,
    authEndpoint: `${serverUrl}/authorize`,
    tokenEndpoint: `${serverUrl}/token`,
    scopesSupported: ["mcp:tools"],

    async verifyToken(token: string): Promise<{ payload: BridgePayload }> {
      // 1) OAuth access token from our PocketBase-backed flow
      try {
        const stored = verifyStoredAccessToken(token);
        return {
          payload: {
            sub: stored.userId,
            email: stored.email,
            pbToken: stored.pbToken,
            timezone: "UTC", // OAuth store doesn't persist tz (parity with legacy bridge)
            auth_method: "oauth",
            scopes: stored.scopes,
          },
        };
      } catch {
        // fall through to PB token
      }

      // 2) Direct PocketBase JWT
      const ctx = await validateBearerToken(pbUrl, `Bearer ${token}`);
      return {
        payload: {
          sub: ctx.userId,
          email: ctx.email,
          pbToken: ctx.token,
          timezone: ctx.timezone,
          auth_method: "pocketbase",
          scopes: ["mcp:tools"],
        },
      };
    },

    getUserInfo(payload: BridgePayload): UserInfo {
      return {
        userId: payload.sub,
        email: payload.email,
        // extra fields ride along — UserInfo allows arbitrary keys
        pbToken: payload.pbToken,
        timezone: payload.timezone,
        authMethod: payload.auth_method,
      };
    },
  });
}

/**
 * Build a per-request AuthManager from the verified ctx.auth.
 * Call at the top of every tool/resource handler.
 */
export function getAuthManager(
  ctxAuth: { user: UserInfo } | undefined,
  pbUrl: string
): AuthManager {
  if (!ctxAuth?.user) {
    throw new Error("Not authenticated");
  }
  const u = ctxAuth.user;
  const userCtx: UserContext = {
    userId: u.userId,
    token: String(u.pbToken ?? ""),
    email: u.email ?? "",
    timezone: String(u.timezone ?? "UTC"),
  };
  if (!userCtx.token) {
    throw new Error("Auth context missing PocketBase token");
  }
  return new AuthManager(pbUrl, userCtx);
}
