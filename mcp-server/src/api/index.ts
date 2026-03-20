/**
 * API routes — mounted at /api on the unified server.
 *
 * Provides:
 *   GET  /api/health        — Service status + available AI providers
 *   POST /api/analyze-meal  — AI-powered meal image analysis (requires auth)
 */

import { Router } from "express";
import multer from "multer";
import PocketBase from "pocketbase";
import config, { type AppConfig } from "./config.js";
import { getAvailableProviders } from "./model-resolver.js";
import { analyzeMealImage } from "./meal-analyzer.js";
import { lookupFoodByName } from "./food-lookup.js";
import { generateDailyMealPlan } from "./meal-plan-generator.js";
import { sendPushToUser } from "./push-sender.js";
import type { Tier } from "./model-resolver.js";

// ── Auth error ────────────────────────────────────────────────────────────────

class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
    this.name = "AuthError";
  }
}

// ── Auth middleware ────────────────────────────────────────────────────────────

async function requireAuth(req: any, _res: any, next: any) {
  try {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthError("Token de autenticación requerido");
    }
    const token = authHeader.slice(7);
    const pb = new PocketBase(config.pocketbaseUrl);
    pb.authStore.save(token, null);
    try {
      const result = await pb.collection("users").authRefresh();
      req.user = result.record;
    } catch {
      throw new AuthError("Token inválido o expirado");
    }
    next();
  } catch (err) {
    next(err);
  }
}

// ── Rate limiter ──────────────────────────────────────────────────────────────

interface RateBucket {
  windowStart: number;
  count: number;
}

const buckets = new Map<string, RateBucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > config.rateLimit.windowMs * 2) {
      buckets.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

function rateLimit(req: any, res: any, next: any) {
  const key: string = req.user?.id ?? req.ip;
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > config.rateLimit.windowMs) {
    bucket = { windowStart: now, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count++;

  const remaining = Math.max(0, config.rateLimit.maxRequests - bucket.count);
  const resetAt = new Date(bucket.windowStart + config.rateLimit.windowMs).toISOString();

  res.setHeader("X-RateLimit-Limit", config.rateLimit.maxRequests);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", resetAt);

  if (bucket.count > config.rateLimit.maxRequests) {
    return res.status(429).json({
      error: "Demasiadas solicitudes. Intenta de nuevo en un momento.",
      retry_after_ms: bucket.windowStart + config.rateLimit.windowMs - now,
    });
  }
  next();
}

// ── Upload middleware ──────────────────────────────────────────────────────────

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (config.upload.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no soportado: ${file.mimetype}`));
    }
  },
});

// ── Error handler ─────────────────────────────────────────────────────────────

function apiErrorHandler(err: any, _req: any, res: any, _next: any) {
  if (err instanceof AuthError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "La imagen excede el tamaño máximo permitido" });
    }
    return res.status(400).json({ error: `Error al procesar archivo: ${err.message}` });
  }
  if (err.name === "ZodError") {
    return res.status(422).json({ error: "Datos inválidos", details: err.issues });
  }
  if (err.name?.startsWith("AI_")) {
    console.error("[ai-error]", err.name, err.message, err.cause ?? "");
    return res.status(502).json({
      error: "Error al comunicarse con el servicio de IA. Intenta de nuevo.",
      debug: process.env.NODE_ENV !== "production" ? { type: err.name, message: err.message } : undefined,
    });
  }
  console.error("[unhandled-error]", err.message ?? err);
  return res.status(err.status ?? 500).json({
    error: err.status ? err.message : "Error interno del servidor",
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createApiRouter(): Router {
  const router = Router();

  // Health check
  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      providers: getAvailableProviders(),
      defaults: {
        provider: config.defaultProvider || "auto",
        model_free: config.defaultModelFree || "auto",
        model_pro: config.defaultModelPro || "auto",
      },
    });
  });

  // Meal analysis
  router.post(
    "/analyze-meal",
    requireAuth,
    rateLimit,
    imageUpload.single("image"),
    async (req: any, res: any, next: any) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "Se requiere una imagen de la comida" });
        }
        const mealType = req.body.meal_type ?? "comida";
        const description = req.body.description ?? "";
        const tier: Tier = req.user?.tier === "pro" || req.user?.tier === "premium" ? "pro" : "free";

        const result = await analyzeMealImage({
          imageBuffer: req.file.buffer,
          mimeType: req.file.mimetype,
          mealType,
          description,
          tier,
        });

        return res.json({ meal_type: mealType, model_tier: tier, ...result });
      } catch (err) {
        next(err);
      }
    }
  );

  // Food catalog lookup by name (AI-powered)
  router.post(
    "/lookup-food",
    requireAuth,
    rateLimit,
    async (req: any, res: any, next: any) => {
      try {
        const foodName = req.body?.food_name?.trim();
        if (!foodName) {
          return res.status(400).json({ error: "Se requiere el nombre del alimento" });
        }
        const tier: Tier =
          req.user?.tier === "pro" || req.user?.tier === "premium" ? "pro" : "free";
        const result = await lookupFoodByName({ foodName, tier });
        return res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // Daily meal plan generation (AI-powered)
  router.post(
    "/generate-meal-plan",
    requireAuth,
    rateLimit,
    async (req: any, res: any, next: any) => {
      try {
        const {
          remaining_calories,
          remaining_protein,
          remaining_carbs,
          remaining_fat,
          logged_meal_types = [],
        } = req.body ?? {};

        if (remaining_calories == null) {
          return res.status(400).json({ error: "Se requieren los macros restantes" });
        }
        const tier: Tier =
          req.user?.tier === "pro" || req.user?.tier === "premium" ? "pro" : "free";

        const result = await generateDailyMealPlan({
          remainingCalories: Number(remaining_calories),
          remainingProtein: Number(remaining_protein ?? 0),
          remainingCarbs: Number(remaining_carbs ?? 0),
          remainingFat: Number(remaining_fat ?? 0),
          loggedMealTypes: Array.isArray(logged_meal_types) ? logged_meal_types : [],
          tier,
        });
        return res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // Push notification sending (internal use — authenticated with shared secret or user auth)
  router.post(
    "/send-push",
    requireAuth,
    async (req: any, res: any, next: any) => {
      try {
        const { user_id, title, body, url } = req.body ?? {};
        if (!user_id || !title) {
          return res
            .status(400)
            .json({ error: "Se requiere user_id y title" });
        }
        const result = await sendPushToUser(user_id, { title, body, url });
        return res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // Error handler for API routes
  router.use(apiErrorHandler);

  return router;
}
