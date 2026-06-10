# Migration Plan — `@modelcontextprotocol/sdk` + Express → `mcp-use`

Status: PLAN (not started). Branch suggestion: `feat/mcp-use-migration`.

## Phase 1 — SPIKE RESULTS (done 2026-06-10, mcp-use v1.30.2)

Scaffolded `create-mcp-use-app --template starter` in `/tmp/mcp-use-spike`, installed, read real `.d.ts`. Findings:

- **Tool returns need NO rewrite.** `ToolCallback` returns `TypedCallToolResult<T> | CallToolResult` — the 71 tools' existing `{ content: [...], structuredContent }` shape is already valid. Phase 3 shrinks to: change the registration wrapper + read auth from `ctx`. Response shape stays. (`error()`/`object()` optional polish only.)
- **Auth path = `oauthCustomProvider` → `ctx.auth`** (NOT middleware state). The tool handler `ctx` is `EnhancedToolContext = ToolContext & McpContext`, so `ctx.auth: AuthInfo` is populated when OAuth is configured. `CustomOAuthConfig` gives us the exact hooks:
  - `verifyToken(token) → { payload }` — wrap **both** OAuth-token verify **and** PB-Bearer fallback here → preserves dual-auth, all inbound verification in one place.
  - `getUserInfo(payload) → UserInfo` — `UserInfo` has `[key: string]: unknown`, so carry `userId/email/pbToken/timezone`. Tools build `AuthManager` from `ctx.auth.user`.
  - `issuer/authEndpoint/tokenEndpoint` point at **our own** ported Hono OAuth routes.
- **OAuth flow port confirmed feasible.** Exports include `oauthCustomProvider`, `oauthProxy`, `jwksVerifier`, `VerifyToken`. mcp-use auto-serves `.well-known/*` + JWT-verify middleware + 401 `WWW-Authenticate` when `oauth` configured. We port only `/authorize`/`/token`/`/register`/`/revoke`/login from `oauth.ts` to `server.app.*` Hono routes. ⚠️ validate: built-in providers assume **DCR-direct** (clients hit authorize/token directly); `CustomOAuthConfig` has no `registerEndpoint` field — confirm DCR `/register` wiring in Phase 5.
- **Express middleware auto-adapts.** Exports `adaptMiddleware`, `adaptConnectMiddleware`, `isExpressMiddleware`; docs confirm `express-rate-limit`/`morgan` work. **multer may be reusable via the adapter** → lowers Phase 6 risk. Validate multipart + SSE early.
- **No stdio transport in `MCPServer` (HTTP-only)** → confirms drop decision. `listen(port?)`, also `getHandler()` for serverless.
- **Toolchain:** mcp-use ships its own CLI bundler — `mcp-use dev|build|start` (replaces `tsc`); `postinstall: mcp-use generate-types`. `tsconfig` uses `moduleResolution: bundler`, `jsx: react-jsx`. Zod v4 compatible (spike pins 4.3.5; we have 4.3.6). Node 26 install clean.
- **API sig changes** vs current SDK: `server.resource({name,uri,description}, cb)`, `server.prompt({name,description,schema}, cb)`, custom HTTP via `server.app.get/post` (NOT `server.get`). MCP middleware `server.use('mcp:*', (ctx,next))`.

**Net effect on plan:** Phase 3 much cheaper (no per-tool return rewrite). Phase 5 has a clean idiomatic hook (`oauthCustomProvider`) but still needs the authz-server routes ported. Phase 6 likely eased by Express-middleware adapter. No blockers found.

---

## 0. Why this is non-trivial

The current `mcp-server/` is a **unified Express app** doing three jobs on one port:

1. **MCP** (`/mcp`) — raw `@modelcontextprotocol/sdk` `McpServer`, stateless StreamableHTTP, **a new server instance built per request** with the user's `AuthManager` captured in closures.
2. **OAuth 2.1 authorization server** — custom PocketBase-as-IdP (`oauth.ts`, 543 lines) wired through the SDK's Express-only `mcpAuthRouter` (`/authorize`, `/token`, `/register`, `/revoke`, `/.well-known/*`) + a login form router.
3. **REST API** (`/api/*`) — 14 routes, Express `Router`, **multer** multipart uploads (≤5 images), in-memory rate limiter, and **SSE streaming** (`/api/generate-free-session`).

`mcp-use` is **Hono-based**, a **single long-lived server** with `ctx.auth` / `ctx.state`, response helpers (`text()`, `object()`, `error()`), HMR, built-in inspector. None of Express/multer/`mcpAuthRouter` carries over. So this is a real rewrite of the framework layer, with the business logic preserved.

## 1. What carries over unchanged (framework-agnostic)

These modules have no Express/SDK coupling — move as-is:

- `src/api/`: `meal-analyzer.ts`, `food-lookup.ts`, `meal-plan-generator.ts`, `weekly-insight-generator.ts`, `free-session-generator.ts` (logic only — its `req/res` glue gets re-wired), `model-resolver.ts`, `push-sender.ts`, `job-processor.ts`, `admin-pb.ts`, `config.ts`, `schemas.ts`, `prompts.ts`.
- `src/lib/` (`wger.ts`, `wger-mappings.ts`, `i18n.ts`), `src/data/`, `src/utils.ts`.
- `src/instrumentation.ts` (Langfuse OTel) — keep, must stay imported **before** any AI SDK use.
- `src/auth.ts` — `AuthManager` + `validateBearerToken` largely intact; reused by the new auth middleware.

## 2. Target architecture (mcp-use)

```
new MCPServer({ name, title, version, instructions, ... })
  ├─ server.use('mcp:*', authMiddleware)         // OAuth + PB dual-auth → ctx.state.auth
  ├─ 71 tools                                     // registered ONCE, read auth from ctx
  ├─ 3 resources, 3 prompts
  ├─ server.post('/api/...')                      // REST ported to Hono routes
  ├─ OAuth routes (Hono)                          // ported PB authz-server OR dropped (DECISION)
  └─ server.get('/health')
server.listen(PORT)
```

Key shift: **stop building a server per request.** Register tools once; the per-call user `AuthManager` comes from `ctx.state.auth` set by middleware. This bridges the existing `mcpAuth` logic cleanly onto `server.use('mcp:*', ...)`.

## 3. Phases

### Phase 1 — Scaffold & spike (low risk)
- `npx create-mcp-use-app` into a scratch dir; study generated `index.ts`, `package.json`, `tsconfig`, dev/build scripts, inspector wiring.
- Confirm: (a) stdio transport support, (b) how `ctx.auth` / `ctx.state` is populated, (c) custom-route + middleware API, (d) Node 26 compatibility.
- Decide layout: migrate in place on a branch vs. new `mcp-server-v2/` then swap.

### Phase 2 — Auth bridge ✅ DONE (2026-06-11, branch feat/mcp-use-migration)
Implemented via `oauthCustomProvider` (not middleware-state — spike showed `ctx.auth` is the idiomatic path):
- `src/mcpuse/auth-bridge.ts` — `pocketbaseOAuthBridge(pbUrl, serverUrl)`: `verifyToken` = OAuth in-memory store → PB-JWT fallback (dual-auth preserved); `getUserInfo` carries `userId/email/pbToken/timezone/authMethod`. Plus `getAuthManager(ctx.auth, pbUrl)` for handlers.
- `src/oauth.ts` — extracted `verifyStoredAccessToken()` (shared by legacy provider + bridge); exported `StoredToken`.
- `src/server.ts` — new mcp-use entry: MCPServer + oauth bridge + `mcp:*` logging middleware + `cal_whoami` smoke tool + `/health` Hono route. Legacy `index.ts` untouched.
**Verified locally** (PB 0.36.8 + tsx): boot OK, `/health` OK, no-auth /mcp → 401 + `WWW-Authenticate` + `.well-known` metadata, garbage token → 401, real PB JWT → initialize/tools/call `cal_whoami` returns correct user (`auth_method: "pocketbase"`), `[Auth]` middleware log fires. OAuth-token leg untestable until Phase 5 routes ported (flow lives in legacy Express).
Test env notes: local-only changes — enabled `passwordAuth` on `users` collection in local pb_data, created `mcptest@example.com` / local superuser `mcptest-admin@example.com`. NOT in prod.

### Phase 3 — Tools (largest mechanical lift)
- For each of 10 files, change `registerXTools(server, auth)` → register against the mcp-use server, and move `pb/userId/tz` access **inside** each handler reading `ctx.state.auth` (currently captured at register time via closure).
- Response shape: existing `{ content, structuredContent }` likely still valid, but idiomatically convert to `object()` / `text()` / `error()` helpers (`errorResult` in utils → `error()`).
- Order by size/risk: health, gamification, media, circuits, workouts, exercises, smart, progress, nutrition, programs.

### Phase 4 — Resources & prompts
- 3 resources (`server.resource`) + 3 prompts (`server.prompt`) → mcp-use equivalents, auth from ctx.

### Phase 5 — OAuth authz-server (DECISION REQUIRED)
- `mcpAuthRouter` is Express-only and PB isn't a standard OAuth IdP, so mcp-use's `oauthProxy`/`jwksVerifier` don't fit. Two paths:
  - **(a) Keep OAuth 2.1 flow**: port `oauth.ts` + login router + `.well-known` routes to Hono custom routes. Most work, preserves Claude Desktop remote-OAuth UX.
  - **(b) Drop OAuth, PB-token only**: simplest, but remote MCP clients must paste a PB Bearer token (no browser auth flow).

### Phase 6 — REST API (DECISION REQUIRED)
- 14 Express routes → either:
  - **(a) Port to Hono**: multer → `c.req.parseBody()`/formData, SSE → Hono `streamSSE`, rate limiter → Hono middleware. Full "complete migration."
  - **(b) Keep Express REST on a side port/process**, mcp-use owns MCP only. Lower risk, not a single unified server.

### Phase 7 — stdio entrypoint (DECISION REQUIRED)
- If mcp-use lacks stdio: keep a thin `stdio.ts` on the old SDK, or drop stdio (rely on HTTP + inspector). Confirm in Phase 1.

### Phase 8 — Build, Docker, env, deploy
- Replace `tsc` scripts with mcp-use dev/build/start; update `Dockerfile`, `.dockerignore`, `data/` copy (per memory note), `.env.example`.
- Keep `PORT`/`POCKETBASE_URL`/`SERVER_URL`/AI keys/`INTERNAL_API_KEY`.

### Phase 9 — Test & cut over
- `mcp-use client` CLI + inspector to exercise tools; Playwright MCP for app integration (mobile app hits `/api/*` and `/mcp`).
- Verify the prod hook-sessions-400 path isn't regressed.
- Update mobile app `AI_API_URL` only if endpoints/port change.

## 4. Effort & risk

- **Mechanical bulk**: 71 tools (Phase 3) — large but repetitive; scriptable/agent-parallelizable.
- **Highest risk**: OAuth (Phase 5) and REST/multer/SSE (Phase 6) — no clean mcp-use mapping.
- **Open questions for Phase 1**: stdio support, ctx.auth shape, Node 26.

## 5. Decisions (LOCKED 2026-06-10)
1. **OAuth 2.1 flow → PORT to Hono** (Phase 5a). Keep browser-auth UX + PB-token fallback.
2. **REST `/api/*` → PORT to Hono** (Phase 6a). True single unified mcp-use server. multer→`parseBody`, SSE→`streamSSE`, rate-limit→Hono mw.
3. **stdio → DROP** (Phase 7b). HTTP + inspector only. Delete `stdio.ts` + `dev:stdio`/`start:stdio` scripts. Remove SDK-stdio import.

Net: full unified migration, no Express, no stdio, single `MCPServer` on one port. `@modelcontextprotocol/sdk` removed entirely once Phases 5–6 land.
