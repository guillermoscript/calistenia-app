# Fase 6 — REST `/api/*` Express → Hono (mcp-use migration)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar las 14 rutas REST de `src/api/index.ts` (Express) a `src/mcpuse/api-routes.ts` (Hono nativo), completando la migración mcp-use y dejando `src/index.ts` como único remanente (se eliminará en Fase 7).

**Architecture:** Seguir exactamente el patrón de `src/mcpuse/oauth-routes.ts` (Fase 5): exportar `registerApiRoutes(server, pbUrl)` que monta rutas en `server.app` (Hono) antes de `server.listen()`. Auth PocketBase inline (sin middleware Express). Rate-limit in-memory portado a helper Hono. Multipart vía `c.req.formData()`. SSE vía `result.toUIMessageStreamResponse()` (Web API Response, compatible con Hono/Node.js adapter).

**Tech Stack:** mcp-use v1.30.2, Hono (via `server.app`), PocketBase JS SDK, Vercel AI SDK v4 (`ai` package), TypeScript, tsx (dev runner).

---

## Mapa de archivos

| Acción | Archivo | Responsabilidad |
|--------|---------|-----------------|
| **Crear** | `mcp-server/src/mcpuse/api-routes.ts` | 14 rutas Hono + helpers auth/rateLimit/error/upload |
| **Modificar** | `mcp-server/src/api/free-session-generator.ts` | Agregar export `runFreeSession(messages, userContext, user)` → `Promise<Response>` |
| **Modificar** | `mcp-server/src/server.ts` | Import + llamada `registerApiRoutes(server, PB_URL)` antes de `listen()` |

**No tocar:** `src/api/index.ts` (Express, sigue vivo hasta Fase 7), `src/index.ts`.

---

## Rutas a portar (14 total)

| # | Método | Path | Auth | Upload | Especial |
|---|--------|------|------|--------|----------|
| 1 | GET | `/api/health` | ninguna | no | — |
| 2 | POST | `/api/analyze-meal` | PB token | multipart `images[]` | description opcional |
| 3 | POST | `/api/lookup-food` | PB token | no | — |
| 4 | POST | `/api/generate-meal-plan` | PB token | no | — |
| 5 | POST | `/api/send-push` | internal key ó PB token | no | `x-internal-key` header |
| 6 | POST | `/api/jobs/analyze-meal` | PB token | multipart `images[]` | job limit + PB FormData |
| 7 | POST | `/api/jobs/lookup-food` | PB token | no | job limit |
| 8 | POST | `/api/jobs/generate-meal-plan` | PB token | no | job limit |
| 9 | POST | `/api/jobs/generate-weekly-meal-plan` | PB token | no | job limit |
| 10 | POST | `/api/weekly-plan/regenerate-day` | PB token | no | admin PB + update |
| 11 | GET | `/api/jobs/:id` | PB token | no | path param |
| 12 | POST | `/api/score-meal-quality` | PB token | no | — |
| 13 | POST | `/api/generate-weekly-insight` | PB token | no | dynamic import |
| 14 | POST | `/api/generate-free-session` | PB token | no | **SSE streaming** |

---

## Task 1: Agregar `runFreeSession` a free-session-generator.ts

**Files:**
- Modify: `mcp-server/src/api/free-session-generator.ts` (al final del archivo)

El `handleGenerateFreeSession` existente usa `result.pipeUIMessageStreamToResponse(res)` (Express/Node). Para Hono necesitamos `result.toUIMessageStreamResponse()` (Web API Response). Agregar un nuevo export que comparte la lógica pero retorna `Promise<Response>`.

- [ ] **Step 1: Leer el final del archivo para posicionar el insert**

```bash
wc -l mcp-server/src/api/free-session-generator.ts
# esperado: 314 o similar
```

- [ ] **Step 2: Agregar export `runFreeSession` al final de free-session-generator.ts**

Agregar después de la función `handleGenerateFreeSession` (línea ~314):

```typescript
/**
 * Hono-compatible entry point. Caller validates inputs before calling.
 * Returns a Web API Response — either SSE stream or error.
 */
export async function runFreeSession(
  messages: any[],
  userContext: any,
  user: any
): Promise<Response> {
  const tier: Tier = user?.tier === "pro" || user?.tier === "premium" ? "pro" : "free";
  const { model, name: modelName } = resolveModel(tier);
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("free-session-generator");

  const ctx: SessionUserContext = userContext;
  let system = systemPrompt || SYSTEM_PROMPT_FALLBACK;
  const contextLines: string[] = [];
  if (ctx.age) contextLines.push(`- Edad: ${ctx.age} años`);
  if (ctx.weight) contextLines.push(`- Peso: ${ctx.weight} kg`);
  if (ctx.height) contextLines.push(`- Altura: ${ctx.height} cm`);
  if (ctx.sex) contextLines.push(`- Sexo: ${ctx.sex}`);
  if (ctx.level) contextLines.push(`- Nivel: ${ctx.level}`);
  if (ctx.goal) contextLines.push(`- Objetivo de la sesión: ${ctx.goal}`);
  if (ctx.equipment?.length) contextLines.push(`- Equipamiento disponible: ${ctx.equipment.join(", ")}`);
  if (ctx.location) contextLines.push(`- Ubicación: ${ctx.location}`);
  if (ctx.availableTime) contextLines.push(`- Tiempo disponible: ${ctx.availableTime} minutos`);
  if (contextLines.length > 0) {
    system += `\n\n## Contexto del usuario\n\n${contextLines.join("\n")}`;
  }

  const truncatedMessages = messages.slice(-10);
  let modelMessages: any;
  try {
    modelMessages = await convertToModelMessages(truncatedMessages);
  } catch (err) {
    console.error("[free-session] convertToModelMessages failed:", err);
    return Response.json({ error: "Formato de mensajes inválido" }, { status: 400 });
  }

  const result = streamText({
    model,
    system,
    messages: modelMessages,
    tools: { search_exercises: searchExercisesTool, create_session: createSessionTool },
    maxOutputTokens: 4000,
    stopWhen: stepCountIs(12),
    experimental_telemetry: {
      isEnabled: true,
      functionId: "free-session-generator",
      metadata: { tier, modelName, ...(langfusePrompt && { langfusePrompt }) },
    },
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 3: Verificar que tsc compile sin errores**

```bash
cd mcp-server && npx tsc --noEmit 2>&1 | head -30
# esperado: sin output (0 errores)
```

---

## Task 2: Crear `src/mcpuse/api-routes.ts` — helpers + rutas 1–5

**Files:**
- Create: `mcp-server/src/mcpuse/api-routes.ts`

Crear el archivo con todos los helpers (auth, rateLimit, error, upload) y las primeras 5 rutas: health, analyze-meal, lookup-food, generate-meal-plan, send-push.

- [ ] **Step 1: Crear el archivo con helpers y rutas 1–5**

```typescript
/**
 * REST /api/* routes — Hono port of src/api/index.ts (Express).
 * Phase 6 of the mcp-use migration.
 *
 * Mounted on server.app before server.listen(). Follows oauth-routes.ts pattern.
 * No Express middleware — all auth/rate-limit/upload handled inline (Hono-native).
 */

import type { MCPServer } from "mcp-use/server";
import PocketBase from "pocketbase";
import config from "../api/config.js";
import { getAvailableProviders } from "../api/model-resolver.js";
import { analyzeMealImage, scoreMealQuality, type UserContext } from "../api/meal-analyzer.js";
import { lookupFoodByName } from "../api/food-lookup.js";
import { generateDailyMealPlan } from "../api/meal-plan-generator.js";
import { sendPushToUser } from "../api/push-sender.js";
import { processJob, getAdminPB } from "../api/job-processor.js";
import { runFreeSession } from "../api/free-session-generator.js";
import type { Tier } from "../api/model-resolver.js";

// ── In-memory rate limiter (port of Express version) ─────────────────────────

interface RateBucket { windowStart: number; count: number; }
const buckets = new Map<string, RateBucket>();
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > config.rateLimit.windowMs * 2) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

interface RateLimitResult { exceeded: boolean; retryAfterMs: number; }

function applyRateLimit(c: any, userId: string): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(userId);
  if (!bucket || now - bucket.windowStart > config.rateLimit.windowMs) {
    bucket = { windowStart: now, count: 0 };
    buckets.set(userId, bucket);
  }
  bucket.count++;
  c.header("X-RateLimit-Limit", String(config.rateLimit.maxRequests));
  c.header("X-RateLimit-Remaining", String(Math.max(0, config.rateLimit.maxRequests - bucket.count)));
  c.header("X-RateLimit-Reset", new Date(bucket.windowStart + config.rateLimit.windowMs).toISOString());
  return {
    exceeded: bucket.count > config.rateLimit.maxRequests,
    retryAfterMs: bucket.windowStart + config.rateLimit.windowMs - now,
  };
}

// ── PocketBase auth helper ─────────────────────────────────────────────────────

async function getAuthUser(c: any, pbUrl: string): Promise<any | null> {
  const auth = c.req.header("authorization") as string | undefined;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const pb = new PocketBase(pbUrl);
  pb.authStore.save(token, null);
  try {
    const result = await pb.collection("users").authRefresh();
    return result.record;
  } catch {
    return null;
  }
}

// ── Tier helper ───────────────────────────────────────────────────────────────

function getTier(user: any): Tier {
  return user?.tier === "pro" || user?.tier === "premium" ? "pro" : "free";
}

// ── Error handler ──────────────────────────────────────────────────────────────

function apiError(c: any, err: unknown): Response {
  const e = err as any;
  if (e?.name?.startsWith("AI_")) {
    console.error("[ai-error]", e.name, e.message, e.cause ?? "");
    return c.json({
      error: "Error al comunicarse con el servicio de IA. Intenta de nuevo.",
      ...(process.env.NODE_ENV !== "production" && { debug: { type: e.name, message: e.message } }),
    }, 502);
  }
  if (e?.name === "ZodError") {
    return c.json({ error: "Datos inválidos", details: e.issues }, 422);
  }
  console.error("[unhandled-error]", e?.message ?? err);
  return c.json({ error: e?.status ? e.message : "Error interno del servidor" }, e?.status ?? 500);
}

// ── Job limit check ────────────────────────────────────────────────────────────

const MAX_PENDING_JOBS = 2;
async function checkJobLimit(userId: string): Promise<boolean> {
  const pb = await getAdminPB();
  const active = await pb.collection("ai_jobs").getList(1, 1, {
    filter: pb.filter("user = {:uid} && (status = 'pending' || status = 'processing')", { uid: userId }),
  });
  return active.totalItems < MAX_PENDING_JOBS;
}

// ── Register all /api/* routes ─────────────────────────────────────────────────

export function registerApiRoutes(server: MCPServer, pbUrl: string): void {
  const app = server.app;

  // ── 1. GET /api/health ────────────────────────────────────────────────────
  app.get("/api/health", (c) =>
    c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      providers: getAvailableProviders(),
      defaults: {
        provider: config.defaultProvider || "auto",
        model_free: config.defaultModelFree || "auto",
        model_pro: config.defaultModelPro || "auto",
      },
    })
  );

  // ── 2. POST /api/analyze-meal (multipart) ─────────────────────────────────
  app.post("/api/analyze-meal", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      let formData: FormData;
      try { formData = await c.req.formData(); } catch { return c.json({ error: "Se requiere multipart/form-data" }, 400); }

      const fileEntries = formData.getAll("images") as File[];
      const description = ((formData.get("description") ?? "") as string).trim();
      if (fileEntries.length === 0 && !description) {
        return c.json({ error: "Se requiere al menos una imagen o una descripcion de la comida" }, 400);
      }
      let images: { buffer: Buffer; mimeType: string }[] = [];
      if (fileEntries.length > 0) {
        for (const f of fileEntries.slice(0, 5)) {
          if (!config.upload.allowedMimeTypes.includes(f.type))
            return c.json({ error: `Tipo de archivo no soportado: ${f.type}` }, 400);
          if (f.size > config.upload.maxSizeMb * 1024 * 1024)
            return c.json({ error: "La imagen excede el tamaño máximo permitido" }, 413);
        }
        images = await Promise.all(fileEntries.slice(0, 5).map(async (f) => ({
          buffer: Buffer.from(await f.arrayBuffer()),
          mimeType: f.type,
        })));
      }
      const mealType = (formData.get("meal_type") ?? "comida") as string;
      const tier = getTier(user);
      let userContext: UserContext | undefined;
      try {
        const ctx: UserContext = {};
        const goal = formData.get("goal") as string | null;
        const logHour = formData.get("log_hour") as string | null;
        const remainingCalories = formData.get("remaining_calories") as string | null;
        if (goal) ctx.goal = goal;
        if (logHour != null) ctx.logHour = Number(logHour);
        if (remainingCalories != null) {
          ctx.remainingMacros = {
            calories: Number(remainingCalories),
            protein: Number(formData.get("remaining_protein") ?? 0),
            carbs: Number(formData.get("remaining_carbs") ?? 0),
            fat: Number(formData.get("remaining_fat") ?? 0),
          };
        }
        const recentScores = formData.get("recent_scores") as string | null;
        const topFoods = formData.get("top_foods") as string | null;
        if (recentScores) ctx.recentScores = JSON.parse(recentScores);
        if (topFoods) ctx.topFoods = JSON.parse(topFoods);
        if (Object.keys(ctx).length > 0) userContext = ctx;
      } catch { /* ignore malformed context */ }
      const result = await analyzeMealImage({ images, mealType, description, tier, userContext });
      return c.json({ meal_type: mealType, model_tier: tier, ...result });
    } catch (err) { return apiError(c, err); }
  });

  // ── 3. POST /api/lookup-food ──────────────────────────────────────────────
  app.post("/api/lookup-food", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      const body = await c.req.json().catch(() => ({}));
      const foodName = (body?.food_name as string | undefined)?.trim();
      if (!foodName) return c.json({ error: "Se requiere el nombre del alimento" }, 400);
      const result = await lookupFoodByName({ foodName, tier: getTier(user) });
      return c.json(result);
    } catch (err) { return apiError(c, err); }
  });

  // ── 4. POST /api/generate-meal-plan ───────────────────────────────────────
  app.post("/api/generate-meal-plan", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      const body = await c.req.json().catch(() => ({}));
      const { remaining_calories, remaining_protein, remaining_carbs, remaining_fat, logged_meal_types = [] } = body ?? {};
      if (remaining_calories == null) return c.json({ error: "Se requieren los macros restantes" }, 400);
      const result = await generateDailyMealPlan({
        remainingCalories: Number(remaining_calories),
        remainingProtein: Number(remaining_protein ?? 0),
        remainingCarbs: Number(remaining_carbs ?? 0),
        remainingFat: Number(remaining_fat ?? 0),
        loggedMealTypes: Array.isArray(logged_meal_types) ? logged_meal_types : [],
        tier: getTier(user),
      });
      return c.json(result);
    } catch (err) { return apiError(c, err); }
  });

  // ── 5. POST /api/send-push (internal key OR user auth) ────────────────────
  app.post("/api/send-push", async (c) => {
    const internalKey = process.env.INTERNAL_API_KEY;
    const providedKey = c.req.header("x-internal-key");
    const isInternal = !!(internalKey && providedKey === internalKey);
    if (!isInternal) {
      const user = await getAuthUser(c, pbUrl);
      if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    }
    try {
      const body = await c.req.json().catch(() => ({}));
      const { user_id, title, body: notifBody, url } = body ?? {};
      if (!user_id || !title) return c.json({ error: "Se requiere user_id y title" }, 400);
      const result = await sendPushToUser(user_id, { title, body: notifBody, url });
      return c.json(result);
    } catch (err) { return apiError(c, err); }
  });
}
```

> **Nota:** El bloque de Task 2 solo contiene rutas 1–5 para que el paso sea manejable. Tasks 3 y 4 completarán el archivo en los siguientes pasos usando `Edit`.

- [ ] **Step 2: Verificar que tsc compile sin errores después de crear el archivo**

```bash
cd mcp-server && npx tsc --noEmit 2>&1 | head -30
# esperado: sin output
```

---

## Task 3: Agregar rutas 6–11 a `api-routes.ts` (jobs + weekly-plan)

**Files:**
- Modify: `mcp-server/src/mcpuse/api-routes.ts` — insertar rutas 6–11 dentro de `registerApiRoutes`, antes del `console.error` final (que aún no existe, agregar al final de la función).

- [ ] **Step 1: Agregar rutas 6–11 dentro de `registerApiRoutes` (antes del cierre `}`)**

Localizar el cierre de `registerApiRoutes` y agregar antes de él:

```typescript
  // ── 6. POST /api/jobs/analyze-meal (multipart + job limit) ───────────────
  app.post("/api/jobs/analyze-meal", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      let formData: FormData;
      try { formData = await c.req.formData(); } catch { return c.json({ error: "Se requiere multipart/form-data" }, 400); }
      const fileEntries = formData.getAll("images") as File[];
      if (fileEntries.length === 0) return c.json({ error: "Se requiere al menos una imagen de la comida" }, 400);
      for (const f of fileEntries) {
        if (!config.upload.allowedMimeTypes.includes(f.type)) return c.json({ error: `Tipo de archivo no soportado: ${f.type}` }, 400);
        if (f.size > config.upload.maxSizeMb * 1024 * 1024) return c.json({ error: "La imagen excede el tamaño máximo permitido" }, 413);
      }
      if (!(await checkJobLimit(user.id))) {
        return c.json({ error: `Solo puedes tener ${MAX_PENDING_JOBS} analisis en proceso a la vez. Espera a que termine uno.` }, 429);
      }
      const mealType = (formData.get("meal_type") ?? "comida") as string;
      const description = (formData.get("description") ?? "") as string;
      const tier = getTier(user);
      const pb = await getAdminPB();
      const pbFormData = new FormData();
      pbFormData.append("user", user.id);
      pbFormData.append("type", "analyze-meal");
      pbFormData.append("status", "pending");
      pbFormData.append("input", JSON.stringify({ meal_type: mealType, description, tier }));
      for (const f of fileEntries.slice(0, 5)) {
        const blob = new Blob([new Uint8Array(Buffer.from(await f.arrayBuffer()))], { type: f.type });
        pbFormData.append("input_images", blob, f.name);
      }
      const record = await pb.collection("ai_jobs").create(pbFormData);
      processJob(record.id).catch((err) => console.error("[job-processor-error]", record.id, err));
      return c.json({ job_id: record.id }, 202);
    } catch (err) { return apiError(c, err); }
  });

  // ── 7. POST /api/jobs/lookup-food ─────────────────────────────────────────
  app.post("/api/jobs/lookup-food", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      const body = await c.req.json().catch(() => ({}));
      const foodName = (body?.food_name as string | undefined)?.trim();
      if (!foodName) return c.json({ error: "Se requiere el nombre del alimento" }, 400);
      if (!(await checkJobLimit(user.id))) {
        return c.json({ error: `Solo puedes tener ${MAX_PENDING_JOBS} analisis en proceso a la vez. Espera a que termine uno.` }, 429);
      }
      const pb = await getAdminPB();
      const record = await pb.collection("ai_jobs").create({
        user: user.id, type: "lookup-food", status: "pending",
        input: { food_name: foodName, tier: getTier(user) },
      });
      processJob(record.id).catch((err) => console.error("[job-processor-error]", record.id, err));
      return c.json({ job_id: record.id }, 202);
    } catch (err) { return apiError(c, err); }
  });

  // ── 8. POST /api/jobs/generate-meal-plan ──────────────────────────────────
  app.post("/api/jobs/generate-meal-plan", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      const body = await c.req.json().catch(() => ({}));
      const { remaining_calories, remaining_protein, remaining_carbs, remaining_fat, logged_meal_types = [] } = body ?? {};
      if (remaining_calories == null) return c.json({ error: "Se requieren los macros restantes" }, 400);
      if (!(await checkJobLimit(user.id))) {
        return c.json({ error: `Solo puedes tener ${MAX_PENDING_JOBS} analisis en proceso a la vez. Espera a que termine uno.` }, 429);
      }
      const pb = await getAdminPB();
      const record = await pb.collection("ai_jobs").create({
        user: user.id, type: "generate-meal-plan", status: "pending",
        input: { remaining_calories, remaining_protein, remaining_carbs, remaining_fat, logged_meal_types, tier: getTier(user) },
      });
      processJob(record.id).catch((err) => console.error("[job-processor-error]", record.id, err));
      return c.json({ job_id: record.id }, 202);
    } catch (err) { return apiError(c, err); }
  });

  // ── 9. POST /api/jobs/generate-weekly-meal-plan ───────────────────────────
  app.post("/api/jobs/generate-weekly-meal-plan", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      const body = await c.req.json().catch(() => ({}));
      const { daily_calories, daily_protein, daily_carbs, daily_fat, goal = "maintain", week_start } = body ?? {};
      if (daily_calories == null) return c.json({ error: "Se requieren los macros diarios objetivo" }, 400);
      if (!(await checkJobLimit(user.id))) {
        return c.json({ error: `Solo puedes tener ${MAX_PENDING_JOBS} analisis en proceso a la vez. Espera a que termine uno.` }, 429);
      }
      const pb = await getAdminPB();
      const record = await pb.collection("ai_jobs").create({
        user: user.id, type: "generate-weekly-meal-plan", status: "pending",
        input: { daily_calories, daily_protein, daily_carbs, daily_fat, goal, week_start: week_start || null, tier: getTier(user) },
      });
      processJob(record.id).catch((err) => console.error("[job-processor-error]", record.id, err));
      return c.json({ job_id: record.id }, 202);
    } catch (err) { return apiError(c, err); }
  });

  // ── 10. POST /api/weekly-plan/regenerate-day ─────────────────────────────
  app.post("/api/weekly-plan/regenerate-day", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      const body = await c.req.json().catch(() => ({}));
      const { plan_day_id } = body ?? {};
      if (!plan_day_id) return c.json({ error: "Se requiere plan_day_id" }, 400);
      const pb = await getAdminPB();
      let dayRecord: any;
      try { dayRecord = await pb.collection("weekly_plan_days").getOne(plan_day_id); }
      catch (err: any) { if (err?.status === 404) return c.json({ error: "Día no encontrado" }, 404); throw err; }
      if (dayRecord.user !== user.id) return c.json({ error: "Día no encontrado" }, 404);
      const plan = await pb.collection("weekly_meal_plans").getOne(dayRecord.plan);
      const snapshot = typeof plan.goal_snapshot === "string" ? JSON.parse(plan.goal_snapshot) : plan.goal_snapshot;
      const result = await generateDailyMealPlan({
        remainingCalories: Number(snapshot.calories),
        remainingProtein: Number(snapshot.protein),
        remainingCarbs: Number(snapshot.carbs),
        remainingFat: Number(snapshot.fat),
        loggedMealTypes: [],
        tier: getTier(user),
      });
      const meals = result.meals.map((m: any, i: number) => ({
        ...m, id: `${plan_day_id}_${i}_${Date.now()}`, logged: false,
      }));
      await pb.collection("weekly_plan_days").update(plan_day_id, { meals, notes: result.notes });
      return c.json({ id: plan_day_id, meals, notes: result.notes, model_used: result.model_used });
    } catch (err: any) {
      if (err?.status === 404) return c.json({ error: "Día no encontrado" }, 404);
      return apiError(c, err);
    }
  });

  // ── 11. GET /api/jobs/:id ─────────────────────────────────────────────────
  app.get("/api/jobs/:id", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    try {
      const pb = await getAdminPB();
      let job: any;
      try { job = await pb.collection("ai_jobs").getOne(c.req.param("id")); }
      catch (err: any) { if (err?.status === 404) return c.json({ error: "Trabajo no encontrado" }, 404); throw err; }
      if (job.user !== user.id) return c.json({ error: "Trabajo no encontrado" }, 404);
      return c.json({ id: job.id, type: job.type, status: job.status, result: job.result, error: job.error, created: job.created, updated: job.updated });
    } catch (err) { return apiError(c, err); }
  });
```

- [ ] **Step 2: tsc limpio**

```bash
cd mcp-server && npx tsc --noEmit 2>&1 | head -30
# esperado: sin output
```

---

## Task 4: Agregar rutas 12–14 (score-meal-quality, weekly-insight, free-session SSE)

**Files:**
- Modify: `mcp-server/src/mcpuse/api-routes.ts` — insertar rutas 12–14 y el `console.error` final

- [ ] **Step 1: Agregar rutas 12–14 y el log final dentro de `registerApiRoutes`**

```typescript
  // ── 12. POST /api/score-meal-quality ─────────────────────────────────────
  app.post("/api/score-meal-quality", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      const body = await c.req.json().catch(() => ({}));
      const { foods, totals, meal_type } = body ?? {};
      if (!foods?.length || !totals || !meal_type) return c.json({ error: "Se requieren foods, totals y meal_type" }, 400);
      let userContext: UserContext | undefined;
      try {
        const ctx: UserContext = {};
        if (body.goal) ctx.goal = body.goal;
        if (body.log_hour != null) ctx.logHour = Number(body.log_hour);
        if (body.remaining_macros) ctx.remainingMacros = body.remaining_macros;
        if (body.recent_scores) ctx.recentScores = body.recent_scores;
        if (body.top_foods) ctx.topFoods = body.top_foods;
        if (Object.keys(ctx).length > 0) userContext = ctx;
      } catch { /* ignore */ }
      const quality = await scoreMealQuality({ foods, totals, mealType: meal_type, tier: getTier(user), userContext });
      return c.json({ quality });
    } catch (err) { return apiError(c, err); }
  });

  // ── 13. POST /api/generate-weekly-insight ────────────────────────────────
  app.post("/api/generate-weekly-insight", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      const body = await c.req.json().catch(() => ({}));
      const { meals, goal, previous_week_score } = body ?? {};
      if (!meals?.length) return c.json({ error: "Se requieren las comidas de la semana" }, 400);
      const { generateWeeklyInsight } = await import("../api/weekly-insight-generator.js");
      const result = await generateWeeklyInsight({ meals, goal, previousWeekScore: previous_week_score, tier: getTier(user) });
      return c.json(result);
    } catch (err) { return apiError(c, err); }
  });

  // ── 14. POST /api/generate-free-session (SSE streaming) ──────────────────
  app.post("/api/generate-free-session", async (c) => {
    const user = await getAuthUser(c, pbUrl);
    if (!user) return c.json({ error: "Token de autenticación requerido" }, 401);
    const rl = applyRateLimit(c, user.id);
    if (rl.exceeded) return c.json({ error: "Demasiadas solicitudes. Intenta de nuevo en un momento.", retry_after_ms: rl.retryAfterMs }, 429);
    try {
      const body = await c.req.json().catch(() => ({}));
      const { messages = [], userContext = {} } = body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return c.json({ error: "Se requiere al menos un mensaje" }, 400);
      }
      return await runFreeSession(messages, userContext, user);
    } catch (err) { return apiError(c, err); }
  });

  console.error("[API] Hono routes mounted: /api/health + 13 /api/* endpoints");
```

- [ ] **Step 2: tsc limpio**

```bash
cd mcp-server && npx tsc --noEmit 2>&1 | head -30
# esperado: sin output
```

---

## Task 5: Wire `registerApiRoutes` en `server.ts`

**Files:**
- Modify: `mcp-server/src/server.ts` — agregar import y llamada antes de `server.listen(PORT)`

- [ ] **Step 1: Agregar import en server.ts (junto a registerOAuthRoutes)**

```typescript
import { registerApiRoutes } from "./mcpuse/api-routes.js";
```

- [ ] **Step 2: Agregar llamada antes de `server.listen(PORT)`**

Después de `registerOAuthRoutes(server, PB_URL, SERVER_URL);`, agregar:

```typescript
// ── REST /api/* routes (Phase 6) ──────────────────────────────────────────
registerApiRoutes(server, PB_URL);
```

- [ ] **Step 3: tsc limpio — gate final antes de smoke test**

```bash
cd mcp-server && npx tsc --noEmit 2>&1 | head -30
# esperado: sin output (0 errores)
```

---

## Task 6: Smoke test manual

**Prerequisitos:** PocketBase corriendo + `PORT=3210 npx tsx src/server.ts` (no `src/index.ts`).

- [ ] **Step 1: Levantar PocketBase en background**

```bash
cd /Users/guillermomarin/Documents/ejercicios/calistenia-app
./pocketbase serve --http 127.0.0.1:8090 --dir pb_data &
sleep 2
```

- [ ] **Step 2: Levantar server.ts (mcp-use) en background**

```bash
cd mcp-server && PORT=3210 npx tsx src/server.ts &
sleep 3
# verificar: debe aparecer "[Calistenia] mcp-use server on http://localhost:3210"
# y: "[API] Hono routes mounted: /api/health + 13 /api/* endpoints"
# y: "[OAuth] Hono routes mounted: /authorize /token ..."
```

- [ ] **Step 3: Smoke test GET /api/health (sin auth)**

```bash
curl -s http://localhost:3210/api/health | jq .
# esperado: { "status": "ok", "timestamp": "...", "providers": {...}, "defaults": {...} }
```

- [ ] **Step 4: Obtener token PocketBase para tests con auth**

```bash
# Credenciales locales en /tmp/handoff-mcpuse-fase5.md
TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/collections/users/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"<email>","password":"<password>"}' | jq -r '.token')
echo "TOKEN=$TOKEN"
```

- [ ] **Step 5: Smoke test POST /api/lookup-food (auth + JSON)**

```bash
curl -s -X POST http://localhost:3210/api/lookup-food \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"food_name":"arroz"}' | jq .status
# esperado: 200 con campos de alimento, o 502 si no hay ANTHROPIC_API_KEY en env
```

- [ ] **Step 6: Smoke test 401 sin token**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3210/api/lookup-food \
  -H "Content-Type: application/json" \
  -d '{"food_name":"arroz"}'
# esperado: 401
```

- [ ] **Step 7: Smoke test GET /api/jobs/:id (404 para ID inexistente)**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:3210/api/jobs/nonexistent123
# esperado: 404
```

- [ ] **Step 8: Verificar que /mcp y OAuth siguen funcionando (regresión Fase 5)**

```bash
curl -s http://localhost:3210/.well-known/oauth-authorization-server | jq .issuer
# esperado: "http://localhost:3210"
curl -s http://localhost:3210/health | jq .status
# esperado: "ok"
```

- [ ] **Step 9: Cerrar procesos de test**

```bash
pkill -f "tsx src/server.ts" 2>/dev/null || true
pkill -f "pocketbase serve" 2>/dev/null || true
```

---

## Task 7: Commit

- [ ] **Step 1: Verificar archivos modificados**

```bash
cd /Users/guillermomarin/Documents/ejercicios/calistenia-app
git status
# esperado: modified: mcp-server/src/api/free-session-generator.ts
#           modified: mcp-server/src/server.ts
#           new file: mcp-server/src/mcpuse/api-routes.ts
```

- [ ] **Step 2: Commit con paths explícitos**

```bash
git add mcp-server/src/mcpuse/api-routes.ts \
        mcp-server/src/api/free-session-generator.ts \
        mcp-server/src/server.ts
git commit -m "$(cat <<'EOF'
feat(mcp-server): fase 6 — 14 rutas REST /api/* portadas a Hono (mcp-use)

Migra todas las rutas Express de src/api/index.ts a src/mcpuse/api-routes.ts
usando Hono nativo: auth PocketBase inline, rate-limit in-memory, multipart
via formData(), SSE via toUIMessageStreamResponse(). Wire en server.ts antes
de listen(). src/index.ts sigue vivo solo por Express legacy (Fase 7 lo elimina).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ 14 rutas portadas (1 GET health, 8 POST sync, 4 POST async jobs, 1 GET job status)
- ✅ Auth PocketBase inline sin Express middleware
- ✅ Rate limiter in-memory portado (mismo windowMs/maxRequests de config)
- ✅ Multipart vía `c.req.formData()` (multer eliminado para estas rutas)
- ✅ SSE vía `result.toUIMessageStreamResponse()` (Web API Response)
- ✅ `runFreeSession` export en free-session-generator.ts
- ✅ Wire en server.ts antes de `listen()`
- ✅ `tsc --noEmit` gate en cada task
- ✅ Contrato de endpoints preservado (mismos paths, mismos status codes)
- ✅ `src/index.ts` y `src/api/index.ts` sin modificar
- ✅ Job limit check replicado (MAX_PENDING_JOBS = 2)
- ✅ x-internal-key para `/api/send-push`
- ✅ dynamic import para weekly-insight-generator
