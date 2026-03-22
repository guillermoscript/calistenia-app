import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";
import { errorResult, PaginationSchema, ResponseFormat, today, daysAgo } from "../utils.js";

export function registerHealthTools(server: McpServer, auth: AuthManager) {
  const pb = auth.getClient();
  const userId = auth.getUserId();

  // ══════════════════════════════════════════════════════════════
  //  SLEEP
  // ══════════════════════════════════════════════════════════════

  server.registerTool(
    "cal_add_sleep",
    {
      title: "Log Sleep Entry",
      description:
        "Log a sleep entry with bedtime, wake time, quality, and optional factors (caffeine, screen, stress).",
      inputSchema: z
        .object({
          date: z.string().describe("Date for this sleep entry (YYYY-MM-DD)"),
          bedtime: z.string().describe("Bedtime (e.g. '23:30' or '11:30 PM')"),
          wake_time: z.string().describe("Wake time (e.g. '07:00' or '7:00 AM')"),
          quality: z.number().int().min(1).max(5).describe("Sleep quality 1-5 (1=terrible, 5=excellent)"),
          duration_minutes: z.number().min(0).describe("Total sleep duration in minutes"),
          awakenings: z.number().int().min(0).default(0).describe("Number of times woken up"),
          caffeine: z.boolean().optional().describe("Had caffeine before bed?"),
          screen_before_bed: z.boolean().optional().describe("Screen time before bed?"),
          stress_level: z.number().int().min(1).max(5).optional().describe("Stress level 1-5"),
          note: z.string().optional().describe("Notes about sleep"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        const record = await pb.collection("sleep_entries").create({
          user: userId,
          date: input.date,
          bedtime: input.bedtime,
          wake_time: input.wake_time,
          quality: input.quality,
          duration_minutes: input.duration_minutes,
          awakenings: input.awakenings,
          caffeine: input.caffeine ?? false,
          screen_before_bed: input.screen_before_bed ?? false,
          stress_level: input.stress_level ?? 0,
          note: input.note || "",
        });

        const hours = Math.floor(input.duration_minutes / 60);
        const mins = input.duration_minutes % 60;

        return {
          content: [
            {
              type: "text",
              text: `Logged sleep for ${input.date}: ${hours}h${mins}m, quality ${input.quality}/5, ${input.awakenings} awakenings`,
            },
          ],
          structuredContent: { id: record.id },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "cal_list_sleep",
    {
      title: "List Sleep Entries",
      description: "View sleep history with averages. Defaults to last 7 days.",
      inputSchema: z
        .object({
          days: z.number().int().min(1).max(365).default(7).describe("Number of days to look back"),
          ...PaginationSchema,
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ days, limit, offset, response_format }) => {
      try {
        const from = daysAgo(days);
        const entries = await pb.collection("sleep_entries").getList(offset / limit + 1, limit, {
          filter: pb.filter('user = {:userId} && date >= {:from}', { userId, from }),
          sort: "-date",
        });

        if (entries.items.length === 0) {
          return { content: [{ type: "text", text: "No sleep entries found." }] };
        }

        const items = entries.items.map((e) => ({
          id: e.id,
          date: (e.date as string).slice(0, 10),
          bedtime: e.bedtime,
          wake_time: e.wake_time,
          duration_minutes: e.duration_minutes,
          quality: e.quality,
          awakenings: e.awakenings,
        }));

        const avgQuality = items.reduce((s, e) => s + (e.quality as number), 0) / items.length;
        const avgDuration = items.reduce((s, e) => s + (e.duration_minutes as number), 0) / items.length;

        const output = {
          count: items.length,
          avg_quality: Math.round(avgQuality * 10) / 10,
          avg_duration_hours: Math.round((avgDuration / 60) * 10) / 10,
          entries: items,
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# Sleep — Last ${days} days`,
            `Avg quality: **${output.avg_quality}/5** · Avg duration: **${output.avg_duration_hours}h**\n`,
          ];
          for (const e of items) {
            const h = Math.floor(e.duration_minutes as number / 60);
            const m = (e.duration_minutes as number) % 60;
            lines.push(`- **${e.date}**: ${h}h${m}m · quality ${e.quality}/5 · ${e.awakenings} wake-ups`);
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ══════════════════════════════════════════════════════════════
  //  WATER
  // ══════════════════════════════════════════════════════════════

  server.registerTool(
    "cal_add_water",
    {
      title: "Log Water Intake",
      description: "Log water intake in milliliters. Call multiple times throughout the day.",
      inputSchema: z
        .object({
          amount_ml: z.number().int().min(1).describe("Amount of water in milliliters (e.g. 250, 500)"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ amount_ml }) => {
      try {
        await pb.collection("water_entries").create({
          user: userId,
          amount_ml,
        });

        // Get today's total
        const todayStr = today();
        const todayEntries = await pb.collection("water_entries").getFullList({
          filter: pb.filter('user = {:userId} && logged_at >= {:todayStr}', { userId, todayStr }),
          fields: 'amount_ml',
        });
        const totalMl = todayEntries.reduce((s, e) => s + (e.amount_ml as number), 0);

        return {
          content: [
            {
              type: "text",
              text: `Logged ${amount_ml}ml water. Today's total: **${totalMl}ml** (${(totalMl / 1000).toFixed(1)}L)`,
            },
          ],
          structuredContent: { amount_ml, today_total_ml: totalMl },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "cal_get_water_today",
    {
      title: "Get Today's Water Intake",
      description: "Get total water intake for today.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      try {
        const todayStr = today();
        const entries = await pb.collection("water_entries").getFullList({
          filter: pb.filter('user = {:userId} && logged_at >= {:todayStr}', { userId, todayStr }),
          sort: "logged_at",
          fields: 'amount_ml',
        });

        const totalMl = entries.reduce((s, e) => s + (e.amount_ml as number), 0);
        const count = entries.length;

        return {
          content: [
            {
              type: "text",
              text: `Today's water: **${totalMl}ml** (${(totalMl / 1000).toFixed(1)}L) from ${count} entries`,
            },
          ],
          structuredContent: { total_ml: totalMl, total_liters: totalMl / 1000, entries: count },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ══════════════════════════════════════════════════════════════
  //  BODY MEASUREMENTS
  // ══════════════════════════════════════════════════════════════

  server.registerTool(
    "cal_add_measurement",
    {
      title: "Log Body Measurements",
      description:
        "Log body circumference measurements in centimeters. All measurement fields are optional — log whichever ones you take.",
      inputSchema: z
        .object({
          date: z.string().optional().describe("Date (YYYY-MM-DD), defaults to today"),
          chest: z.number().min(0).optional().describe("Chest circumference (cm)"),
          waist: z.number().min(0).optional().describe("Waist circumference (cm)"),
          hips: z.number().min(0).optional().describe("Hip circumference (cm)"),
          arm_left: z.number().min(0).optional().describe("Left arm circumference (cm)"),
          arm_right: z.number().min(0).optional().describe("Right arm circumference (cm)"),
          thigh_left: z.number().min(0).optional().describe("Left thigh circumference (cm)"),
          thigh_right: z.number().min(0).optional().describe("Right thigh circumference (cm)"),
          note: z.string().optional().describe("Notes"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        const data: Record<string, unknown> = {
          user: userId,
          date: input.date || today(),
        };
        const parts: string[] = [];
        for (const key of ["chest", "waist", "hips", "arm_left", "arm_right", "thigh_left", "thigh_right"] as const) {
          if (input[key] !== undefined) {
            data[key] = input[key];
            parts.push(`${key.replace("_", " ")}: ${input[key]}cm`);
          }
        }
        if (input.note) data.note = input.note;

        const record = await pb.collection("body_measurements").create(data);

        return {
          content: [
            {
              type: "text",
              text: `Logged measurements for ${data.date}:\n${parts.join(" · ") || "No measurements provided"}`,
            },
          ],
          structuredContent: { id: record.id, date: data.date },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.registerTool(
    "cal_list_measurements",
    {
      title: "List Body Measurements",
      description: "View body measurement history with trends.",
      inputSchema: z
        .object({
          days: z.number().int().min(1).max(365).default(90).describe("Days to look back"),
          ...PaginationSchema,
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ days, limit, offset, response_format }) => {
      try {
        const from = daysAgo(days);
        const result = await pb.collection("body_measurements").getList(offset / limit + 1, limit, {
          filter: pb.filter('user = {:userId} && date >= {:from}', { userId, from }),
          sort: "-date",
        });

        if (result.items.length === 0) {
          return { content: [{ type: "text", text: "No body measurements found." }] };
        }

        const items = result.items.map((e) => ({
          id: e.id,
          date: (e.date as string).slice(0, 10),
          chest: e.chest || null,
          waist: e.waist || null,
          hips: e.hips || null,
          arm_left: e.arm_left || null,
          arm_right: e.arm_right || null,
          thigh_left: e.thigh_left || null,
          thigh_right: e.thigh_right || null,
        }));

        const output = { count: items.length, entries: items };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = [`# Body Measurements — Last ${days} days\n`];
          for (const e of items) {
            const parts: string[] = [];
            if (e.chest) parts.push(`chest ${e.chest}`);
            if (e.waist) parts.push(`waist ${e.waist}`);
            if (e.hips) parts.push(`hips ${e.hips}`);
            if (e.arm_left || e.arm_right) parts.push(`arms ${e.arm_left ?? "–"}/${e.arm_right ?? "–"}`);
            if (e.thigh_left || e.thigh_right) parts.push(`thighs ${e.thigh_left ?? "–"}/${e.thigh_right ?? "–"}`);
            lines.push(`- **${e.date}**: ${parts.join(" · ") || "—"}`);
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
