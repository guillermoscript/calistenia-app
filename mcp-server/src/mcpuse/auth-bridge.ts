/**
 * mcp-use auth bridge — PocketBase dual-auth as a custom OAuth provider.
 *
 * mcp-use v2 gates /mcp with the MCP SDK's bearer-auth helper: on every
 * request it calls the `OAuthTokenVerifier` we build in `createTokenVerifier`,
 * then `mapAuthInfo` turns the SDK's `AuthInfo` into the `ctx.auth`
 * ({ user, payload, accessToken, scopes, permissions, ... }) tool handlers see.
 *
 * Dual-auth, same order as before:
 *   1. OAuth 2.1 access token issued by our PocketBase-backed flow
 *      (in-memory store shared with src/oauth.ts)
 *   2. Direct PocketBase JWT (backward compat for custom clients)
 *
 * The authorization server itself is still us (src/mcpuse/oauth-routes.ts):
 * `oauthMetadata` below just advertises our own /authorize, /token, /register.
 *
 * Tool handlers never touch tokens directly — they call `getAuthManager(ctx.auth)`.
 */

import type { MCPServer } from "mcp-use";
import { OAuthError, OAuthErrorCode, oauthCustomProvider, type OAuthAuthInfo } from "mcp-use/oauth";
import { AuthManager, validateBearerToken, type UserContext } from "../auth.js";
import { verifyStoredAccessToken } from "../oauth.js";

/** Identity exposed to tool handlers as `ctx.auth.user`. */
export interface BridgeUser {
  userId: string;
  email: string;
  pbToken: string;
  timezone: string;
  /** which leg of the dual-auth matched */
  authMethod: "oauth" | "pocketbase";
}

/** The server type every `registerXTools(server, …)` module receives. */
export type AppServer = MCPServer<BridgeUser>;

/** Claims stashed in `AuthInfo.extra` by the verifier and read back by `mapAuthInfo`. */
interface BridgeExtra {
  sub: string;
  email: string;
  pbToken: string;
  timezone: string;
  auth_method: BridgeUser["authMethod"];
}

/** Best-effort `exp` (seconds) from a PocketBase JWT; falls back to +1h. */
function jwtExpiresAt(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    if (typeof payload.exp === "number") return payload.exp;
  } catch {
    // not a JWT (or malformed) — validateBearerToken already accepted it
  }
  return Math.floor(Date.now() / 1000) + 3600;
}

/**
 * Create the mcp-use OAuth provider backed by PocketBase.
 *
 * @param pbUrl     PocketBase base URL
 * @param serverUrl Public URL of this server (issuer + endpoints for
 *                  .well-known metadata)
 */
export function pocketbaseOAuthBridge(pbUrl: string, serverUrl: string) {
  return oauthCustomProvider<BridgeUser>({
    resource: `${serverUrl}/mcp`,
    resourceName: "Calistenia",
    scopesSupported: ["mcp:tools"],
    oauthMetadata: {
      issuer: serverUrl,
      authorization_endpoint: `${serverUrl}/authorize`,
      token_endpoint: `${serverUrl}/token`,
      registration_endpoint: `${serverUrl}/register`,
      revocation_endpoint: `${serverUrl}/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      scopes_supported: ["mcp:tools"],
    },

    createTokenVerifier: (resource) => ({
      async verifyAccessToken(token: string): Promise<OAuthAuthInfo> {
        // 1) OAuth access token from our PocketBase-backed flow
        try {
          const stored = verifyStoredAccessToken(token);
          const extra: BridgeExtra = {
            sub: stored.userId,
            email: stored.email,
            pbToken: stored.pbToken,
            timezone: "UTC", // OAuth store doesn't persist tz (parity with legacy bridge)
            auth_method: "oauth",
          };
          return {
            token,
            clientId: stored.clientId,
            scopes: stored.scopes,
            expiresAt: Math.floor(stored.expiresAt / 1000),
            resource,
            extra: { ...extra },
          };
        } catch {
          // fall through to PB token
        }

        // 2) Direct PocketBase JWT
        try {
          const ctx = await validateBearerToken(pbUrl, `Bearer ${token}`);
          const extra: BridgeExtra = {
            sub: ctx.userId,
            email: ctx.email,
            pbToken: ctx.token,
            timezone: ctx.timezone,
            auth_method: "pocketbase",
          };
          return {
            token,
            clientId: "pocketbase",
            scopes: ["mcp:tools"],
            expiresAt: jwtExpiresAt(token),
            resource,
            extra: { ...extra },
          };
        } catch (err) {
          throw new OAuthError(
            OAuthErrorCode.InvalidToken,
            err instanceof Error ? err.message : "Invalid access token"
          );
        }
      },
    }),

    mapAuthInfo(authInfo: OAuthAuthInfo) {
      const extra = (authInfo.extra ?? {}) as Partial<BridgeExtra>;
      const user: BridgeUser = {
        userId: String(extra.sub ?? ""),
        email: String(extra.email ?? ""),
        pbToken: String(extra.pbToken ?? ""),
        timezone: String(extra.timezone ?? "UTC"),
        authMethod: extra.auth_method === "oauth" ? "oauth" : "pocketbase",
      };
      return {
        user,
        payload: { ...extra, scopes: authInfo.scopes },
        permissions: authInfo.scopes,
      };
    },
  });
}

/**
 * Build a per-request AuthManager from the verified ctx.auth.
 * Call at the top of every tool/resource handler.
 */
export function getAuthManager(
  ctxAuth: { user: BridgeUser } | undefined,
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
