import type { MCPServer } from "mcp-use/server";
import type PocketBase from "pocketbase";
import { z } from "zod";
import { getAuthManager } from "../mcpuse/auth-bridge.js";
import { errorResult, ResponseFormat, today } from "../utils.js";
import {
  generatePantryPlan,
  type PantryPlanGoals,
  type PantrySnapshotItem,
} from "../api/pantry-plan-generator.js";
import { getAdminPB, hasJobCapacity, MAX_PENDING_JOBS, processJob } from "../api/job-processor.js";
import { resolveTier } from "../api/model-resolver.js";
import { parsePantryText, matchConsumption, parseReceipt } from "../api/pantry-parser.js";
import { normalizeName, canonCurrency } from "../api/receipt-sanitizer.js";
import { PANTRY_CATEGORIES, PANTRY_UNITS } from "../api/schemas.js";

function mapPantryItems(records: Array<Record<string, unknown>>): PantrySnapshotItem[] {
  return records.slice(0, 200).map((r) => ({
    name: String(r.name ?? ""),
    name_normalized: String(r.name_normalized ?? ""),
    category: String(r.category ?? "otro"),
    quantity: r.quantity != null && r.quantity !== "" ? Number(r.quantity) : null,
    unit: (r.unit as string) || null,
    // PB "date" fields come back as full timestamps ("2026-07-15 00:00:00.000Z");
    // the plan generator only cares about the date part.
    expiry_estimate: r.expiry_estimate ? String(r.expiry_estimate).slice(0, 10) : null,
    confidence: (r.confidence as string) || null,
  }));
}

function mapGoals(goals: Record<string, unknown> | null): PantryPlanGoals | null {
  if (!goals) return null;
  return {
    calories: Number(goals.daily_calories ?? 0),
    protein: Number(goals.daily_protein ?? 0),
    carbs: Number(goals.daily_carbs ?? 0),
    fat: Number(goals.daily_fat ?? 0),
  };
}

/** Active pantry_items for a user, most recent first. Used by every plan/parse/match tool. */
async function getActivePantryItems(pb: PocketBase, userId: string): Promise<Array<Record<string, unknown>>> {
  return pb.collection("pantry_items").getFullList({
    filter: pb.filter('user = {:uid} && status = "active"', { uid: userId }),
    sort: "-created",
    requestKey: null,
  });
}

interface PantryPlanInputs {
  pantryRecords: Array<Record<string, unknown>>;
  goals: PantryPlanGoals | null;
  userRecord: Record<string, unknown> | null;
}

/** Shared preamble for the 3 plan tools (day / how_many_meals / week). */
async function loadPantryPlanInputs(pb: PocketBase, userId: string): Promise<PantryPlanInputs> {
  const [pantryRecords, goalsRecord, userRecord] = await Promise.all([
    getActivePantryItems(pb, userId),
    pb
      .collection("nutrition_goals")
      .getFirstListItem(pb.filter("user = {:userId}", { userId }), { requestKey: null })
      .catch(() => null),
    pb.collection("users").getOne(userId, { requestKey: null }).catch(() => null),
  ]);
  return { pantryRecords, goals: mapGoals(goalsRecord), userRecord };
}

const MEAL_EMOJI: Record<string, string> = { desayuno: "🌅", almuerzo: "☀️", cena: "🌙", snack: "🍎" };

const EMPTY_PANTRY_MSG =
  "Tu despensa está vacía. Agrega items primero desde la app (por chat o escaneando un recibo) antes de generar un plan.";

// Copia local de toUSD (packages/core/lib/money.ts — mcp-server está fuera del
// workspace pnpm y no puede importarlo). Tasa inválida (≤0/NaN) → null, nunca inventar dinero.
function toUSD(amount: number, rate: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) return null;
  return amount / rate;
}

const isValidISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// Copia local de expiryFromDays (packages/core/lib/pantry.ts — mcp-server está fuera del
// workspace pnpm y no puede importarlo). Calendario puro (sin zona horaria) para evitar
// depender de dayjs/tz aquí; mantener en sync con el core si cambia la semántica.
function expiryFromDays(days: number | null | undefined, base: string): string | null {
  if (days == null || !base) return null;
  const [y, m, d] = base.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

const PantryItemInputSchema = z
  .object({
    name: z.string().min(1).max(120).describe("Item name as the user said it, e.g. 'pechuga de pollo'"),
    category: z.enum(PANTRY_CATEGORIES).optional().describe("Food category; omit if unknown"),
    quantity: z.number().optional().describe("Quantity; omit if unknown"),
    unit: z.enum(PANTRY_UNITS).optional().describe("Unit; omit if unknown"),
    price_total: z.number().optional().describe("Total price paid for this item, in the batch's `currency`"),
    expiry_estimate: z
      .string()
      .optional()
      .describe("Estimated expiry date (YYYY-MM-DD); omit if unknown. Wins over expiry_days if both are set."),
    expiry_days: z
      .number()
      .nullable()
      .optional()
      .describe(
        "Estimated days until expiry, relative to purchase_date (as emitted by cal_parse_pantry_message/cal_scan_receipt). Ignored if expiry_estimate is also set."
      ),
    confidence: z.enum(["high", "med", "low"]).optional().describe("Extraction confidence"),
  })
  .strict();

const MAX_RECEIPT_IMAGE_BYTES = 5 * 1024 * 1024;

export function registerPantryTools(server: MCPServer, pbUrl: string) {
  // ──────────────────────────────────────────────────────────────
  // GENERATE PANTRY DAY PLAN
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_generate_pantry_day_plan",
      title: "Generate Pantry-Aware Day Plan",
      description:
        "Generate a full day of meals (desayuno, almuerzo, cena, snack) with recipes, using only what's currently in the user's pantry. Synchronous — calls an AI model, so it can take a few seconds.",
      schema: z
        .object({
          target_date: z.string().optional().describe("Target date for the plan (YYYY-MM-DD). Defaults to tomorrow."),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ target_date, response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();

        const { pantryRecords, goals, userRecord } = await loadPantryPlanInputs(pb, userId);

        if (pantryRecords.length === 0) {
          return errorResult(EMPTY_PANTRY_MSG);
        }

        const pantryItems = mapPantryItems(pantryRecords);
        const tier = resolveTier(userRecord);

        const result: Record<string, any> = await generatePantryPlan({
          horizon: "day",
          pantryItems,
          goals,
          targetDate: target_date ?? null,
          tier,
        });

        const meals = (result.meals as Array<Record<string, any>>) ?? [];
        const notes = (result.notes as string) ?? "";

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(result, null, 2);
        } else {
          const lines = [`# Plan del día${target_date ? ` (${target_date})` : ""}\n`];
          for (const m of meals) {
            lines.push(`## ${MEAL_EMOJI[m.meal_type] ?? "🍽️"} ${m.meal_type} — ${m.label}`);
            lines.push(m.description);
            lines.push(
              `**${Math.round(m.calories)} kcal** | P: ${m.protein}g | C: ${m.carbs}g | G: ${m.fat}g`
            );
            if (m.recipe) {
              lines.push(`\n**Receta** (${m.recipe.prep_minutes ?? "?"} min):`);
              for (const step of m.recipe.steps ?? []) lines.push(`  - ${step}`);
            }
            lines.push("");
          }
          if (notes) lines.push(`---\n${notes}`);
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: result };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // HOW MANY MEALS
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_how_many_meals",
      title: "How Many Meals Left in Pantry",
      description:
        "Estimate how many complete meals the user's current pantry can produce, broken down by meal type, and which ingredient runs out first for each. Does not generate a plan.",
      schema: z
        .object({
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();

        const { pantryRecords, goals, userRecord } = await loadPantryPlanInputs(pb, userId);

        if (pantryRecords.length === 0) {
          return errorResult(EMPTY_PANTRY_MSG);
        }

        const pantryItems = mapPantryItems(pantryRecords);
        const tier = resolveTier(userRecord);

        const result: Record<string, any> = await generatePantryPlan({
          horizon: "how_many_meals",
          pantryItems,
          goals,
          targetDate: null,
          tier,
        });

        const breakdown = (result.breakdown as Array<Record<string, any>>) ?? [];

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(result, null, 2);
        } else {
          const lines = [
            `# ¿Cuántas comidas te alcanzan?\n`,
            `**${result.total_meals} comidas completas** (~${result.days_covered} días)\n`,
            `## Desglose`,
          ];
          for (const b of breakdown) {
            lines.push(`- ${b.meal_label}: ${b.times_possible}× (limita: ${b.limiting_ingredient})`);
          }
          if (result.summary) lines.push(`\n${result.summary}`);
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: result };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // GENERATE PANTRY WEEK PLAN (async job)
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_generate_pantry_week_plan",
      title: "Generate Pantry-Aware Week Plan",
      description:
        "Queue generation of a full 7-day meal plan (with recipes) from the user's pantry and macro goals. Runs as a background job — poll with cal_get_job_status using the returned job_id. Requires nutrition goals to be set.",
      schema: z
        .object({
          week_start: z.string().optional().describe("Monday of the target week (YYYY-MM-DD). Defaults to the current week."),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ week_start }, ctx) => {
      try {
        // Sin validar, una fecha corrupta llega hasta resolveWeekStart().toISOString()
        // en el job processor y lo tumba DESPUÉS de gastar la llamada a IA y archivar
        // el plan activo del usuario — cortar aquí, antes de encolar nada.
        if (week_start && !isValidISODate(week_start)) {
          return errorResult("week_start inválido, usa formato YYYY-MM-DD.");
        }

        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();

        const { pantryRecords, goals, userRecord } = await loadPantryPlanInputs(pb, userId);

        if (pantryRecords.length === 0) {
          return errorResult(EMPTY_PANTRY_MSG);
        }

        if (!goals) {
          return errorResult("No tienes metas de macros configuradas. Usa `cal_update_nutrition_goals` primero.");
        }

        const canQueue = await hasJobCapacity(userId);
        if (!canQueue) {
          return errorResult(
            `Solo puedes tener ${MAX_PENDING_JOBS} análisis en proceso a la vez. Espera a que termine uno (revisa con \`cal_get_job_status\`).`
          );
        }

        const pantryItems = mapPantryItems(pantryRecords);
        const tier = resolveTier(userRecord);

        const adminPb = await getAdminPB();
        const record = await adminPb.collection("ai_jobs").create({
          user: userId,
          type: "generate-pantry-plan",
          status: "pending",
          // tier resuelto aquí, igual que getTier(user) en las rutas REST — sin esto
          // el job processor cae a "free" por default y un usuario pro pierde su tier.
          input: { week_start: week_start || null, pantry_items: pantryItems, goals, tier },
        });

        processJob(record.id).catch((err) => console.error("[job-processor-error]", record.id, err));

        return {
          content: [
            {
              type: "text",
              text: `Generando tu plan semanal desde la despensa… usa \`cal_get_job_status\` con job_id \`${record.id}\` en unos segundos para revisar el estado.`,
            },
          ],
          structuredContent: { job_id: record.id, status: "pending" },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // GET JOB STATUS
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_get_job_status",
      title: "Get Background Job Status",
      description:
        "Check the status of a background AI job (e.g. a queued pantry week plan from cal_generate_pantry_week_plan). Returns the full result once completed.",
      schema: z
        .object({
          job_id: z.string().describe("The ai_jobs record ID returned when the job was queued"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ job_id }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();

        let job: Record<string, any>;
        try {
          job = await pb.collection("ai_jobs").getOne(job_id, { requestKey: null });
        } catch (err: any) {
          if (err?.status === 404) return errorResult("Trabajo no encontrado.");
          throw err;
        }
        // Defense in depth: ai_jobs viewRule already restricts to the owner,
        // but don't leak another user's job if that rule ever changes.
        if (job.user !== userId) {
          return errorResult("Trabajo no encontrado.");
        }

        const statusLabels: Record<string, string> = {
          pending: "En cola",
          processing: "Generando…",
          completed: "Listo",
          failed: "Falló",
        };
        const lines = [`# Estado del trabajo \`${job.id}\``, `**${statusLabels[job.status] ?? job.status}**`];
        if (job.status === "failed" && job.error) lines.push(`Error: ${job.error}`);
        if (job.status === "completed") lines.push("El resultado completo está en structuredContent.");

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: {
            id: job.id,
            type: job.type,
            status: job.status,
            result: job.result ?? null,
            error: job.error ?? null,
            created: job.created,
            updated: job.updated,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // PARSE PANTRY MESSAGE (parse-only)
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_parse_pantry_message",
      title: "Parse Pantry Chat Message",
      description:
        "Parse a free-text message about the user's pantry (e.g. 'compré 2kg de arroz y pollo', 'se me acabó el aceite') into structured items and an intent (add/consume/discard/query/unknown). PARSE-ONLY — does not write anything. After confirming the parsed items with the user, call `cal_add_pantry_items` to persist them.",
      schema: z
        .object({
          text: z.string().min(1).max(1000).describe("The user's message about their pantry, in Spanish"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ text }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();

        const activeItems = await getActivePantryItems(pb, userId);
        const existingItems = activeItems.slice(0, 200).map((r) => String(r.name_normalized ?? ""));

        const result = await parsePantryText({ text, existingItems });

        const lines = [`# Despensa: intención detectada — \`${result.intent}\``, "", result.reply];
        if (result.items.length > 0) {
          lines.push("", "## Items detectados");
          for (const it of result.items) {
            const qty = it.quantity != null ? `${it.quantity}${it.unit ? ` ${it.unit}` : ""}` : "cantidad desconocida";
            const price = it.price_total != null ? ` — $${it.price_total}` : "";
            lines.push(`- **${it.name}** (${it.category}) — ${qty}${price} [confianza: ${it.confidence}]`);
          }
        }
        lines.push("", "_Confirma con el usuario antes de guardar. Para persistir, usa `cal_add_pantry_items`._");

        return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: result };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // ADD PANTRY ITEMS (persist)
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_add_pantry_items",
      title: "Add Pantry Items",
      description:
        "Persist one or more items into the user's pantry (creates pantry_items + a matching pantry_events 'add' record for each). Use this after the user confirms items parsed by cal_parse_pantry_message or cal_scan_receipt.",
      schema: z
        .object({
          items: z.array(PantryItemInputSchema).min(1).max(50),
          source: z
            .enum(["chat", "receipt", "shopping", "manual"])
            .default("chat")
            .describe("Where these items came from"),
          purchase_date: z
            .string()
            .optional()
            .describe("Purchase date for all items in this batch (YYYY-MM-DD). Defaults to today."),
          currency: z
            .string()
            .optional()
            .describe("Currency code of price_total values in this batch (e.g. 'VES', 'EUR'). Defaults to USD."),
          exchange_rate: z
            .number()
            .optional()
            .describe(
              "Units of `currency` per 1 USD at the time of purchase. Needed to compute a USD reference price when currency isn't USD — if omitted, the item is stored without one."
            ),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ items, source, purchase_date, currency, exchange_rate }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();

        // purchase_date puede venir de un LLM: sin validar, una fecha corrupta
        // tumbaría TODO el alta con un 400 de PB (mismo blindaje que useAddPantryItems).
        const baseDate = purchase_date && isValidISODate(purchase_date) ? purchase_date : today();
        const curr = canonCurrency(currency) ?? "USD";
        const rate = curr !== "USD" ? (exchange_rate ?? null) : null;

        const created: Array<{ id: string; name: string; quantity: number | null; unit: string | null }> = [];
        const failed: Array<{ name: string; error: string }> = [];

        for (const it of items) {
          try {
            const isForeign = curr !== "USD" && it.price_total != null;
            const priceUsd = isForeign ? (rate != null ? toUSD(it.price_total!, rate) : null) : (it.price_total ?? null);

            // Absoluta (validada) siempre gana; si no, se deriva de expiry_days
            // relativo a la fecha de compra (misma precedencia que expiryFromDays en el core).
            const expiryEstimate =
              it.expiry_estimate && isValidISODate(it.expiry_estimate)
                ? it.expiry_estimate
                : expiryFromDays(it.expiry_days ?? null, baseDate);

            const rec = await pb.collection("pantry_items").create({
              user: userId,
              name: it.name,
              // SIEMPRE recalculado: un name_normalized con mayúsculas o acentos
              // (LLM) rompería el matching y duplicaría items a futuro.
              name_normalized: normalizeName(it.name),
              category: it.category ?? undefined,
              quantity: it.quantity ?? undefined,
              unit: it.unit ?? undefined,
              price_total: priceUsd ?? undefined,
              currency: "USD",
              price_original: isForeign ? it.price_total : undefined,
              currency_original: isForeign ? curr : undefined,
              exchange_rate: isForeign && rate != null ? rate : undefined,
              price_source: priceUsd != null ? "real" : undefined,
              purchase_date: baseDate,
              expiry_estimate: expiryEstimate ?? undefined,
              confidence: it.confidence ?? undefined,
              status: "active",
              source,
            });

            // REGLA DE ORO: pantry_items.quantity nunca se toca sin su evento.
            try {
              await pb.collection("pantry_events").create({
                user: userId,
                item: rec.id,
                type: "add",
                delta_qty: it.quantity ?? 0,
              });
            } catch (eventErr) {
              // Compensar: sin evento, el item quedaría huérfano — no dejarlo a medias.
              await pb.collection("pantry_items").delete(rec.id).catch(() => {});
              throw eventErr;
            }

            created.push({
              id: rec.id,
              name: String(rec.name ?? it.name),
              quantity: rec.quantity != null && rec.quantity !== "" ? Number(rec.quantity) : null,
              unit: (rec.unit as string) || null,
            });
          } catch (err) {
            failed.push({ name: it.name, error: err instanceof Error ? err.message : String(err) });
          }
        }

        const lines = [`# Despensa actualizada`, "", `${created.length} item(s) agregado(s).`];
        for (const c of created) {
          lines.push(`- ${c.name}${c.quantity != null ? ` (${c.quantity}${c.unit ? ` ${c.unit}` : ""})` : ""}`);
        }
        if (failed.length > 0) {
          lines.push("", `⚠️ ${failed.length} item(s) fallaron:`);
          for (const f of failed) lines.push(`- ${f.name}: ${f.error}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: { created, failed } };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // SCAN RECEIPT (parse-only)
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_scan_receipt",
      title: "Scan Grocery Receipt",
      description:
        "Parse photo(s) of a grocery receipt into pantry items with prices, store name, purchase date and currency (with exchange rate to USD if printed on the receipt). PARSE-ONLY — does not write anything. After confirming with the user, call `cal_add_pantry_items` with source 'receipt' to persist.",
      schema: z
        .object({
          images: z
            .array(
              z.object({
                base64_data: z.string().describe("Base64-encoded photo of the receipt (or a section of it)"),
                mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
              })
            )
            .min(1)
            .max(2)
            .describe(
              "Up to 2 photos of the SAME receipt (e.g. a long receipt split into two shots). Max ~5MB decoded per image."
            ),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ images }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();

        const decoded: { buffer: Buffer; mimeType: string }[] = [];
        for (const img of images) {
          const buffer = Buffer.from(img.base64_data, "base64");
          if (buffer.length > MAX_RECEIPT_IMAGE_BYTES) {
            return errorResult("Una de las imágenes excede el tamaño máximo permitido (5MB).");
          }
          decoded.push({ buffer, mimeType: img.mime_type });
        }

        const userRecord = await pb.collection("users").getOne(userId, { requestKey: null }).catch(() => null);
        const tier = resolveTier(userRecord);

        const result = await parseReceipt({ images: decoded, tier });

        const lines = [
          `# Recibo escaneado${result.store_name ? ` — ${result.store_name}` : ""}`,
          result.purchase_date ? `Fecha: ${result.purchase_date}` : "",
          result.currency
            ? `Moneda: ${result.currency}${result.exchange_rate_usd ? ` (tasa: ${result.exchange_rate_usd})` : ""}`
            : "",
          "",
          "## Items",
        ].filter((l) => l !== "");
        for (const it of result.items) {
          const qty = it.quantity != null ? `${it.quantity}${it.unit ? ` ${it.unit}` : ""}` : "cantidad desconocida";
          const price = it.price_total != null ? ` — ${it.price_total}` : "";
          lines.push(`- **${it.name}** — ${qty}${price}`);
        }
        if (result.ignored_lines.length > 0) {
          lines.push("", `_${result.ignored_lines.length} línea(s) ignorada(s) (no-comida, totales, etc.)_`);
        }
        lines.push(
          "",
          '_Confirma con el usuario antes de guardar. Para persistir, usa `cal_add_pantry_items` con `source: "receipt"`._'
        );

        return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: result };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // MATCH PANTRY CONSUMPTION (read-only)
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_match_pantry_consumption",
      title: "Match Logged Food to Pantry Items",
      description:
        "Given a list of foods just logged as eaten, match them against the user's active pantry items to propose how much of each should be consumed. READ-ONLY — propose these matches to the user, get their confirmation, then call `cal_consume_pantry_matches` to actually deduct from the pantry. NEVER call cal_consume_pantry_matches without user confirmation.",
      schema: z
        .object({
          foods: z
            .array(
              z.object({
                name: z.string().describe("Food name as logged"),
                quantity: z.number().optional().describe("Quantity logged, if known"),
                unit: z.string().optional().describe("Unit of the logged quantity, if known"),
              })
            )
            .min(1)
            .max(30),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ foods }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();

        const activeItems = await getActivePantryItems(pb, userId);
        if (activeItems.length === 0) {
          return errorResult(EMPTY_PANTRY_MSG);
        }
        const pantryItems = activeItems.slice(0, 200).map((r) => ({
          id: String(r.id),
          name_normalized: String(r.name_normalized ?? ""),
          quantity: r.quantity != null && r.quantity !== "" ? Number(r.quantity) : null,
          unit: (r.unit as string) || null,
        }));

        const result = await matchConsumption({
          foods: foods.map((f) => ({ name: f.name, quantity: f.quantity ?? null, unit: f.unit ?? null })),
          pantryItems,
        });

        const lines = [`# Matches propuestos`, ""];
        if (result.matches.length === 0) {
          lines.push("Sin matches con la despensa actual.");
        } else {
          for (const m of result.matches) {
            lines.push(`- **${m.matched_food}** → \`${m.pantry_item_id}\` — ${m.qty_consumed ?? "?"} [confianza: ${m.confidence}]`);
          }
        }
        if (result.unmatched_foods.length > 0) {
          lines.push("", `Sin match: ${result.unmatched_foods.join(", ")}`);
        }
        lines.push("", "_Propón esto al usuario; solo tras su confirmación llama a `cal_consume_pantry_matches`._");

        return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: result };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // CONSUME PANTRY MATCHES (persist, destructive)
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_consume_pantry_matches",
      title: "Consume Matched Pantry Items",
      description:
        "Deduct confirmed quantities from the user's pantry after they've confirmed matches from cal_match_pantry_consumption. Depletes items to 0 and marks them 'depleted' when they run out. Requires explicit user confirmation before calling — this mutates the pantry.",
      schema: z
        .object({
          matches: z
            .array(
              z.object({
                item_id: z.string().describe("pantry_items record id"),
                consumed_qty: z.number().positive().describe("Quantity consumed, in the pantry item's own unit"),
                unit: z
                  .string()
                  .optional()
                  .describe("Informational only; consumption is applied in the item's stored unit"),
              })
            )
            .min(1)
            .max(30),
          linked_entry: z
            .string()
            .optional()
            .describe("nutrition_entries record id this consumption is attributed to, if any"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ matches, linked_entry }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();

        const totalsByItem = new Map<string, number>();
        for (const m of matches) {
          totalsByItem.set(m.item_id, (totalsByItem.get(m.item_id) ?? 0) + m.consumed_qty);
        }

        const results: Array<{ item_id: string; name: string; consumed: number; remaining: number | null; status: string }> = [];
        const failed: Array<{ item_id: string; error: string }> = [];

        for (const [itemId, total] of totalsByItem) {
          try {
            // viewRule restringe a dueño → getOne 404-ea si el item no es del user.
            const item = await pb.collection("pantry_items").getOne(itemId, { requestKey: null });

            // Un evento por match original (granularidad del ledger), ANTES de tocar quantity.
            for (const m of matches) {
              if (m.item_id !== itemId) continue;
              await pb.collection("pantry_events").create({
                user: userId,
                item: itemId,
                type: "consume",
                delta_qty: -m.consumed_qty,
                linked_entry: linked_entry ?? undefined,
              });
            }

            const currentQty = item.quantity != null && item.quantity !== "" ? Number(item.quantity) : null;
            const patch: Record<string, unknown> = { confidence: "high" };
            let remaining: number | null = null;
            // qty null = "sin dato": no se inventa depleción, pero igual se toca
            // el record (bump de `updated` = reset del decay de confianza).
            if (currentQty != null) {
              remaining = Math.max(0, currentQty - total);
              patch.quantity = remaining;
              if (remaining <= 0) patch.status = "depleted";
            }
            await pb.collection("pantry_items").update(itemId, patch);

            results.push({
              item_id: itemId,
              name: String(item.name ?? ""),
              consumed: total,
              remaining,
              status: remaining != null && remaining <= 0 ? "depleted" : "active",
            });
          } catch (err) {
            failed.push({ item_id: itemId, error: err instanceof Error ? err.message : String(err) });
          }
        }

        const lines = [`# Despensa descontada`, ""];
        for (const r of results) {
          const tail = r.remaining != null ? ` → ${r.remaining} restante${r.status === "depleted" ? " (agotado)" : ""}` : "";
          lines.push(`- **${r.name}**: -${r.consumed}${tail}`);
        }
        if (failed.length > 0) {
          lines.push("", `⚠️ ${failed.length} fallaron:`);
          for (const f of failed) lines.push(`- \`${f.item_id}\`: ${f.error}`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: { results, failed } };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
