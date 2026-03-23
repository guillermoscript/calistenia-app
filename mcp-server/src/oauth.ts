/**
 * OAuth 2.1 Authorization Server Provider for Calistenia MCP
 *
 * Implements the MCP SDK's OAuthServerProvider interface using PocketBase
 * as the identity provider. Supports Google OAuth (via PocketBase) and
 * optional email/password fallback.
 *
 * Flow for Google OAuth:
 *   1. Claude Desktop → GET /authorize → renders login page with Google button
 *   2. User clicks Google → redirected to Google OAuth
 *   3. Google → GET /auth/callback → exchanges code with PocketBase
 *   4. MCP server creates auth code → redirects to Claude Desktop
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

/** Maps PocketBase OAuth state → our authId so we can find the pending auth after provider callback */
interface PbOAuthPending {
  authId: string;
  providerName: string;
  codeVerifier: string;
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
const pbOAuthPendings = new Map<string, PbOAuthPending>(); // PB state → pending info
const authCodes = new Map<string, StoredAuthCode>();
const accessTokens = new Map<string, StoredToken>();
const refreshTokens = new Map<string, string>(); // refreshToken → accessToken

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingAuths) {
    if (now - v.createdAt > 10 * 60 * 1000) {
      pendingAuths.delete(k);
    }
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

// ── Helper: complete pending auth → create MCP auth code → redirect URL ─────

function completePendingAuth(
  authId: string,
  userId: string,
  pbToken: string,
  email: string
): string | null {
  const pending = pendingAuths.get(authId);
  if (!pending) return null;

  pendingAuths.delete(authId);

  const code = randomUUID();
  authCodes.set(code, {
    clientId: pending.client.client_id,
    codeChallenge: pending.params.codeChallenge,
    redirectUri: pending.params.redirectUri,
    userId,
    pbToken,
    email,
    scopes: pending.params.scopes ?? ["mcp:tools"],
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  console.error(`[OAuth] Auth code issued for ${email}`);

  const redirectUrl = new URL(pending.params.redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (pending.params.state) {
    redirectUrl.searchParams.set("state", pending.params.state);
  }

  return redirectUrl.toString();
}

// ── OAuth Provider ───────────────────────────────────────────────────────────

export class PocketBaseOAuthProvider implements OAuthServerProvider {
  private clientStore = new InMemoryClientStore();

  constructor(
    private pbUrl: string,
    private serverUrl: string
  ) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    return this.clientStore;
  }

  /**
   * Fetches PocketBase auth methods and renders a login page with
   * Google OAuth button and optional email/password form.
   */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const authId = randomUUID();
    pendingAuths.set(authId, { client, params, createdAt: Date.now() });

    // Fetch available auth methods from PocketBase
    const pb = new PocketBase(this.pbUrl);
    let providers: Array<{
      name: string;
      displayName: string;
      state: string;
      codeVerifier: string;
      authURL: string;
    }> = [];
    let passwordEnabled = false;

    try {
      const methods = await pb.collection("users").listAuthMethods();
      passwordEnabled = methods.password?.enabled ?? false;

      if (methods.oauth2?.enabled && methods.oauth2.providers) {
        const callbackUrl = `${this.serverUrl}/auth/callback`;
        providers = methods.oauth2.providers.map((p: any) => {
          // Store PB OAuth state → our authId mapping
          pbOAuthPendings.set(p.state, {
            authId,
            providerName: p.name,
            codeVerifier: p.codeVerifier,
          });

          // Build the full auth URL with our callback
          const authUrl = new URL(p.authURL);
          authUrl.searchParams.set("redirect_uri", callbackUrl);
          return {
            name: p.name,
            displayName: p.displayName ?? p.name,
            state: p.state,
            codeVerifier: p.codeVerifier,
            authURL: authUrl.toString(),
          };
        });
      }
    } catch (err) {
      console.error("[OAuth] Failed to fetch PB auth methods:", err);
    }

    // Build provider buttons HTML
    const providerButtons = providers
      .map(
        (p) =>
          `<a href="${escapeHtml(p.authURL)}" class="btn provider-btn">${escapeHtml(p.displayName)}</a>`
      )
      .join("\n      ");

    const passwordFormHtml = passwordEnabled
      ? `
      <div class="divider"><span>or</span></div>
      <form id="f">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required autocomplete="email" />
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" />
        <input type="hidden" name="auth_id" value="${authId}" />
        <button type="submit" class="btn btn-secondary" id="btn">Sign In with Email</button>
      </form>
      <script>
        document.getElementById("f").addEventListener("submit",async e=>{
          e.preventDefault();
          const btn=document.getElementById("btn"),err=document.getElementById("err");
          btn.disabled=true;btn.textContent="Signing in...";err.style.display="none";
          try{
            const fd=new FormData(e.target);
            const r=await fetch("/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(fd))});
            const d=await r.json();
            if(d.redirect){window.location.href=d.redirect}
            else{err.textContent=d.error||"Invalid credentials";err.style.display="block";btn.disabled=false;btn.textContent="Sign In with Email"}
          }catch{err.textContent="Network error";err.style.display="block";btn.disabled=false;btn.textContent="Sign In with Email"}
        });
      </script>`
      : "";

    res.type("html").send(`<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <title>Calistenia - Sign In</title>
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
    .btn{display:block;width:100%;padding:.75rem;border:none;border-radius:8px;font-size:1rem;cursor:pointer;font-weight:500;transition:background .15s;text-align:center;text-decoration:none;margin-bottom:.5rem}
    .provider-btn{background:#fff;color:#1a1a1a}
    .provider-btn:hover{background:#e5e5e5}
    .btn-secondary{background:#3b82f6;color:#fff}
    .btn-secondary:hover{background:#2563eb}
    .btn:disabled{opacity:.6;cursor:not-allowed}
    .err{background:#450a0a;border:1px solid #7f1d1d;border-radius:8px;padding:.75rem;margin-bottom:1rem;font-size:.875rem;color:#fca5a5;display:none}
    .info{font-size:.8rem;color:#737373;margin-top:1rem;text-align:center}
    .divider{display:flex;align-items:center;margin:1.25rem 0;color:#525252;font-size:.8rem}
    .divider::before,.divider::after{content:'';flex:1;border-bottom:1px solid #333}
    .divider span{padding:0 .75rem}
  </style>
</head><body>
  <div class="card">
    <h1>Calistenia</h1>
    <p class="sub">Sign in to authorize access to your account.</p>
    <div class="err" id="err"></div>
    ${providerButtons || "<p style='color:#737373;font-size:.875rem'>No login methods available</p>"}
    ${passwordFormHtml}
    <p class="info">Requested by: ${escapeHtml(client.client_name ?? client.client_id)}</p>
  </div>
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

// ── Auth routes ──────────────────────────────────────────────────────────────

export function createLoginRouter(pbUrl: string, serverUrl: string): Router {
  const router = Router();

  // ── Google/OAuth provider callback ──────────────────────────────────────
  router.get("/auth/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      res.status(400).send(`<h1>Authorization failed</h1><p>${escapeHtml(error)}</p>`);
      return;
    }

    if (!state || !code) {
      res.status(400).send("<h1>Missing code or state parameter</h1>");
      return;
    }

    // Look up PocketBase OAuth pending by state
    const pbPending = pbOAuthPendings.get(state);
    if (!pbPending) {
      res.status(400).send("<h1>Invalid or expired OAuth state</h1><p>Please try logging in again.</p>");
      return;
    }

    pbOAuthPendings.delete(state);

    try {
      const pb = new PocketBase(pbUrl);
      const callbackUrl = `${serverUrl}/auth/callback`;

      // Exchange the provider code with PocketBase
      const authResult = await pb.collection("users").authWithOAuth2Code(
        pbPending.providerName,
        code,
        pbPending.codeVerifier,
        callbackUrl
      );

      console.error(`[OAuth] PB OAuth success: ${authResult.record.email} via ${pbPending.providerName}`);

      // Complete the MCP auth flow
      const redirectUrl = completePendingAuth(
        pbPending.authId,
        authResult.record.id,
        pb.authStore.token,
        authResult.record.email as string
      );

      if (!redirectUrl) {
        res.status(400).send("<h1>Authorization session expired</h1><p>Please try again.</p>");
        return;
      }

      res.redirect(redirectUrl);
    } catch (err) {
      console.error("[OAuth] PB OAuth code exchange failed:", err instanceof Error ? err.message : err);
      res.status(500).send("<h1>Authentication failed</h1><p>Could not complete sign-in. Please try again.</p>");
    }
  });

  // ── Email/password login (fallback) ────────────────────────────────────
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

      const redirectUrl = completePendingAuth(
        auth_id,
        authResult.record.id,
        pb.authStore.token,
        authResult.record.email as string
      );

      if (!redirectUrl) {
        res.status(400).json({ error: "Authorization session expired" });
        return;
      }

      res.json({ redirect: redirectUrl });
    } catch (err) {
      console.error("[OAuth] Login failed:", err instanceof Error ? err.message : err);
      res.status(401).json({ error: "Invalid email or password" });
    }
  });

  return router;
}
