/**
 * Background job processor for async AI nutrition tasks.
 *
 * Fetches a job from PocketBase, runs the appropriate AI function,
 * stores the result, and sends a push notification on completion.
 */

import PocketBase from "pocketbase";
import config from "./config.js";
import { analyzeMealImage } from "./meal-analyzer.js";
import { lookupFoodByName } from "./food-lookup.js";
import { generateDailyMealPlan } from "./meal-plan-generator.js";
import { sendPushToUser } from "./push-sender.js";
import type { Tier } from "./model-resolver.js";

// ── Admin PocketBase helper (cached singleton) ──────────────────────────────

let _adminPB: PocketBase | null = null;

export async function getAdminPB(): Promise<PocketBase> {
  if (_adminPB?.authStore.isValid) return _adminPB;

  const pb = new PocketBase(config.pocketbaseUrl);
  await pb.collection("_superusers").authWithPassword(
    process.env.PB_SUPERUSER_EMAIL ?? "",
    process.env.PB_SUPERUSER_PASSWORD ?? ""
  );
  _adminPB = pb;
  return pb;
}

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

        result = await analyzeMealImage({
          images,
          mealType: input.meal_type ?? "comida",
          description: input.description,
          tier,
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

      default:
        throw new Error(`Tipo de trabajo desconocido: ${job.type}`);
    }

    await pb.collection("ai_jobs").update(jobId, {
      status: "completed",
      result,
    });

    await sendPushToUser(job.user, {
      title: notifTitle,
      body: notifBody,
      url: `/nutrition/log?job=${jobId}`,
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
