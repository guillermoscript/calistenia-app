import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";
import { errorResult, PaginationSchema, ResponseFormat, daysAgo, today } from "../utils.js";

export function registerNutritionTools(server: McpServer, auth: AuthManager) {
  const pb = auth.getClient();
  const userId = auth.getUserId();

  // ──────────────────────────────────────────────────────────────
  // GET NUTRITION GOALS
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_get_nutrition_goals",
    {
      title: "Get Nutrition Goals",
      description:
        "Get the user's daily macro targets and body composition goal (muscle gain, fat loss, recomp, maintain).",
      inputSchema: z
        .object({
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ response_format }) => {
      try {
        const goals = await pb
          .collection("nutrition_goals")
          .getFirstListItem(`user = "${userId}"`)
          .catch(() => null);

        if (!goals) {
          return {
            content: [
              {
                type: "text",
                text: "No nutrition goals set. Use `cal_update_nutrition_goals` to configure your daily macro targets and body composition goal.",
              },
            ],
          };
        }

        const output = {
          goal: goals.goal,
          daily_targets: {
            calories: goals.daily_calories,
            protein_g: goals.daily_protein,
            carbs_g: goals.daily_carbs,
            fat_g: goals.daily_fat,
          },
          profile: {
            weight_kg: goals.weight,
            height_cm: goals.height,
            age: goals.age,
            sex: goals.sex,
            activity_level: goals.activity_level,
          },
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const goalLabels: Record<string, string> = {
            muscle_gain: "Muscle Gain",
            fat_loss: "Fat Loss",
            recomp: "Body Recomposition",
            maintain: "Maintain Weight",
          };
          text = [
            `# Nutrition Goals`,
            `**Goal**: ${goalLabels[goals.goal] ?? goals.goal}\n`,
            `## Daily Targets`,
            `- Calories: **${goals.daily_calories} kcal**`,
            `- Protein: **${goals.daily_protein}g**`,
            `- Carbs: **${goals.daily_carbs}g**`,
            `- Fat: **${goals.daily_fat}g**\n`,
            `## Profile`,
            `- Weight: ${goals.weight} kg | Height: ${goals.height} cm | Age: ${goals.age}`,
            `- Sex: ${goals.sex} | Activity: ${goals.activity_level}`,
          ].join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // UPDATE NUTRITION GOALS
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_update_nutrition_goals",
    {
      title: "Update Nutrition Goals",
      description:
        "Set or update daily macro targets and body composition goal. Only provide the fields you want to change.",
      inputSchema: z
        .object({
          goal: z
            .enum(["muscle_gain", "fat_loss", "recomp", "maintain"])
            .optional()
            .describe("Body composition goal"),
          daily_calories: z.number().int().min(500).max(10000).optional().describe("Daily calorie target"),
          daily_protein: z.number().int().min(0).max(500).optional().describe("Daily protein target in grams"),
          daily_carbs: z.number().int().min(0).max(1000).optional().describe("Daily carbohydrate target in grams"),
          daily_fat: z.number().int().min(0).max(500).optional().describe("Daily fat target in grams"),
          weight: z.number().min(20).max(300).optional().describe("Current body weight in kg"),
          height: z.number().min(100).max(250).optional().describe("Height in cm"),
          age: z.number().int().min(10).max(120).optional().describe("Age in years"),
          sex: z.enum(["male", "female"]).optional().describe("Biological sex for TDEE calculation"),
          activity_level: z
            .enum(["sedentary", "light", "moderate", "active", "very_active"])
            .optional()
            .describe(
              "Activity level: sedentary=desk job, light=1-3 days/week, moderate=3-5 days, active=6-7 days, very_active=athlete"
            ),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      try {
        const updates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined) updates[k] = v;
        }

        if (Object.keys(updates).length === 0) {
          return { content: [{ type: "text", text: "No fields to update." }] };
        }

        const existing = await pb
          .collection("nutrition_goals")
          .getFirstListItem(`user = "${userId}"`)
          .catch(() => null);

        let record;
        if (existing) {
          record = await pb.collection("nutrition_goals").update(existing.id, updates);
        } else {
          record = await pb.collection("nutrition_goals").create({ user: userId, ...updates });
        }

        const changed = Object.keys(updates).map((k) => `**${k}**: ${updates[k]}`).join(", ");
        return {
          content: [{ type: "text", text: `Nutrition goals updated: ${changed}` }],
          structuredContent: { id: record.id, updated: updates },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // LIST NUTRITION ENTRIES
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_list_nutrition_entries",
    {
      title: "List Nutrition Entries",
      description:
        "List logged meals with macros. Filter by date range or meal type. Returns entries with foods, calories, protein, carbs, and fat.",
      inputSchema: z
        .object({
          ...PaginationSchema,
          from_date: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to today."),
          to_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
          meal_type: z
            .enum(["desayuno", "almuerzo", "cena", "snack"])
            .optional()
            .describe("Filter by meal type"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, from_date, to_date, meal_type, response_format }) => {
      try {
        const from = from_date ?? today();
        const to = to_date ?? today();

        let filter = `user = "${userId}" && logged_at >= "${from}" && logged_at <= "${to} 23:59:59"`;
        if (meal_type) filter += ` && meal_type = "${meal_type}"`;

        const result = await pb.collection("nutrition_entries").getList(offset / limit + 1, limit, {
          filter,
          sort: "logged_at",
        });

        if (result.items.length === 0) {
          return { content: [{ type: "text", text: "No nutrition entries found for the given filters." }] };
        }

        const entries = result.items.map((e) => ({
          id: e.id,
          meal_type: e.meal_type,
          foods: e.foods as Array<{ name: string; portion: string; calories: number; protein: number; carbs: number; fat: number }>,
          totals: {
            calories: e.total_calories,
            protein_g: e.total_protein,
            carbs_g: e.total_carbs,
            fat_g: e.total_fat,
          },
          ai_model: e.ai_model || null,
          logged_at: e.logged_at,
        }));

        // Day totals
        const dayTotals = entries.reduce(
          (acc, e) => ({
            calories: acc.calories + e.totals.calories,
            protein_g: acc.protein_g + e.totals.protein_g,
            carbs_g: acc.carbs_g + e.totals.carbs_g,
            fat_g: acc.fat_g + e.totals.fat_g,
          }),
          { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
        );

        const output = { total: result.totalItems, count: entries.length, day_totals: dayTotals, entries };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const mealEmoji: Record<string, string> = {
            desayuno: "🌅",
            almuerzo: "☀️",
            cena: "🌙",
            snack: "🍎",
          };
          const lines = [`# Nutrition Log (${from}${from !== to ? ` → ${to}` : ""})\n`];

          for (const e of entries) {
            lines.push(
              `## ${mealEmoji[e.meal_type] ?? "🍽️"} ${e.meal_type} — ${e.logged_at.slice(11, 16)}`
            );
            lines.push(
              `**${e.totals.calories} kcal** | P: ${e.totals.protein_g}g | C: ${e.totals.carbs_g}g | F: ${e.totals.fat_g}g`
            );
            if (e.foods?.length > 0) {
              for (const food of e.foods) {
                lines.push(`  - ${food.name} (${food.portion}): ${food.calories} kcal`);
              }
            }
            lines.push("");
          }

          lines.push(
            `---\n**Day Total**: ${dayTotals.calories} kcal | P: ${dayTotals.protein_g}g | C: ${dayTotals.carbs_g}g | F: ${dayTotals.fat_g}g`
          );
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // ADD NUTRITION ENTRY (manual)
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_add_nutrition_entry",
    {
      title: "Add Nutrition Entry",
      description:
        "Manually log a meal with foods and macros. For AI-based photo analysis, use the Calistenia app directly.",
      inputSchema: z
        .object({
          meal_type: z
            .enum(["desayuno", "almuerzo", "cena", "snack"])
            .describe("Meal type: desayuno=breakfast, almuerzo=lunch, cena=dinner, snack=snack"),
          foods: z
            .array(
              z.object({
                name: z.string().describe("Food name"),
                portion: z.string().describe("Portion size (e.g. '150g', '1 cup', '2 pieces')"),
                calories: z.number().int().min(0).describe("Calories"),
                protein: z.number().min(0).describe("Protein in grams"),
                carbs: z.number().min(0).describe("Carbohydrates in grams"),
                fat: z.number().min(0).describe("Fat in grams"),
              })
            )
            .min(1)
            .describe("List of foods in this meal"),
          logged_at: z.string().optional().describe("Log datetime (ISO 8601). Defaults to now."),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ meal_type, foods, logged_at }) => {
      try {
        const totals = foods.reduce(
          (acc, f) => ({
            calories: acc.calories + f.calories,
            protein: acc.protein + f.protein,
            carbs: acc.carbs + f.carbs,
            fat: acc.fat + f.fat,
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        );

        const record = await pb.collection("nutrition_entries").create({
          user: userId,
          meal_type,
          foods,
          total_calories: Math.round(totals.calories),
          total_protein: Math.round(totals.protein * 10) / 10,
          total_carbs: Math.round(totals.carbs * 10) / 10,
          total_fat: Math.round(totals.fat * 10) / 10,
          ai_model: "manual",
          logged_at: logged_at ?? new Date().toISOString(),
        });

        return {
          content: [
            {
              type: "text",
              text: [
                `Meal logged: **${meal_type}**`,
                `${foods.map((f) => `${f.name} (${f.portion})`).join(", ")}`,
                `**${totals.calories} kcal** | P: ${totals.protein.toFixed(1)}g | C: ${totals.carbs.toFixed(1)}g | F: ${totals.fat.toFixed(1)}g`,
              ].join("\n"),
            },
          ],
          structuredContent: { id: record.id, meal_type, foods, totals },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // DELETE NUTRITION ENTRY
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_delete_nutrition_entry",
    {
      title: "Delete Nutrition Entry",
      description: "Delete a logged meal entry by its ID.",
      inputSchema: z
        .object({ entry_id: z.string().describe("The nutrition entry record ID to delete") })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ entry_id }) => {
      try {
        const record = await pb.collection("nutrition_entries").getOne(entry_id);
        if (record.user !== userId) {
          return errorResult("Access denied: this entry does not belong to you.");
        }
        await pb.collection("nutrition_entries").delete(entry_id);
        return { content: [{ type: "text", text: `Nutrition entry \`${entry_id}\` deleted.` }] };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // NUTRITION SUMMARY
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_get_nutrition_summary",
    {
      title: "Get Nutrition Summary",
      description:
        "Get a nutrition summary for a date range: daily averages vs goals, most-logged meals, and consistency. Great for weekly/monthly nutrition reviews.",
      inputSchema: z
        .object({
          from_date: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 7 days ago."),
          to_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ from_date, to_date, response_format }) => {
      try {
        const from = from_date ?? daysAgo(7);
        const to = to_date ?? today();

        const [entries, goals] = await Promise.all([
          pb.collection("nutrition_entries").getFullList({
            filter: `user = "${userId}" && logged_at >= "${from}" && logged_at <= "${to} 23:59:59"`,
            sort: "logged_at",
          }),
          pb.collection("nutrition_goals").getFirstListItem(`user = "${userId}"`).catch(() => null),
        ]);

        if (entries.length === 0) {
          return { content: [{ type: "text", text: `No nutrition entries found between ${from} and ${to}.` }] };
        }

        // Group by day
        const byDay: Record<string, typeof entries> = {};
        for (const e of entries) {
          const day = (e.logged_at as string).slice(0, 10);
          if (!byDay[day]) byDay[day] = [];
          byDay[day].push(e);
        }

        const daysLogged = Object.keys(byDay).length;
        const totalCalories = entries.reduce((a, e) => a + (e.total_calories as number), 0);
        const totalProtein = entries.reduce((a, e) => a + (e.total_protein as number), 0);
        const totalCarbs = entries.reduce((a, e) => a + (e.total_carbs as number), 0);
        const totalFat = entries.reduce((a, e) => a + (e.total_fat as number), 0);

        const avgCalories = Math.round(totalCalories / daysLogged);
        const avgProtein = Math.round((totalProtein / daysLogged) * 10) / 10;
        const avgCarbs = Math.round((totalCarbs / daysLogged) * 10) / 10;
        const avgFat = Math.round((totalFat / daysLogged) * 10) / 10;

        const output = {
          period: { from, to, days_with_data: daysLogged, total_entries: entries.length },
          daily_averages: { calories: avgCalories, protein_g: avgProtein, carbs_g: avgCarbs, fat_g: avgFat },
          goals: goals
            ? {
                calories: goals.daily_calories,
                protein_g: goals.daily_protein,
                carbs_g: goals.daily_carbs,
                fat_g: goals.daily_fat,
              }
            : null,
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const pct = (actual: number, goal: number) => {
            const p = Math.round((actual / goal) * 100);
            return `${p}% of goal`;
          };

          const lines = [
            `# Nutrition Summary (${from} → ${to})`,
            `**${daysLogged} days** tracked | **${entries.length}** total meals\n`,
            `## Daily Averages`,
            `| Macro | Avg | ${goals ? "Goal | %" : ""} |`,
            `|-------|-----|${goals ? "------|---|" : ""}`,
            `| Calories | ${avgCalories} kcal | ${goals ? `${goals.daily_calories} kcal | ${pct(avgCalories, goals.daily_calories)} |` : ""}`,
            `| Protein | ${avgProtein}g | ${goals ? `${goals.daily_protein}g | ${pct(avgProtein, goals.daily_protein)} |` : ""}`,
            `| Carbs | ${avgCarbs}g | ${goals ? `${goals.daily_carbs}g | ${pct(avgCarbs, goals.daily_carbs)} |` : ""}`,
            `| Fat | ${avgFat}g | ${goals ? `${goals.daily_fat}g | ${pct(avgFat, goals.daily_fat)} |` : ""}`,
          ];
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // SAVE MEAL TEMPLATE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_save_meal_template",
    {
      title: "Save Meal Template",
      description:
        "Save a meal as a reusable template so you can quickly log it again later with cal_log_from_template.",
      inputSchema: z
        .object({
          name: z.string().min(1).describe("Template name (e.g. 'My usual breakfast')"),
          meal_type: z.enum(["desayuno", "almuerzo", "cena", "snack"]).describe("Meal type"),
          foods: z
            .array(
              z.object({
                name: z.string(),
                portion: z.string(),
                calories: z.number().int().min(0),
                protein: z.number().min(0),
                carbs: z.number().min(0),
                fat: z.number().min(0),
              })
            )
            .min(1)
            .describe("Foods in this meal"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ name, meal_type, foods }) => {
      try {
        const record = await pb.collection("meal_templates").create({
          user: userId,
          name,
          meal_type,
          foods,
          usage_count: 0,
        });

        const totals = foods.reduce(
          (acc, f) => ({
            cal: acc.cal + f.calories,
            p: acc.p + f.protein,
            c: acc.c + f.carbs,
            f: acc.f + f.fat,
          }),
          { cal: 0, p: 0, c: 0, f: 0 }
        );

        return {
          content: [
            {
              type: "text",
              text: `Saved template **${name}** (${meal_type}): ${foods.length} foods, ${totals.cal} kcal\nUse \`cal_log_from_template\` with ID \`${record.id}\` to log it.`,
            },
          ],
          structuredContent: { id: record.id, name },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // LIST MEAL TEMPLATES
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_list_meal_templates",
    {
      title: "List Meal Templates",
      description: "List your saved meal templates.",
      inputSchema: z
        .object({
          meal_type: z.enum(["desayuno", "almuerzo", "cena", "snack"]).optional().describe("Filter by meal type"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ meal_type }) => {
      try {
        let filter = `user = "${userId}"`;
        if (meal_type) filter += ` && meal_type = "${meal_type}"`;

        const templates = await pb.collection("meal_templates").getFullList({
          filter,
          sort: "-usage_count,-updated",
        });

        if (templates.length === 0) {
          return { content: [{ type: "text", text: "No meal templates saved yet." }] };
        }

        const items = templates.map((t) => {
          const foods = t.foods as Array<{ name: string; calories: number }>;
          const totalCal = foods.reduce((s, f) => s + f.calories, 0);
          return {
            id: t.id,
            name: t.name,
            meal_type: t.meal_type,
            foods_count: foods.length,
            total_calories: totalCal,
            usage_count: t.usage_count,
          };
        });

        const lines = [`# Meal Templates\n`];
        for (const t of items) {
          lines.push(
            `- **${t.name}** (${t.meal_type}) — ${t.total_calories} kcal, ${t.foods_count} foods · used ${t.usage_count}× · ID: \`${t.id}\``
          );
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: { count: items.length, templates: items },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // LOG FROM TEMPLATE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_log_from_template",
    {
      title: "Log Meal from Template",
      description: "Quickly log a meal using a saved template. Increments the template's usage count.",
      inputSchema: z
        .object({
          template_id: z.string().describe("Meal template ID"),
          logged_at: z.string().optional().describe("Log datetime (ISO 8601). Defaults to now."),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ template_id, logged_at }) => {
      try {
        const template = await pb.collection("meal_templates").getOne(template_id);
        const foods = template.foods as Array<{
          name: string;
          portion: string;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
        }>;

        const totals = foods.reduce(
          (acc, f) => ({
            calories: acc.calories + f.calories,
            protein: acc.protein + f.protein,
            carbs: acc.carbs + f.carbs,
            fat: acc.fat + f.fat,
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        );

        const [entry] = await Promise.all([
          pb.collection("nutrition_entries").create({
            user: userId,
            meal_type: template.meal_type,
            foods,
            total_calories: Math.round(totals.calories),
            total_protein: Math.round(totals.protein * 10) / 10,
            total_carbs: Math.round(totals.carbs * 10) / 10,
            total_fat: Math.round(totals.fat * 10) / 10,
            ai_model: "template",
            logged_at: logged_at ?? new Date().toISOString(),
          }),
          pb.collection("meal_templates").update(template_id, {
            usage_count: ((template.usage_count as number) || 0) + 1,
            last_used_at: new Date().toISOString(),
          }),
        ]);

        return {
          content: [
            {
              type: "text",
              text: `Logged **${template.name}** (${template.meal_type}): ${totals.calories} kcal | P: ${totals.protein.toFixed(1)}g | C: ${totals.carbs.toFixed(1)}g | F: ${totals.fat.toFixed(1)}g`,
            },
          ],
          structuredContent: { entry_id: entry.id, template_name: template.name, totals },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
