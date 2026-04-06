/**
 * Background job processor for async AI nutrition tasks.
 *
 * Fetches a job from PocketBase, runs the appropriate AI function,
 * stores the result, and sends a push notification on completion.
 */

import { analyzeMealImage } from "./meal-analyzer.js";
import { lookupFoodByName } from "./food-lookup.js";
import { generateDailyMealPlan, generateWeeklyMealPlan } from "./meal-plan-generator.js";
import { sendPushToUser } from "./push-sender.js";
import { getAdminPB } from "./admin-pb.js";
import type { Tier } from "./model-resolver.js";

// Re-export for any existing consumers
export { getAdminPB } from "./admin-pb.js";

// ── Job processor ────────────────────────────────────────────────────────────

export async function processJob(jobId: string): Promise<void> {
  const pb = await getAdminPB();

  const job = await pb.collection("ai_jobs").getOne(jobId);

  await pb.collection("ai_jobs").update(jobId, { status: "processing" });

  const input = typeof job.input === "string" ? JSON.parse(job.input) : job.input;
  const tier: Tier = input.tier === "pro" || input.tier === "premium" ? "pro" : "free";

  let result: any;
  let notifTitle: string;
  let notifBody: string;

  try {
    switch (job.type) {
      case "analyze-meal": {
        // Download images from PocketBase file URLs
        const imageFileNames: string[] = job.input_images ?? [];
        const images = await Promise.all(
          imageFileNames.map(async (fileName: string) => {
            const url = pb.files.getURL(job, fileName);
            const response = await fetch(url);
            const arrayBuf = await response.arrayBuffer();
            const mimeType =
              response.headers.get("content-type") ?? "image/jpeg";
            return { buffer: Buffer.from(arrayBuf), mimeType };
          })
        );

        // Build user context for quality scoring if provided
        let userContext: import("./meal-analyzer.js").UserContext | undefined;
        if (input.user_context) {
          userContext = input.user_context;
        }

        result = await analyzeMealImage({
          images,
          mealType: input.meal_type ?? "comida",
          description: input.description,
          tier,
          userContext,
        });
        notifTitle = "Comida analizada";
        notifBody = "Toca para revisar los alimentos detectados.";
        break;
      }

      case "lookup-food": {
        result = await lookupFoodByName({
          foodName: input.food_name,
          tier,
        });
        notifTitle = "Alimento encontrado";
        notifBody = `Datos nutricionales de "${input.food_name}" listos.`;
        break;
      }

      case "generate-meal-plan": {
        result = await generateDailyMealPlan({
          remainingCalories: Number(input.remaining_calories ?? 0),
          remainingProtein: Number(input.remaining_protein ?? 0),
          remainingCarbs: Number(input.remaining_carbs ?? 0),
          remainingFat: Number(input.remaining_fat ?? 0),
          loggedMealTypes: Array.isArray(input.logged_meal_types)
            ? input.logged_meal_types
            : [],
          tier,
        });
        notifTitle = "Plan listo";
        notifBody = "Toca para ver las comidas sugeridas.";
        break;
      }

      case "generate-weekly-meal-plan": {
        const weeklyResult = await generateWeeklyMealPlan({
          dailyCalories: Number(input.daily_calories ?? 0),
          dailyProtein: Number(input.daily_protein ?? 0),
          dailyCarbs: Number(input.daily_carbs ?? 0),
          dailyFat: Number(input.daily_fat ?? 0),
          goal: input.goal ?? "maintain",
          tier,
        });

        // Archive any existing active plan for this user
        try {
          const activePlans = await pb.collection("weekly_meal_plans").getFullList({
            filter: pb.filter("user = {:uid} && status = 'active'", { uid: job.user }),
          });
          for (const p of activePlans) {
            await pb.collection("weekly_meal_plans").update(p.id, { status: "archived" });
          }
        } catch { /* no active plans, that's fine */ }

        // Compute week_start (Monday of current or specified week)
        let weekStart: Date;
        if (input.week_start) {
          weekStart = new Date(input.week_start);
        } else {
          weekStart = new Date();
          const dow = weekStart.getDay(); // 0=Sun
          const diff = dow === 0 ? -6 : 1 - dow;
          weekStart.setDate(weekStart.getDate() + diff);
        }
        weekStart.setHours(0, 0, 0, 0);

        // Create the plan record
        const planRecord = await pb.collection("weekly_meal_plans").create({
          user: job.user,
          week_start: weekStart.toISOString(),
          status: "active",
          goal_snapshot: {
            calories: Number(input.daily_calories),
            protein: Number(input.daily_protein),
            carbs: Number(input.daily_carbs),
            fat: Number(input.daily_fat),
          },
          ai_model: weeklyResult.model_used,
        });

        // Create 7 day records
        for (const day of weeklyResult.days) {
          const dayDate = new Date(weekStart);
          dayDate.setDate(dayDate.getDate() + day.day_index);

          const meals = day.meals.map((m: any, i: number) => ({
            ...m,
            id: `${planRecord.id}_d${day.day_index}_${i}`,
            logged: false,
          }));

          await pb.collection("weekly_plan_days").create({
            plan: planRecord.id,
            user: job.user,
            date: dayDate.toISOString(),
            day_index: day.day_index,
            meals,
            notes: day.notes,
          });
        }

        result = { plan_id: planRecord.id, ...weeklyResult };
        notifTitle = "Plan semanal listo";
        notifBody = "Toca para ver tu plan de comidas de la semana.";
        break;
      }

      default:
        throw new Error(`Tipo de trabajo desconocido: ${job.type}`);
    }

    await pb.collection("ai_jobs").update(jobId, {
      status: "completed",
      result,
    });

    const notifUrl = job.type === "generate-weekly-meal-plan"
      ? "/nutrition?tab=weekly"
      : `/nutrition/log?job=${jobId}`;

    await sendPushToUser(job.user, {
      title: notifTitle,
      body: notifBody,
      url: notifUrl,
    }).catch((err) => console.error("[push-error]", err));
  } catch (err: any) {
    const errorMessage = err.message ?? "Error desconocido";

    await pb
      .collection("ai_jobs")
      .update(jobId, { status: "failed", error: errorMessage })
      .catch((e) => console.error("[job-update-error]", e));

    await sendPushToUser(job.user, {
      title: "No se pudo completar el analisis",
      body: "Abre la app para intentar de nuevo.",
      url: "/nutrition",
    }).catch((e) => console.error("[push-error]", e));
  }
}
