/**
 * OAuth 2.1 Authorization Server Provider for Calistenia MCP
 *
 * Implements the MCP SDK's OAuthServerProvider interface using PocketBase
 * as the identity provider. Supports:
 *   - Dynamic Client Registration (RFC 7591)
 *   - Authorization Code + PKCE (OAuth 2.1)
 *   - Token Refresh
 *   - Token Revocation (RFC 7009)
 *
 * All state is in-memory (clients, codes, tokens). A server restart
 * invalidates everything — clients re-register automatically.
 */

import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import PocketBase from "pocketbase";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface PendingAuth {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  createdAt: number;
}

interface StoredAuthCode {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  userId: string;
  pbToken: string;
  email: string;
  scopes: string[];
  expiresAt: number;
}

interface StoredToken {
  clientId: string;
  userId: string;
  pbToken: string;
  email: string;
  scopes: string[];
  expiresAt: number;
  refreshToken?: string;
}

// ── In-memory stores ─────────────────────────────────────────────────────────

const clients = new Map<string, OAuthClientInformationFull>();
const pendingAuths = new Map<string, PendingAuth>();
const authCodes = new Map<string, StoredAuthCode>();
const accessTokens = new Map<string, StoredToken>();
const refreshTokens = new Map<string, string>(); // refreshToken → accessToken

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingAuths) {
    if (now - v.createdAt > 10 * 60 * 1000) pendingAuths.delete(k);
  }
  for (const [k, v] of authCodes) {
    if (now > v.expiresAt) authCodes.delete(k);
  }
  for (const [k, v] of accessTokens) {
    if (now > v.expiresAt) {
      accessTokens.delete(k);
      if (v.refreshToken) refreshTokens.delete(v.refreshToken);
    }
  }
}, 5 * 60 * 1000).unref();

function generateToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Client Store ─────────────────────────────────────────────────────────────

class InMemoryClientStore implements OAuthRegisteredClientsStore {
  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ): OAuthClientInformationFull {
    const registered: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    clients.set(registered.client_id, registered);
    console.error(`[OAuth] Registered client: ${registered.client_name ?? registered.client_id}`);
    return registered;
  }
}

// ── OAuth Provider ───────────────────────────────────────────────────────────

export class PocketBaseOAuthProvider implements OAuthServerProvider {
  private clientStore = new InMemoryClientStore();

  constructor(private pbUrl: string) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return this.clientStore;
  }

  /**
   * Renders a login page. The form submits to POST /auth/login,
   * which authenticates with PocketBase and redirects back with an auth code.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const authId = randomUUID();
    pendingAuths.set(authId, { client, params, createdAt: Date.now() });

    res.type("html").send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <title>Calistenia – Sign In</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
    .card{background:#171717;border:1px solid #262626;border-radius:16px;padding:2rem;width:100%;max-width:380px}
    h1{font-size:1.5rem;margin-bottom:.25rem}
    .sub{color:#a3a3a3;margin-bottom:1.5rem;font-size:.875rem}
    label{display:block;font-size:.875rem;margin-bottom:.25rem;color:#d4d4d4}
    input[type=email],input[type=password]{width:100%;padding:.625rem .75rem;border:1px solid #404040;border-radius:8px;background:#262626;color:#e5e5e5;font-size:1rem;margin-bottom:1rem}
    input:focus{outline:none;border-color:#3b82f6}
    button{width:100%;padding:.75rem;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:500;transition:background .15s}
    button:hover{background:#2563eb}
    button:disabled{opacity:.6;cursor:not-allowed}
    .err{background:#450a0a;border:1px solid #7f1d1d;border-radius:8px;padding:.75rem;margin-bottom:1rem;font-size:.875rem;color:#fca5a5;display:none}
    .info{font-size:.8rem;color:#737373;margin-top:1rem;text-align:center}
  </style>
</head><body>
  <div class="card">
    <h1>Calistenia</h1>
    <p class="sub">Sign in to authorize access to your account.</p>
    <div class="err" id="err"></div>
    <form id="f">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="email" autofocus />
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required autocomplete="current-password" />
      <input type="hidden" name="auth_id" value="${authId}" />
      <button type="submit" id="btn">Sign In</button>
    </form>
    <p class="info">Requested by: ${escapeHtml(client.client_name ?? client.client_id)}</p>
  </div>
  <script>
    document.getElementById("f").addEventListener("submit",async e=>{
      e.preventDefault();
      const btn=document.getElementById("btn"),err=document.getElementById("err");
      btn.disabled=true;btn.textContent="Signing in…";err.style.display="none";
      try{
        const fd=new FormData(e.target);
        const r=await fetch("/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(fd))});
        const d=await r.json();
        if(d.redirect){window.location.href=d.redirect}
        else{err.textContent=d.error||"Invalid credentials";err.style.display="block";btn.disabled=false;btn.textContent="Sign In"}
      }catch{err.textContent="Network error";err.style.display="block";btn.disabled=false;btn.textContent="Sign In"}
    });
  </script>
</body></html>`);
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const code = authCodes.get(authorizationCode);
    if (!code) throw new Error("Invalid authorization code");
    return code.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    const code = authCodes.get(authorizationCode);
    if (!code) throw new Error("Invalid authorization code");
    if (code.clientId !== client.client_id) throw new Error("Client mismatch");

    authCodes.delete(authorizationCode);

    // Refresh PB session to ensure it's still valid
    const pb = new PocketBase(this.pbUrl);
    pb.authStore.save(code.pbToken, null);
    const result = await pb.collection("users").authRefresh();

    const accessToken = generateToken();
    const refreshToken = generateToken();
    const expiresIn = 3600;

    const tokenData: StoredToken = {
      clientId: client.client_id,
      userId: result.record.id,
      pbToken: pb.authStore.token,
      email: result.record.email as string,
      scopes: code.scopes,
      expiresAt: Date.now() + expiresIn * 1000,
      refreshToken,
    };

    accessTokens.set(accessToken, tokenData);
    refreshTokens.set(refreshToken, accessToken);

    console.error(`[OAuth] Token issued for ${tokenData.email}`);

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: code.scopes.join(" "),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    const oldAccessToken = refreshTokens.get(refreshToken);
    if (!oldAccessToken) throw new Error("Invalid refresh token");

    const oldToken = accessTokens.get(oldAccessToken);
    if (!oldToken) throw new Error("Invalid refresh token");
    if (oldToken.clientId !== client.client_id) throw new Error("Client mismatch");

    // Refresh PB session
    const pb = new PocketBase(this.pbUrl);
    pb.authStore.save(oldToken.pbToken, null);
    const result = await pb.collection("users").authRefresh();

    // Revoke old tokens
    accessTokens.delete(oldAccessToken);
    refreshTokens.delete(refreshToken);

    // Issue new tokens
    const newAccessToken = generateToken();
    const newRefreshToken = generateToken();
    const expiresIn = 3600;

    const tokenData: StoredToken = {
      clientId: client.client_id,
      userId: result.record.id,
      pbToken: pb.authStore.token,
      email: result.record.email as string,
      scopes: scopes ?? oldToken.scopes,
      expiresAt: Date.now() + expiresIn * 1000,
      refreshToken: newRefreshToken,
    };

    accessTokens.set(newAccessToken, tokenData);
    refreshTokens.set(newRefreshToken, newAccessToken);

    console.error(`[OAuth] Token refreshed for ${tokenData.email}`);

    return {
      access_token: newAccessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: tokenData.scopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const data = accessTokens.get(token);
    if (!data) throw new Error("Invalid access token");
    if (Date.now() > data.expiresAt) {
      accessTokens.delete(token);
      throw new Error("Token expired");
    }

    return {
      token,
      clientId: data.clientId,
      scopes: data.scopes,
      expiresAt: Math.floor(data.expiresAt / 1000),
      extra: {
        userId: data.userId,
        pbToken: data.pbToken,
        email: data.email,
      },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    const { token, token_type_hint } = request;

    if (token_type_hint === "refresh_token" || refreshTokens.has(token)) {
      const at = refreshTokens.get(token);
      if (at) {
        accessTokens.delete(at);
        refreshTokens.delete(token);
      }
    } else {
      const td = accessTokens.get(token);
      if (td?.refreshToken) refreshTokens.delete(td.refreshToken);
      accessTokens.delete(token);
    }
  }
}

// ── Login route (form submission handler) ────────────────────────────────────

export function createLoginRouter(pbUrl: string): Router {
  const router = Router();

  router.post("/auth/login", async (req: Request, res: Response) => {
    const { email, password, auth_id } = req.body;

    const pending = pendingAuths.get(auth_id);
    if (!pending) {
      res.status(400).json({ error: "Invalid or expired authorization session" });
      return;
    }

    try {
      const pb = new PocketBase(pbUrl);
      const authResult = await pb.collection("users").authWithPassword(email, password);

      pendingAuths.delete(auth_id);

      // Store authorization code
      const code = randomUUID();
      authCodes.set(code, {
        clientId: pending.client.client_id,
        codeChallenge: pending.params.codeChallenge,
        redirectUri: pending.params.redirectUri,
        userId: authResult.record.id,
        pbToken: pb.authStore.token,
        email: authResult.record.email as string,
        scopes: pending.params.scopes ?? ["mcp:tools"],
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      console.error(`[OAuth] Auth code issued for ${authResult.record.email}`);

      // Redirect back to the client
      const redirectUrl = new URL(pending.params.redirectUri);
      redirectUrl.searchParams.set("code", code);
      if (pending.params.state) {
        redirectUrl.searchParams.set("state", pending.params.state);
      }

      res.json({ redirect: redirectUrl.toString() });
    } catch (err) {
      console.error("[OAuth] Login failed:", err instanceof Error ? err.message : err);
      res.status(401).json({ error: "Invalid email or password" });
    }
  });

  return router;
}
