/**
 * mcp-use OAuth 2.1 authorization-server routes (Hono).
 *
 * Phase 5 of the mcp-use migration. mcp-use's built-in `oauthCustomProvider`
 * only mounts `.well-known/*` metadata + the `/mcp` bearer middleware, and its
 * generic custom-provider `/authorize` / `/token` handlers assume the issuer is
 * an EXTERNAL OAuth server — for us the issuer IS this server, so those handlers
 * would self-loop. We therefore mount our own PocketBase-backed routes on
 * `server.app` (Hono) BEFORE `server.listen()`, so they win over mcp-use's
 * later-registered handlers.
 *
 * Routes: /authorize, /token, /register, /revoke, /auth/callback, /auth/login,
 * plus an override of the authorization-server metadata. All flow logic is
 * shared with the legacy Express path via framework-agnostic helpers in
 * `src/oauth.ts`, so both transports issue tokens into the same in-memory store
 * that `pocketbaseOAuthBridge.verifyToken` reads on `/mcp`.
 */

import { createHash, randomUUID } from "node:crypto";
import { cors } from "hono/cors";
import type { MCPServer } from "mcp-use/server";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import {
  PocketBaseOAuthProvider,
  buildAuthorizePage,
  getRegisteredClient,
  registerClient,
  handleOAuthCallback,
  handlePasswordLogin,
} from "../oauth.js";

const SCOPES = ["mcp:tools"];

/** PKCE S256: base64url(sha256(verifier)). */
function base64UrlSha256(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

function errorPage(title: string, msg: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:-apple-system,system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:1rem"><h1 style="font-size:1.5rem">${title}</h1><p style="color:#a3a3a3">${msg}</p></div></body></html>`;
}

/**
 * Mount the OAuth authorization-server routes on the mcp-use Hono app.
 * Call before `server.listen()`.
 */
export function registerOAuthRoutes(
  server: MCPServer,
  pbUrl: string,
  serverUrl: string
): void {
  const app = server.app;
  const provider = new PocketBaseOAuthProvider(pbUrl, serverUrl);

  // CORS for browser-based MCP clients (claude.ai). mcp-use also adds CORS for
  // /authorize, /token and /.well-known/*, but only via handlers registered
  // after ours — so we add our own ahead of every route we own.
  const oauthCors = cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  });
  for (const p of [
    "/authorize",
    "/token",
    "/register",
    "/revoke",
    "/auth/login",
    "/.well-known/oauth-authorization-server",
    "/.well-known/openid-configuration",
  ]) {
    app.use(p, oauthCors);
  }

  // ── Authorization Server Metadata ────────────────────────────────────────
  // Override mcp-use's non-proxy handler, which fetches metadata from the
  // issuer (== this server) and would recurse. We are the authorization server.
  const metadata = (c: any) =>
    c.json({
      issuer: serverUrl,
      authorization_endpoint: `${serverUrl}/authorize`,
      token_endpoint: `${serverUrl}/token`,
      registration_endpoint: `${serverUrl}/register`,
      revocation_endpoint: `${serverUrl}/revoke`,
      scopes_supported: SCOPES,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  app.get("/.well-known/oauth-authorization-server", metadata);
  app.get("/.well-known/openid-configuration", metadata);

  // ── /authorize — render the PocketBase login page ────────────────────────
  const authorize = async (c: any) => {
    const params =
      c.req.method === "POST" ? await c.req.parseBody() : c.req.query();
    const clientId = params.client_id as string | undefined;
    const redirectUri = params.redirect_uri as string | undefined;
    const responseType = params.response_type as string | undefined;
    const codeChallenge = params.code_challenge as string | undefined;
    const codeChallengeMethod =
      (params.code_challenge_method as string) || "S256";
    const state = params.state as string | undefined;
    const scope = params.scope as string | undefined;

    if (!clientId || !redirectUri || responseType !== "code" || !codeChallenge) {
      return c.html(
        errorPage("Invalid request", "Missing or invalid OAuth parameters."),
        400
      );
    }
    if (codeChallengeMethod !== "S256") {
      return c.html(
        errorPage("Unsupported PKCE method", "Only S256 is supported."),
        400
      );
    }

    const client = getRegisteredClient(clientId);
    if (!client) {
      return c.html(
        errorPage("Unknown client", "Please register before authorizing."),
        400
      );
    }
    if (client.redirect_uris && !client.redirect_uris.includes(redirectUri)) {
      return c.html(
        errorPage(
          "Invalid redirect_uri",
          "redirect_uri is not registered for this client."
        ),
        400
      );
    }

    const authParams: AuthorizationParams = {
      redirectUri,
      codeChallenge,
      scopes: scope ? scope.split(" ") : SCOPES,
      state,
    };

    const html = await buildAuthorizePage(client, authParams, pbUrl, serverUrl);
    return c.html(html);
  };
  app.get("/authorize", authorize);
  app.post("/authorize", authorize);

  // ── /token — authorization_code (with PKCE) or refresh_token ─────────────
  app.post("/token", async (c: any) => {
    const body = await c.req.parseBody();
    const grantType = body.grant_type as string | undefined;
    const clientId = body.client_id as string | undefined;

    try {
      const client = clientId ? getRegisteredClient(clientId) : undefined;
      if (!client) {
        return c.json(
          { error: "invalid_client", error_description: "Unknown client_id" },
          401
        );
      }

      if (grantType === "authorization_code") {
        const code = body.code as string | undefined;
        const codeVerifier = body.code_verifier as string | undefined;
        const redirectUri = body.redirect_uri as string | undefined;
        if (!code || !codeVerifier) {
          return c.json(
            {
              error: "invalid_request",
              error_description: "Missing code or code_verifier",
            },
            400
          );
        }
        // PKCE S256 verification — provider.exchange* does not check it.
        const expected = await provider.challengeForAuthorizationCode(
          client,
          code
        );
        if (base64UrlSha256(codeVerifier) !== expected) {
          return c.json(
            {
              error: "invalid_grant",
              error_description: "PKCE verification failed",
            },
            400
          );
        }
        const tokens = await provider.exchangeAuthorizationCode(
          client,
          code,
          codeVerifier,
          redirectUri
        );
        return c.json(tokens);
      }

      if (grantType === "refresh_token") {
        const refreshToken = body.refresh_token as string | undefined;
        const scope = body.scope as string | undefined;
        if (!refreshToken) {
          return c.json(
            {
              error: "invalid_request",
              error_description: "Missing refresh_token",
            },
            400
          );
        }
        const tokens = await provider.exchangeRefreshToken(
          client,
          refreshToken,
          scope ? scope.split(" ") : undefined
        );
        return c.json(tokens);
      }

      return c.json({ error: "unsupported_grant_type" }, 400);
    } catch (err) {
      console.error(
        "[OAuth] /token error:",
        err instanceof Error ? err.message : err
      );
      return c.json(
        {
          error: "invalid_grant",
          error_description:
            err instanceof Error ? err.message : "Token request failed",
        },
        400
      );
    }
  });

  // ── /register — Dynamic Client Registration (public PKCE clients) ────────
  app.post("/register", async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris
      : [];
    if (redirectUris.length === 0) {
      return c.json(
        {
          error: "invalid_client_metadata",
          error_description: "redirect_uris is required",
        },
        400
      );
    }
    const client: OAuthClientInformationFull = {
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      client_name: body.client_name,
      grant_types: body.grant_types ?? ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: body.scope ?? SCOPES.join(" "),
      token_endpoint_auth_method: "none",
    };
    registerClient(client);
    return c.json(client, 201);
  });

  // ── /revoke ──────────────────────────────────────────────────────────────
  app.post("/revoke", async (c: any) => {
    const body = await c.req.parseBody();
    const token = body.token as string | undefined;
    if (!token) return c.json({ error: "invalid_request" }, 400);
    const clientId = body.client_id as string | undefined;
    const client =
      (clientId ? getRegisteredClient(clientId) : undefined) ??
      ({ client_id: clientId ?? "" } as OAuthClientInformationFull);
    await provider.revokeToken(client, {
      token,
      token_type_hint: body.token_type_hint as string | undefined,
    });
    return c.body(null, 200);
  });

  // ── /auth/callback — Google/PocketBase OAuth2 provider callback ───────────
  app.get("/auth/callback", async (c: any) => {
    const result = await handleOAuthCallback(c.req.query(), pbUrl, serverUrl);
    if (result.kind === "redirect") return c.redirect(result.url, 302);
    return c.html(result.html, result.status);
  });

  // ── /auth/login — email/password fallback ────────────────────────────────
  app.post("/auth/login", async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const result = await handlePasswordLogin(body, pbUrl);
    return c.json(result.body, result.status);
  });

  console.error(
    "[OAuth] Hono routes mounted: /authorize /token /register /revoke /auth/callback /auth/login"
  );
}
