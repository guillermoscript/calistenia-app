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
import { analyzeMealImage, scoreMealQuality, type UserContext } from "./meal-analyzer.js";
import { lookupFoodByName } from "./food-lookup.js";
import { generateDailyMealPlan } from "./meal-plan-generator.js";
import { handleGenerateFreeSession } from "./free-session-generator.js";
import { sendPushToUser } from "./push-sender.js";
import { processJob, getAdminPB } from "./job-processor.js";
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
    imageUpload.array("images", 5),
    async (req: any, res: any, next: any) => {
      try {
        const files: Express.Multer.File[] = req.files || [];
        if (files.length === 0) {
          return res.status(400).json({ error: "Se requiere al menos una imagen de la comida" });
        }
        const mealType = req.body.meal_type ?? "comida";
        const description = req.body.description ?? "";
        const tier: Tier = req.user?.tier === "pro" || req.user?.tier === "premium" ? "pro" : "free";

        const images = files.map((f: Express.Multer.File) => ({
          buffer: f.buffer,
          mimeType: f.mimetype,
        }));

        // Build user context for quality scoring
        let userContext: UserContext | undefined;
        try {
          const ctx: UserContext = {};
          if (req.body.goal) ctx.goal = req.body.goal;
          if (req.body.log_hour != null) ctx.logHour = Number(req.body.log_hour);
          if (req.body.remaining_calories != null) {
            ctx.remainingMacros = {
              calories: Number(req.body.remaining_calories),
              protein: Number(req.body.remaining_protein ?? 0),
              carbs: Number(req.body.remaining_carbs ?? 0),
              fat: Number(req.body.remaining_fat ?? 0),
            };
          }
          if (req.body.recent_scores) {
            ctx.recentScores = JSON.parse(req.body.recent_scores);
          }
          if (req.body.top_foods) {
            ctx.topFoods = JSON.parse(req.body.top_foods);
          }
          if (Object.keys(ctx).length > 0) userContext = ctx;
        } catch { /* ignore malformed context */ }

        const result = await analyzeMealImage({
          images,
          mealType,
          description,
          tier,
          userContext,
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

  // Push notification sending (internal use — accepts internal API key OR user auth)
  router.post(
    "/send-push",
    async (req: any, res: any, next: any) => {
      // Allow internal server-to-server calls via shared secret
      const internalKey = process.env.INTERNAL_API_KEY;
      const providedKey = req.headers["x-internal-key"];
      if (internalKey && providedKey === internalKey) {
        return next();
      }
      // Otherwise require normal user auth
      return requireAuth(req, res, next);
    },
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

  // ── Job-based routes (async processing) ───────────────────────────────────

  const MAX_PENDING_JOBS = 2;

  async function checkJobLimit(userId: string, res: any): Promise<boolean> {
    const pb = await getAdminPB();
    const active = await pb.collection("ai_jobs").getList(1, 1, {
      filter: pb.filter(
        "user = {:uid} && (status = 'pending' || status = 'processing')",
        { uid: userId }
      ),
    });
    if (active.totalItems >= MAX_PENDING_JOBS) {
      res.status(429).json({
        error: `Solo puedes tener ${MAX_PENDING_JOBS} analisis en proceso a la vez. Espera a que termine uno.`,
      });
      return false;
    }
    return true;
  }

  // Async meal analysis — returns job ID immediately
  router.post(
    "/jobs/analyze-meal",
    requireAuth,
    rateLimit,
    imageUpload.array("images", 5),
    async (req: any, res: any, next: any) => {
      try {
        const files: Express.Multer.File[] = req.files || [];
        if (files.length === 0) {
          return res.status(400).json({ error: "Se requiere al menos una imagen de la comida" });
        }
        const mealType = req.body.meal_type ?? "comida";
        const description = req.body.description ?? "";
        const tier: Tier = req.user?.tier === "pro" || req.user?.tier === "premium" ? "pro" : "free";

        if (!(await checkJobLimit(req.user.id, res))) return;

        const pb = await getAdminPB();

        // Build FormData to create the PocketBase record with file uploads
        const formData = new FormData();
        formData.append("user", req.user.id);
        formData.append("type", "analyze-meal");
        formData.append("status", "pending");
        formData.append("input", JSON.stringify({ meal_type: mealType, description, tier }));

        for (const file of files) {
          const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
          formData.append("input_images", blob, file.originalname);
        }

        const record = await pb.collection("ai_jobs").create(formData);

        processJob(record.id).catch((err) =>
          console.error("[job-processor-error]", record.id, err)
        );

        return res.status(202).json({ job_id: record.id });
      } catch (err) {
        next(err);
      }
    }
  );

  // Async food lookup — returns job ID immediately
  router.post(
    "/jobs/lookup-food",
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

        if (!(await checkJobLimit(req.user.id, res))) return;

        const pb = await getAdminPB();
        const record = await pb.collection("ai_jobs").create({
          user: req.user.id,
          type: "lookup-food",
          status: "pending",
          input: { food_name: foodName, tier },
        });

        processJob(record.id).catch((err) =>
          console.error("[job-processor-error]", record.id, err)
        );

        return res.status(202).json({ job_id: record.id });
      } catch (err) {
        next(err);
      }
    }
  );

  // Async meal plan generation — returns job ID immediately
  router.post(
    "/jobs/generate-meal-plan",
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

        if (!(await checkJobLimit(req.user.id, res))) return;

        const pb = await getAdminPB();
        const record = await pb.collection("ai_jobs").create({
          user: req.user.id,
          type: "generate-meal-plan",
          status: "pending",
          input: {
            remaining_calories,
            remaining_protein,
            remaining_carbs,
            remaining_fat,
            logged_meal_types,
            tier,
          },
        });

        processJob(record.id).catch((err) =>
          console.error("[job-processor-error]", record.id, err)
        );

        return res.status(202).json({ job_id: record.id });
      } catch (err) {
        next(err);
      }
    }
  );

  // Async weekly meal plan generation — returns job ID immediately
  router.post(
    "/jobs/generate-weekly-meal-plan",
    requireAuth,
    rateLimit,
    async (req: any, res: any, next: any) => {
      try {
        const {
          daily_calories,
          daily_protein,
          daily_carbs,
          daily_fat,
          goal = "maintain",
          week_start,
        } = req.body ?? {};

        if (daily_calories == null) {
          return res.status(400).json({ error: "Se requieren los macros diarios objetivo" });
        }
        const tier: Tier =
          req.user?.tier === "pro" || req.user?.tier === "premium" ? "pro" : "free";

        if (!(await checkJobLimit(req.user.id, res))) return;

        const pb = await getAdminPB();
        const record = await pb.collection("ai_jobs").create({
          user: req.user.id,
          type: "generate-weekly-meal-plan",
          status: "pending",
          input: {
            daily_calories,
            daily_protein,
            daily_carbs,
            daily_fat,
            goal,
            week_start: week_start || null,
            tier,
          },
        });

        processJob(record.id).catch((err) =>
          console.error("[job-processor-error]", record.id, err)
        );

        return res.status(202).json({ job_id: record.id });
      } catch (err) {
        next(err);
      }
    }
  );

  // Synchronous single-day regeneration for weekly plan
  router.post(
    "/weekly-plan/regenerate-day",
    requireAuth,
    rateLimit,
    async (req: any, res: any, next: any) => {
      try {
        const { plan_day_id } = req.body ?? {};
        if (!plan_day_id) {
          return res.status(400).json({ error: "Se requiere plan_day_id" });
        }

        const pb = await getAdminPB();

        // Fetch the day record
        const dayRecord = await pb.collection("weekly_plan_days").getOne(plan_day_id);
        if (dayRecord.user !== req.user.id) {
          return res.status(404).json({ error: "Día no encontrado" });
        }

        // Fetch parent plan for goal snapshot
        const plan = await pb.collection("weekly_meal_plans").getOne(dayRecord.plan);
        const snapshot = typeof plan.goal_snapshot === "string"
          ? JSON.parse(plan.goal_snapshot)
          : plan.goal_snapshot;

        const tier: Tier =
          req.user?.tier === "pro" || req.user?.tier === "premium" ? "pro" : "free";

        // Reuse daily generator with full macros (planning, not remaining)
        const result = await generateDailyMealPlan({
          remainingCalories: Number(snapshot.calories),
          remainingProtein: Number(snapshot.protein),
          remainingCarbs: Number(snapshot.carbs),
          remainingFat: Number(snapshot.fat),
          loggedMealTypes: [],
          tier,
        });

        // Add IDs to meals and reset logged state
        const meals = result.meals.map((m: any, i: number) => ({
          ...m,
          id: `${plan_day_id}_${i}_${Date.now()}`,
          logged: false,
        }));

        await pb.collection("weekly_plan_days").update(plan_day_id, {
          meals,
          notes: result.notes,
        });

        return res.json({
          id: plan_day_id,
          meals,
          notes: result.notes,
          model_used: result.model_used,
        });
      } catch (err: any) {
        if (err.status === 404) {
          return res.status(404).json({ error: "Día no encontrado" });
        }
        next(err);
      }
    }
  );

  // Get job status and result
  router.get(
    "/jobs/:id",
    requireAuth,
    async (req: any, res: any, next: any) => {
      try {
        const pb = await getAdminPB();
        const job = await pb.collection("ai_jobs").getOne(req.params.id);

        if (job.user !== req.user.id) {
          return res.status(404).json({ error: "Trabajo no encontrado" });
        }

        return res.json({
          id: job.id,
          type: job.type,
          status: job.status,
          result: job.result,
          error: job.error,
          created: job.created,
          updated: job.updated,
        });
      } catch (err: any) {
        // PocketBase 404 → return 404
        if (err.status === 404) {
          return res.status(404).json({ error: "Trabajo no encontrado" });
        }
        next(err);
      }
    }
  );

  // ── Nutrition quality scoring (text-only, for manual/barcode entries) ──────

  router.post(
    "/score-meal-quality",
    requireAuth,
    rateLimit,
    async (req: any, res: any, next: any) => {
      try {
        const { foods, totals, meal_type } = req.body ?? {};
        if (!foods?.length || !totals || !meal_type) {
          return res.status(400).json({ error: "Se requieren foods, totals y meal_type" });
        }
        const tier: Tier =
          req.user?.tier === "pro" || req.user?.tier === "premium" ? "pro" : "free";

        let userContext: UserContext | undefined;
        try {
          const ctx: UserContext = {};
          if (req.body.goal) ctx.goal = req.body.goal;
          if (req.body.log_hour != null) ctx.logHour = Number(req.body.log_hour);
          if (req.body.remaining_macros) ctx.remainingMacros = req.body.remaining_macros;
          if (req.body.recent_scores) ctx.recentScores = req.body.recent_scores;
          if (req.body.top_foods) ctx.topFoods = req.body.top_foods;
          if (Object.keys(ctx).length > 0) userContext = ctx;
        } catch { /* ignore */ }

        const quality = await scoreMealQuality({ foods, totals, mealType: meal_type, tier, userContext });
        return res.json({ quality });
      } catch (err) {
        next(err);
      }
    }
  );

  // ── Weekly nutrition insight generation ──────────────────────────────────

  router.post(
    "/generate-weekly-insight",
    requireAuth,
    rateLimit,
    async (req: any, res: any, next: any) => {
      try {
        const { meals, goal, previous_week_score } = req.body ?? {};
        if (!meals?.length) {
          return res.status(400).json({ error: "Se requieren las comidas de la semana" });
        }
        const tier: Tier =
          req.user?.tier === "pro" || req.user?.tier === "premium" ? "pro" : "free";

        const { generateWeeklyInsight } = await import("./weekly-insight-generator.js");
        const result = await generateWeeklyInsight({ meals, goal, previousWeekScore: previous_week_score, tier });
        return res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // Free session generation (AI-powered, streaming)
  router.post(
    "/generate-free-session",
    requireAuth,
    rateLimit,
    async (req: any, res: any, next: any) => {
      try {
        await handleGenerateFreeSession(req, res);
      } catch (err) {
        next(err);
      }
    }
  );

  // Error handler for API routes
  router.use(apiErrorHandler);

  return router;
}
